import { Component, OnInit, Signal, ViewChild, computed, effect, inject, signal } from "@angular/core";
import { RecurringSchedulesService } from "../../../core/services/recurring-schedules.service";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { DatePipe } from "@angular/common";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { FullCalendarComponent, FullCalendarModule } from "@fullcalendar/angular";
import { CalendarOptions, EventClickArg, EventContentArg, EventDropArg, EventHoveringArg } from "@fullcalendar/core";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import frLocale from "@fullcalendar/core/locales/fr";
import arLocale from "@fullcalendar/core/locales/ar";
import { Activity, CAPACITY_BOUNDS, SessionFormat } from "../../../core/models/activity.model";
import { AttendanceBooking, AttendanceStatus } from "../../../core/models/attendance.model";
import { BookingKind } from "../../../core/models/booking.model";
import { Client } from "../../../core/models/client.model";
import { Coach } from "../../../core/models/coach.model";
import { Session } from "../../../core/models/session.model";
import { Space } from "../../../core/models/space.model";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { RouterLink } from "@angular/router";
import { SpacesService } from "../../../core/services/spaces.service";
import { ActivitiesService } from "../../../core/services/activities.service";
import { AttendanceService } from "../../../core/services/attendance.service";
import { BookingsService } from "../../../core/services/bookings.service";
import { CalendarEvent, CalendarService } from "../../../core/services/calendar.service";
import { ClientsService } from "../../../core/services/clients.service";
import { CoachesService } from "../../../core/services/coaches.service";
import { CompanyService } from "../../../core/services/company.service";
import { LocaleService } from "../../../core/services/locale.service";
import { SessionsService } from "../../../core/services/sessions.service";
import { ThemeService } from "../../../core/services/theme.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { downloadBlob } from "../../../core/services/download.util";
import { AuthService } from "../../../core/auth/auth.service";
import { ModalComponent } from "../../../shared/components/modal.component";
import { SpinnerComponent } from "../../../shared/components/spinner.component";
import { StatusBadgeComponent } from "../../../shared/components/status-badge.component";
import { SearchableSelectComponent } from "../../../shared/ui/searchable-select.component";

// Local calendar date, not UTC — toISOString() would roll a local midnight
// back to the previous day for any timezone ahead of UTC (e.g. Africa/Tunis),
// which silently shifted week-start snapping (backend beginning_of_week) to
// the wrong week.
function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

@Component({
  selector: "app-calendar",
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, DatePipe, TranslateModule, FullCalendarModule, ModalComponent, SpinnerComponent, StatusBadgeComponent, SearchableSelectComponent, RouterLink],
  templateUrl: "./calendar.component.html",
  styleUrl: "./calendar.component.scss",
})
export class CalendarComponent implements OnInit {
  @ViewChild(FullCalendarComponent) private readonly calendarComponent?: FullCalendarComponent;

  readonly coaches = signal<Coach[]>([]);
  readonly activities = signal<Activity[]>([]);
  readonly clients = signal<Client[]>([]);
  readonly clientOptions = computed(() =>
    this.clients().map((c) => ({ value: c.id, label: c.full_name }))
  );

  readonly coachFilter = signal<string | null>(null);
  readonly activityFilter = signal<string | null>(null);
  /** FullCalendar owns the title and the active view; mirrored here so the
   *  page's own toolbar can show them (headerToolbar is off). */
  readonly viewTitle = signal("");
  readonly viewMode = signal<"dayGridMonth" | "timeGridWeek" | "timeGridDay">(
    window.innerWidth < 992 ? "timeGridDay" : "timeGridWeek"
  );

  // Tracks the currently visible view's start date so "print planning"
  // exports the week actually on screen, not always the current one.
  private currentRangeStart = new Date();
  readonly printingSchedule = signal(false);
  /** Printing the week is a Pro tool: locked on Starter and during the trial. */
  readonly canPrint = computed(() => this.configuration.proFeatures());

  readonly canManageSessions: Signal<boolean>;

  private readonly recurring = inject(RecurringSchedulesService);
  readonly stoppingSeries = signal(false);

  private readonly configuration = inject(ConfigurationService);
  private readonly spacesService = inject(SpacesService);
  /** Rooms and cabins — only for a gym that runs them (Settings → Booking). */
  readonly roomsOn = computed(() => !!this.configuration.features()["spaces"]);
  readonly spaces = signal<Space[]>([]);
  /** Whether the desk may book a trial or a single paid session with no contract. */
  readonly dropIn = computed(() => this.configuration.features()["drop_in"] !== false);

  // === session detail ===
  readonly detailOpen = signal(false);
  readonly detailLoading = signal(false);
  readonly selectedSession = signal<Session | null>(null);
  readonly detailBookings = signal<AttendanceBooking[]>([]);
  readonly attendanceStatuses: AttendanceStatus[] = ["present", "absent", "late", "no_show"];
  readonly markingBookingId = signal<string | null>(null);

  readonly addClientSearch = signal("");
  readonly addClientResults = signal<Client[]>([]);
  readonly addingClient = signal(false);

  // === create session ===
  readonly createModalOpen = signal(false);
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);
  // The FullCalendar cell the user actually clicked — kept highlighted while
  // the create-session modal is open so it's obvious which slot the date/
  // time fields were bound from, and cleared once the modal closes.
  private selectedCellEl: HTMLElement | null = null;
  readonly createForm = this.fb.nonNullable.group({
    activity_id: [null as string | null, Validators.required],
    client_id: [null as string | null],
    /** How the member's seat is paid for, when one is named — see BookingsService.create. */
    booking_kind: ["contract" as BookingKind],
    coach_id: [null as string | null],
    space_id: [null as string | null],
    date: [toDateInputValue(new Date()), Validators.required],
    start_time: ["09:00", Validators.required],
    capacity: [null as number | null],
    price: [null as number | null],
    // A class that happens every week at this day and time, until a date.
    repeat_weekly: [false],
    repeat_until: [""],
  });

  /** Session format of the activity picked in the create form (drives capacity + the member field). */
  readonly createFormat = signal<SessionFormat | null>(null);
  readonly createCapacityBounds = signal(CAPACITY_BOUNDS.collective);

  // FullCalendar's own datesSet fires once the view is ready, which is when
  // the events fetcher actually gets attached — calendarApi is only safe to
  // use once the view child has rendered (i.e. after ngAfterViewInit would
  // have run), which every caller here already respects via user interaction.
  private get calendarApi() {
    return this.calendarComponent?.getApi();
  }

  // Business hours shade working days/hours distinctly from closed ones in
  // every FullCalendar view (week, day, month) — driven by the company's
  // configured working days + opening hours (Settings → Gestion
  // planification) instead of a fixed Mon-Sat assumption. Tracked locally
  // since the two settings arrive from separate, independent requests.
  private businessStart = "06:00";
  private businessEnd = "22:00";
  private workingDays: number[] = [0, 1, 2, 3, 4, 5, 6];

  private applyBusinessHours(): void {
    // Closed days are dropped from the grid: a day the gym never opens has
    // no column to show. Today is the exception — a gym closed on Saturday
    // still has a Saturday, and hiding it meant "Aujourd'hui" looked broken.
    // It fired, moved to today, and today had no column, so the view rolled
    // on to the next open week and nothing appeared to happen.
    const today = new Date().getDay();
    const closedDays = [ 0, 1, 2, 3, 4, 5, 6 ].filter(
      (day) => !this.workingDays.includes(day) && day !== today
    );

    this.calendarOptions.update((opts) => ({
      ...opts,
      businessHours: { daysOfWeek: this.workingDays, startTime: this.businessStart, endTime: this.businessEnd },
      hiddenDays: closedDays,
    }));
  }

  readonly calendarOptions = signal<CalendarOptions>({
    plugins: [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin],
    locales: [frLocale, arLocale],
    // A 6-7 day week grid has no room to breathe on a phone screen (each
    // day column collapses to a sliver) — start on the single-day view
    // there instead; "Semaine"/"Mois" are still one tap away.
    initialView: window.innerWidth < 992 ? "timeGridDay" : "timeGridWeek",
    headerToolbar: false,
    height: "auto",
    slotMinTime: "06:00",
    slotMaxTime: "22:00",
    // A gym has no all-day sessions, so the strip above the grid was always
    // empty; dropping it gives the hours back that vertical space.
    allDaySlot: false,
    // Half-hour rows, tall enough to hold the three lines an event renders.
    slotDuration: "00:30:00",
    slotLabelInterval: "01:00",
    slotLabelFormat: { hour: "2-digit", minute: "2-digit", hour12: false },
    expandRows: true,
    // Two sessions at the same hour sit side by side instead of overlapping,
    // so neither hides the other.
    slotEventOverlap: false,
    dayMaxEvents: 3,
    nowIndicator: true,
    selectable: false,
    editable: false,
    eventContent: (arg: EventContentArg) => this.renderEvent(arg),
    eventClick: (arg: EventClickArg) => this.onEventClick(arg),
    eventMouseEnter: (arg: EventHoveringArg) => this.showPreview(arg),
    eventMouseLeave: () => this.hoverPreview.set(null),
    eventDrop: (arg: EventDropArg) => this.onEventDrop(arg),
    dateClick: (arg) => this.onDateClick(arg.date, arg.dayEl),
    datesSet: (arg) => this.onDatesSet(arg.start, arg.end),
  });

  /** The session previewed on hover, and where to pin its card. */
  readonly hoverPreview = signal<{ session: Session; top: number; left: number } | null>(null);

  constructor(
    private readonly fb: FormBuilder,
    private readonly calendarService: CalendarService,
    private readonly sessionsService: SessionsService,
    private readonly coachesService: CoachesService,
    private readonly activitiesService: ActivitiesService,
    private readonly attendanceService: AttendanceService,
    private readonly bookingsService: BookingsService,
    private readonly clientsService: ClientsService,
    private readonly companyService: CompanyService,
    readonly locale: LocaleService,
    readonly theme: ThemeService,
    readonly auth: AuthService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
    private readonly translate: TranslateService
  ) {
    this.canManageSessions = computed(() => this.auth.hasPermission("sessions"));

    // Permissions may land after the calendar renders (cold reload); keep the
    // editable/selectable options in sync when they do. allowSignalWrites
    // because this deliberately mirrors one signal into another.
    effect(
      () => {
        const canManage = this.canManageSessions();
        this.calendarOptions.update((opts) => ({ ...opts, editable: canManage, selectable: canManage }));
      },
      { allowSignalWrites: true }
    );

    // Picking an activity in the "new session" form drives its capacity range
    // and — for individual activities — reveals the member field.
    this.createForm.controls.activity_id.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => this.applyCreateActivity(id));
  }

  private applyCreateActivity(activityId: string | null): void {
    const activity = this.activities().find((a) => a.id === activityId) ?? null;
    const capacity = this.createForm.controls.capacity;
    const clientId = this.createForm.controls.client_id;

    this.createFormat.set(activity?.session_format ?? null);

    if (!activity) {
      capacity.enable({ emitEvent: false });
      capacity.clearValidators();
      clientId.setValue(null, { emitEvent: false });
      clientId.clearValidators();
    } else {
      const bounds = CAPACITY_BOUNDS[activity.session_format];
      this.createCapacityBounds.set(bounds);
      const validators = [Validators.min(bounds.min)];
      if (bounds.max !== null) validators.push(Validators.max(bounds.max));
      capacity.setValidators(validators);
      capacity.setValue(activity.session_format === "individual" ? 1 : activity.capacity, { emitEvent: false });

      // A one-to-one slot may name its member, or stay open for a member to
      // take from their app — how an EMS or personal-training studio fills
      // its week.
      if (activity.session_format === "individual") {
        capacity.disable({ emitEvent: false });
        clientId.clearValidators();
      } else {
        capacity.enable({ emitEvent: false });
        clientId.setValue(null, { emitEvent: false });
        clientId.clearValidators();
      }
    }

    capacity.updateValueAndValidity({ emitEvent: false });
    clientId.updateValueAndValidity({ emitEvent: false });
  }

  ngOnInit(): void {
    // Anyone who can edit the schedule (admin, moderator) can list
    // coaches + activities to fill the "new session" form; a coach gets
    // 403 and keeps empty filters, so these stay best-effort.
    this.coachesService.list().subscribe({ next: (res) => this.coaches.set(res.coaches), error: () => {} });
    this.activitiesService.list().subscribe({ next: (res) => this.activities.set(res.activities), error: () => {} });
    // Members, for the "individual session" picker. Best-effort like the rest.
    if (this.canManageSessions()) {
      this.clientsService.list({ per_page: 100 }).subscribe({ next: (res) => this.clients.set(res.clients), error: () => {} });
      if (this.roomsOn()) {
        this.spacesService.list().subscribe({ next: (res) => this.spaces.set(res.spaces.filter((r) => r.active)), error: () => {} });
      }
    }

    const canManage = this.canManageSessions();
    this.calendarOptions.update((opts) => ({
      ...opts,
      editable: canManage,
      selectable: canManage,
      direction: this.locale.isRtl() ? "rtl" : "ltr",
      locale: this.locale.locale(),
    }));

    // Opening hours and working days both come from the company now — one
    // read instead of two. Best-effort: a coach gets 403 here, and the
    // 06:00-22:00 / every-day fallbacks above stand.
    this.companyService.get().subscribe({
      next: (res) => {
        this.businessStart = res.company.business_hours_start;
        this.businessEnd = res.company.business_hours_end;
        this.workingDays = res.company.working_days;
        this.calendarOptions.update((opts) => ({
          ...opts,
          slotMinTime: this.businessStart,
          slotMaxTime: this.businessEnd,
        }));
        this.applyBusinessHours();
      },
      // The grid still has to be laid out on the fallbacks — when this was two
      // calls one of them always applied them, and a single failing call left
      // the calendar with no business hours at all.
      error: () => this.applyBusinessHours(),
    });
  }

  setView(view: "dayGridMonth" | "timeGridWeek" | "timeGridDay"): void {
    this.viewMode.set(view);
    this.calendarApi?.changeView(view);
  }

  today(): void {
    this.calendarApi?.today();
  }

  prev(): void {
    this.calendarApi?.prev();
  }

  next(): void {
    this.calendarApi?.next();
  }

  applyFilters(): void {
    this.calendarApi?.refetchEvents();
  }

  hasFilters(): boolean {
    return this.coachFilter() !== null || this.activityFilter() !== null;
  }

  resetFilters(): void {
    this.coachFilter.set(null);
    this.activityFilter.set(null);
    this.applyFilters();
  }

  private onDatesSet(start: Date, end: Date): void {
    this.hoverPreview.set(null);
    this.currentRangeStart = start;
    const api = this.calendarApi;
    if (api) {
      this.viewTitle.set(api.view.title);
      this.viewMode.set(api.view.type as "dayGridMonth" | "timeGridWeek" | "timeGridDay");
    }
    this.calendarOptions.update((opts) => ({
      ...opts,
      events: (_info, successCallback, failureCallback) => {
        this.calendarService
          .range({
            from: toDateInputValue(start),
            to: toDateInputValue(end),
            coach_id: this.coachFilter() ?? undefined,
            activity_id: this.activityFilter() ?? undefined,
          })
          .subscribe({
            next: (events) => successCallback(events.map((e) => this.toFullCalendarEvent(e)) as never[]),
            error: (err) => {
              this.toast.error(this.translate.instant("common.error_generic"));
              failureCallback(err);
            },
          });
      },
    }));
  }

  private toFullCalendarEvent(event: CalendarEvent) {
    return {
      id: event.id,
      title: `${event.session.activity_emoji ? event.session.activity_emoji + " " : ""}${event.session.activity_name}`,
      start: event.start,
      end: event.end,
      extendedProps: { session: event.session },
      classNames: [`fc-status-${event.session.status}`, ...(this.isSessionEnded(event.session) ? ["fc-session-ended"] : [])],
    };
  }

  /**
   * An event block, laid out rather than crammed into one string: start time,
   * activity, coach, and how full it is. Built as DOM nodes (not an HTML
   * string) so a coach or activity name can never be read as markup — the
   * month view gets a single compact line, where there is no room for more.
   */
  /** Happening right now, in the reader's own clock. */
  private isRunning(session: Session): boolean {
    const now = Date.now();
    return (
      session.status === "scheduled" &&
      new Date(session.starts_at).getTime() <= now &&
      new Date(session.ends_at).getTime() > now
    );
  }

  private renderEvent(arg: EventContentArg): { domNodes: Node[] } {
    const session = arg.event.extendedProps["session"] as Session;
    // A short session has no room for four stacked lines. An EMS slot is
    // twenty minutes — about twenty pixels — and the block was rendering the
    // time, the activity, the coach and the count into it, which crushed all
    // four into an unreadable stripe.
    const minutes = (new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 60_000;
    const compact = arg.view.type === "dayGridMonth" || minutes < 45;

    const root = document.createElement("div");
    root.className = compact ? "fx-ev fx-ev--compact" : "fx-ev";
    if (!session.coach_id) root.classList.add("is-uncoached");
    if (this.isRunning(session)) root.classList.add("is-now");
    // A one-to-one slot nobody has taken yet: the hour a studio still has to
    // sell, so it reads as free rather than as an empty class.
    const open = !!session.individual && session.confirmed_count === 0 && session.status === "scheduled";
    if (open) root.classList.add("is-open");
    const openLabel = open ? ` · ${this.translate.instant("calendar.slot_open")}` : "";

    if (compact) {
      // One line: the start and what it is. Everything else is a hover away,
      // and legible beats complete in twenty pixels.
      const line = document.createElement("span");
      line.className = "fx-ev-line";
      line.textContent = `${arg.timeText} ${session.activity_name}${openLabel}`;
      root.appendChild(line);
    } else {
      const time = document.createElement("span");
      time.className = "fx-ev-time";
      time.textContent = arg.timeText;
      root.appendChild(time);

      const title = document.createElement("span");
      title.className = "fx-ev-title";
      title.textContent = `${session.activity_emoji ? session.activity_emoji + " " : ""}${session.activity_name}${openLabel}`;
      root.appendChild(title);

      if (session.space_name) {
        const room = document.createElement("span");
        room.className = "fx-ev-coach";
        room.textContent = session.space_name;
        root.appendChild(room);
      }
    }

    // A session nobody is running is a problem, and the calendar is where it
    // gets fixed — so it says so here rather than only on the dashboard.
    // Silently omitting the coach line made the gap invisible at exactly the
    // moment someone could act on it.
    if (!compact) {
      const coach = document.createElement("span");

      if (session.coach_name) {
        coach.className = "fx-ev-coach";
        coach.textContent = session.coach_name;
      } else {
        coach.className = "fx-ev-coach is-missing";
        coach.textContent = this.translate.instant("calendar.no_coach");
      }

      root.appendChild(coach);
    }

    const count = document.createElement("span");
    count.className = "fx-ev-count";
    if (compact) count.classList.add("is-hidden");
    if (session.confirmed_count >= session.capacity) count.classList.add("is-full");
    count.textContent = `${session.confirmed_count}/${session.capacity}`;
    root.appendChild(count);

    return { domNodes: [ root ] };
  }

  /**
   * Hovering an event shows its card beside the block — a shortcut, never the
   * only way in: clicking still opens the full detail modal, which is what
   * touch and the keyboard use.
   */
  private showPreview(arg: EventHoveringArg): void {
    const session = arg.event.extendedProps["session"] as Session;
    const rect = arg.el.getBoundingClientRect();
    const width = 268;
    const height = 210;
    // Sit to the right of the block, flipping to its left when the viewport
    // runs out, and clamped so the card never leaves the screen.
    const left = rect.right + width + 16 < window.innerWidth ? rect.right + 8 : Math.max(8, rect.left - width - 8);
    const top = Math.min(Math.max(8, rect.top), Math.max(8, window.innerHeight - height - 8));
    this.hoverPreview.set({ session, top, left });
  }

  previewFill(session: Session): number {
    if (session.capacity <= 0) return 0;
    return Math.min(100, Math.round((session.confirmed_count / session.capacity) * 100));
  }

  // A session nobody explicitly cancelled or marked completed, whose time
  // has simply passed (e.g. yesterday's booking) — shown greyed out, not
  // struck through like an actually-cancelled session.
  isSessionEnded(session: Session): boolean {
    return session.status === "scheduled" && new Date(session.ends_at).getTime() < Date.now();
  }

  private onEventClick(arg: EventClickArg): void {
    this.hoverPreview.set(null);
    const session = arg.event.extendedProps["session"] as Session;
    this.openDetail(session);
  }

  private onDateClick(date: Date, dayEl: HTMLElement): void {
    if (!this.canManageSessions()) return;
    this.selectCell(dayEl);
    this.openCreate(date);
  }

  private selectCell(el: HTMLElement): void {
    this.clearSelectedCell();
    el.classList.add("fc-cell-selected");
    this.selectedCellEl = el;
  }

  private clearSelectedCell(): void {
    this.selectedCellEl?.classList.remove("fc-cell-selected");
    this.selectedCellEl = null;
  }

  private async onEventDrop(arg: EventDropArg): Promise<void> {
    const session = arg.event.extendedProps["session"] as Session;
    const newStart = arg.event.start!;

    const confirmed = await this.confirm.ask({
      title: this.translate.instant("calendar.move_confirm_title"),
      body: this.translate.instant("calendar.move_confirm_body"),
    });

    if (!confirmed) {
      arg.revert();
      return;
    }

    const duration = new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime();
    const newEnd = new Date(newStart.getTime() + duration);

    this.sessionsService.update(session.id, { starts_at: newStart.toISOString(), ends_at: newEnd.toISOString() }).subscribe({
      next: () => {
        this.toast.success(this.translate.instant("common.save"));
        this.calendarApi?.refetchEvents();
      },
      error: (err) => {
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        arg.revert();
      },
    });
  }

  // === Session detail ===
  openDetail(session: Session): void {
    this.selectedSession.set(session);
    this.detailOpen.set(true);
    this.detailLoading.set(true);
    this.addClientSearch.set("");
    this.addClientResults.set([]);

    this.attendanceService.forSession(session.id).subscribe({
      next: (res) => {
        this.detailBookings.set(res.bookings);
        this.detailLoading.set(false);
      },
      error: () => this.detailLoading.set(false),
    });
  }

  closeDetail(): void {
    this.detailOpen.set(false);
  }

  markAttendance(booking: AttendanceBooking, status: AttendanceStatus): void {
    this.markingBookingId.set(booking.booking_id);
    this.attendanceService.mark(booking.booking_id, status).subscribe({
      next: (res) => {
        this.markingBookingId.set(null);
        this.detailBookings.update((list) => list.map((b) => (b.booking_id === res.attendance.booking_id ? res.attendance : b)));
      },
      error: (err) => {
        this.markingBookingId.set(null);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  searchClientsToAdd(term: string): void {
    this.addClientSearch.set(term);
    if (term.trim().length < 2) {
      this.addClientResults.set([]);
      return;
    }
    this.clientsService.list({ search: term }).subscribe((res) => this.addClientResults.set(res.clients));
  }

  addClientToSession(client: Client): void {
    const session = this.selectedSession();
    if (!session) return;

    this.addingClient.set(true);
    this.bookingsService.create(client.id, session.id).subscribe({
      next: () => {
        this.addingClient.set(false);
        this.addClientSearch.set("");
        this.addClientResults.set([]);
        this.toast.success(this.translate.instant("common.save"));
        this.openDetail(session);
        this.calendarApi?.refetchEvents();
      },
      error: (err) => {
        this.addingClient.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  async cancelSession(): Promise<void> {
    const session = this.selectedSession();
    if (!session) return;

    const confirmed = await this.confirm.ask({
      title: this.translate.instant("bookings.cancel_confirm_title"),
      body: this.translate.instant("calendar.cancel_session_body"),
      danger: true,
    });
    if (!confirmed) return;

    this.sessionsService.cancel(session.id).subscribe({
      next: () => {
        this.toast.success(this.translate.instant("common.confirm"));
        this.detailOpen.set(false);
        this.calendarApi?.refetchEvents();
      },
      error: (err) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
    });
  }

  // === Create session ===
  openCreate(date?: Date): void {
    this.createForm.reset({
      date: toDateInputValue(date ?? new Date()),
      // Keep the exact minute FullCalendar reports for the clicked slot
      // (already snapped to its own grid, e.g. :00/:30) instead of always
      // flattening to the top of the hour.
      start_time: date ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` : "09:00",
      repeat_weekly: false,
      booking_kind: "contract",
      // Two months ahead: long enough to be worth setting up, short enough
      // that a timetable change does not leave a year of stale classes.
      repeat_until: toDateInputValue(new Date((date ?? new Date()).getTime() + 8 * 7 * 86400000)),
    });
    this.applyCreateActivity(null);
    this.formError.set(null);
    this.createModalOpen.set(true);
  }

  closeCreateModal(): void {
    this.createModalOpen.set(false);
    this.clearSelectedCell();
  }

  /**
   * Whether this is a weekly class rather than one session. An individual
   * session is for one member, so it never repeats.
   */
  repeats(): boolean {
    return this.createForm.controls.repeat_weekly.value && this.canRepeat();
  }

  /**
   * A class repeats; so does an open one-to-one slot (a coach's Tuesday 9:00
   * EMS hour). A session already booked for one named member does not.
   */
  canRepeat(): boolean {
    return this.createFormat() !== "individual" || !this.createForm.controls.client_id.value;
  }

  /** Whether the member named on a new one-to-one slot is booked as a trial or drop-in. */
  showBookingKind(): boolean {
    return this.dropIn() && this.createFormat() === "individual" && !!this.createForm.controls.client_id.value;
  }

  /** "Tuesday" for the date picked — the day the class repeats on. */
  repeatDayName(): string {
    const date = this.createForm.controls.date.value;
    if (!date) return "";
    return new Date(`${date}T12:00:00`).toLocaleDateString(this.translate.currentLang || "fr", { weekday: "long" });
  }

  submitCreate(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }
    if (this.repeats()) {
      this.submitWeeklyClass();
      return;
    }

    const { activity_id, client_id, booking_kind, coach_id, space_id, date, start_time, capacity, price } = this.createForm.getRawValue();
    const activity = this.activities().find((a) => a.id === activity_id);
    if (!activity) return;

    const startsAt = new Date(`${date}T${start_time}:00`);
    const endsAt = new Date(startsAt.getTime() + activity.duration * 60000);

    this.saving.set(true);
    this.formError.set(null);

    this.sessionsService
      .create({
        activity_id: activity_id!,
        client_id: client_id || undefined,
        ...(client_id && booking_kind === "trial" ? { trial: true } : {}),
        ...(client_id && booking_kind === "drop_in" ? { drop_in: true } : {}),
        coach_id: coach_id || null,
        ...(space_id ? { space_id } : {}),
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        capacity: capacity || undefined,
        price: price || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.createModalOpen.set(false);
          this.clearSelectedCell();
          this.toast.success(this.translate.instant("common.save"));
          this.calendarApi?.refetchEvents();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        },
      });
  }

  private submitWeeklyClass(): void {
    const { activity_id, coach_id, space_id, date, start_time, repeat_until } = this.createForm.getRawValue();
    if (!repeat_until || repeat_until < date) {
      this.formError.set(this.translate.instant("calendar.repeat_until_invalid"));
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    this.recurring
      .create({
        activity_id: activity_id!,
        coach_id: coach_id || null,
        ...(space_id ? { space_id } : {}),
        start_time,
        starts_on: date,
        ends_on: repeat_until,
        weekdays: [new Date(`${date}T12:00:00`).getDay()],
      })
      .subscribe({
        next: (res) => {
          this.saving.set(false);
          this.createModalOpen.set(false);
          this.clearSelectedCell();
          this.toast.success(this.translate.instant("calendar.weekly_created", { count: res.generated }));
          if (res.conflicts.length > 0) {
            this.toast.error(this.translate.instant("calendar.weekly_conflicts", { count: res.conflicts.length }));
          }
          this.calendarApi?.refetchEvents();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
        },
      });
  }

  /** Ends the weekly class this session belongs to — see RecurringSchedulesService.stop. */
  async stopSeries(): Promise<void> {
    const session = this.selectedSession();
    if (!session?.recurring_schedule_id) return;

    const confirmed = await this.confirm.ask({
      title: this.translate.instant("calendar.stop_series_title"),
      body: this.translate.instant("calendar.stop_series_body"),
      confirmLabel: this.translate.instant("calendar.stop_series"),
      danger: true,
    });
    if (!confirmed) return;

    this.stoppingSeries.set(true);
    this.recurring.stop(session.recurring_schedule_id).subscribe({
      next: (res) => {
        this.stoppingSeries.set(false);
        this.detailOpen.set(false);
        this.toast.success(this.translate.instant("calendar.series_stopped", { count: res.cancelled_sessions }));
        if (res.kept_sessions > 0) {
          this.toast.error(this.translate.instant("calendar.series_kept", { count: res.kept_sessions }));
        }
        this.calendarApi?.refetchEvents();
      },
      error: (err) => {
        this.stoppingSeries.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  // === Print planning ===
  printSchedule(): void {
    if (!this.canPrint()) return;
    this.printingSchedule.set(true);
    this.sessionsService.schedulePdf(toDateInputValue(this.currentRangeStart)).subscribe({
      next: (blob) => {
        this.printingSchedule.set(false);
        downloadBlob(blob, `planning-${toDateInputValue(this.currentRangeStart)}.pdf`);
      },
      error: (err) => {
        this.printingSchedule.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }
}
