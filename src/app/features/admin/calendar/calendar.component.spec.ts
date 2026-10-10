import { provideRouter } from "@angular/router";
import { signal } from "@angular/core";
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { Space } from "../../../core/models/space.model";
import { SpacesService } from "../../../core/services/spaces.service";
import { RecurringSchedulesService } from "../../../core/services/recurring-schedules.service";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { Activity } from "../../../core/models/activity.model";
import { AttendanceBooking } from "../../../core/models/attendance.model";
import { Client } from "../../../core/models/client.model";
import { Session } from "../../../core/models/session.model";
import { AuthService } from "../../../core/auth/auth.service";
import { ActivitiesService } from "../../../core/services/activities.service";
import { AttendanceService } from "../../../core/services/attendance.service";
import { BookingsService } from "../../../core/services/bookings.service";
import { CalendarEvent, CalendarService } from "../../../core/services/calendar.service";
import { ClientsService } from "../../../core/services/clients.service";
import { CoachesService } from "../../../core/services/coaches.service";
import { CompanyService } from "../../../core/services/company.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { LocaleService } from "../../../core/services/locale.service";
import { SessionsService } from "../../../core/services/sessions.service";
import { ToastService } from "../../../core/services/toast.service";
import { CalendarComponent } from "./calendar.component";

// Private handlers exercised directly — FullCalendar itself isn't driven
// through simulated clicks/drags here (that belongs to e2e), only the
// component logic those callbacks trigger.
type Internal = {
  onDatesSet(start: Date, end: Date): void;
  toFullCalendarEvent(e: CalendarEvent): { classNames: string[] };
  onEventClick(arg: unknown): void;
  onDateClick(date: Date, el: HTMLElement): void;
  onEventDrop(arg: unknown): Promise<void>;
  renderEvent(arg: unknown): { domNodes: HTMLElement[] };
  showPreview(arg: unknown): void;
};

describe("CalendarComponent", () => {
  let fixture: ComponentFixture<CalendarComponent>;
  let component: CalendarComponent;
  let calendarService: jasmine.SpyObj<CalendarService>;
  let sessionsService: jasmine.SpyObj<SessionsService>;
  let coachesService: jasmine.SpyObj<CoachesService>;
  let activitiesService: jasmine.SpyObj<ActivitiesService>;
  let attendanceService: jasmine.SpyObj<AttendanceService>;
  let bookingsService: jasmine.SpyObj<BookingsService>;
  let clientsService: jasmine.SpyObj<ClientsService>;
  let recurringService: jasmine.SpyObj<RecurringSchedulesService>;
  let spacesService: jasmine.SpyObj<SpacesService>;
  /** The gym's feature switches, as the bootstrap payload carries them. */
  const features = signal<Record<string, boolean>>({});
  const proFeatures = signal(true);
  const cabin: Space = { id: "sp1", name: "Cabine 1", kind: "cabine", capacity: 1, active: true, activity_ids: [], deletable: true };
  let companyService: jasmine.SpyObj<CompanyService>;
  let confirmService: ConfirmService;
  let toast: ToastService;
  let authStub: { hasPermission: jasmine.Spy };

  const activity: Activity = {
    id: "a1", company_id: "1", name: "Yoga", emoji: "🧘", description: null,
    session_format: "collective", duration: 60, capacity: 20, active: true,
  } as never;
  const individualActivity: Activity = { ...activity, id: "a2", session_format: "individual", capacity: 1 };
  const session: Session = {
    id: "s1", starts_at: "2026-01-05T10:00:00Z", ends_at: "2026-01-05T11:00:00Z",
    status: "scheduled", activity_name: "Yoga", activity_emoji: "🧘",
  } as never;
  const client: Client = {
    id: "cl1", first_name: "Amy", last_name: "Client", full_name: "Amy Client", email: null, phone: null,
    active: true, login_enabled: false,
    joined_at: "2026-01-01",
    last_visit_at: null, current_contract: null,
  };
  const attBooking: AttendanceBooking = { booking_id: "b1", client_name: "Amy", status: "confirmed" } as never;

  function build(role: string): void {
    TestBed.resetTestingModule();
    authStub = { hasPermission: jasmine.createSpy().and.returnValue(role === "admin") };
    calendarService = jasmine.createSpyObj<CalendarService>("CalendarService", ["range"]);
    sessionsService = jasmine.createSpyObj<SessionsService>("SessionsService", ["update", "create", "cancel", "schedulePdf"]);
    coachesService = jasmine.createSpyObj<CoachesService>("CoachesService", ["list"]);
    activitiesService = jasmine.createSpyObj<ActivitiesService>("ActivitiesService", ["list"]);
    attendanceService = jasmine.createSpyObj<AttendanceService>("AttendanceService", ["forSession", "mark"]);
    bookingsService = jasmine.createSpyObj<BookingsService>("BookingsService", ["create"]);
    clientsService = jasmine.createSpyObj<ClientsService>("ClientsService", ["list"]);
    companyService = jasmine.createSpyObj<CompanyService>("CompanyService", ["get"]);
    recurringService = jasmine.createSpyObj<RecurringSchedulesService>("RecurringSchedulesService", ["create", "stop"]);
    spacesService = jasmine.createSpyObj<SpacesService>("SpacesService", ["list"]);
    spacesService.list.and.returnValue(of({ spaces: [cabin] }));

    // FullCalendar renders for real in ChromeHeadless and immediately invokes
    // the events fetcher wired up by onDatesSet — every test needs this
    // stubbed, not just the ones exercising onDatesSet directly.
    calendarService.range.and.returnValue(of([]));
    coachesService.list.and.returnValue(of({ coaches: [] }));
    activitiesService.list.and.returnValue(of({ activities: [activity, individualActivity] }));
    clientsService.list.and.returnValue(of({ clients: [client], meta: { page: 1, per_page: 100, total: 1, total_pages: 1 } , counts: {} }));
    companyService.get.and.returnValue(of({ company: { business_hours_start: "06:00", business_hours_end: "22:00", working_days: [1, 2, 3, 4, 5] } as never }));

    TestBed.configureTestingModule({
      imports: [CalendarComponent, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authStub },
        { provide: CalendarService, useValue: calendarService },
        { provide: SessionsService, useValue: sessionsService },
        { provide: CoachesService, useValue: coachesService },
        { provide: ActivitiesService, useValue: activitiesService },
        { provide: AttendanceService, useValue: attendanceService },
        { provide: BookingsService, useValue: bookingsService },
        { provide: ClientsService, useValue: clientsService },
        { provide: CompanyService, useValue: companyService },
        { provide: RecurringSchedulesService, useValue: recurringService },
        { provide: ConfigurationService, useValue: { features: features, proFeatures } },
        { provide: SpacesService, useValue: spacesService },
        provideRouter([]),
      ],
    });

    fixture = TestBed.createComponent(CalendarComponent);
    component = fixture.componentInstance;
    confirmService = TestBed.inject(ConfirmService);
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  }

  beforeEach(() => features.set({}));
  beforeEach(() => proFeatures.set(true));
  beforeEach(() => build("admin"));

  function internal(): Internal {
    return component as unknown as Internal;
  }

  it("loads coaches/activities on init, and clients too for someone who can manage sessions", () => {
    expect(coachesService.list).toHaveBeenCalled();
    expect(activitiesService.list).toHaveBeenCalled();
    expect(clientsService.list).toHaveBeenCalled();
    expect(component.activities().length).toBe(2);
    expect(component.clients().length).toBe(1);
  });

  it("skips loading clients for someone who cannot manage sessions", () => {
    build("coach");
    expect(clientsService.list).not.toHaveBeenCalled();
  });

  it("tolerates coaches/activities/clients failing to load (best-effort)", () => {
    coachesService.list.and.returnValue(throwError(() => new Error("nope")));
    activitiesService.list.and.returnValue(throwError(() => new Error("nope")));
    clientsService.list.and.returnValue(throwError(() => new Error("nope")));
    expect(() => {
      fixture = TestBed.createComponent(CalendarComponent);
      fixture.detectChanges();
    }).not.toThrow();
  });

  it("applies the gym's business hours once loaded", () => {
    expect(component.calendarOptions().slotMinTime).toBe("06:00");
  });

  it("keeps the default business hours when the company call fails", () => {
    build("admin");
    fixture = TestBed.createComponent(CalendarComponent);
    fixture.detectChanges();
    expect((fixture.componentInstance as CalendarComponent).calendarOptions().slotMinTime).toBe("06:00");
  });

  it("shades business hours using the company's configured working days and opening hours", () => {
    const businessHours = component.calendarOptions().businessHours as { daysOfWeek: number[]; startTime: string; endTime: string };
    expect(businessHours.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
    expect(businessHours.startTime).toBe("06:00");
    expect(businessHours.endTime).toBe("22:00");
  });

  it("hides closed days from the grid, but never today", () => {
    // A gym closed on Saturday still has a Saturday, and hiding it made
    // "Aujourd'hui" look broken: the button fired, today had no column, and
    // the view rolled on to the next open week.
    const today = new Date().getDay();

    expect(component.calendarOptions().hiddenDays).toEqual([ 0, 6 ].filter((day) => day !== today));
  });

  it("keeps every day as a working day (nothing hidden) when the company call fails", () => {
    build("admin");
    companyService.get.and.returnValue(throwError(() => new Error("nope")));
    fixture = TestBed.createComponent(CalendarComponent);
    fixture.detectChanges();
    const opts = (fixture.componentInstance as CalendarComponent).calendarOptions();
    const businessHours = opts.businessHours as { daysOfWeek: number[] };
    expect(businessHours.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(opts.hiddenDays).toEqual([]);
  });

  it("clientOptions maps clients to select options", () => {
    expect(component.clientOptions()).toEqual([{ value: "cl1", label: "Amy Client" }]);
  });

  it("calendarOptions direction is rtl for an RTL locale", () => {
    const locale = TestBed.inject(LocaleService);
    locale.setLocale("ar");
    fixture = TestBed.createComponent(CalendarComponent);
    fixture.detectChanges();
    expect((fixture.componentInstance as CalendarComponent).calendarOptions().direction).toBe("rtl");
  });

  it("isSessionEnded is true only for a past, still-scheduled session", () => {
    expect(component.isSessionEnded({ ...session, status: "scheduled", ends_at: "2000-01-01T00:00:00Z" })).toBe(true);
    expect(component.isSessionEnded({ ...session, status: "scheduled", ends_at: "2999-01-01T00:00:00Z" })).toBe(false);
    expect(component.isSessionEnded({ ...session, status: "cancelled", ends_at: "2000-01-01T00:00:00Z" })).toBe(false);
  });

  describe("view controls (no-op without a rendered FullCalendar)", () => {
    it("setView/today/prev/next/applyFilters do not throw", () => {
      expect(() => component.setView("dayGridMonth")).not.toThrow();
      expect(() => component.today()).not.toThrow();
      expect(() => component.prev()).not.toThrow();
      expect(() => component.next()).not.toThrow();
      expect(() => component.applyFilters()).not.toThrow();
    });
  });

  describe("printSchedule", () => {
    it("downloads a pdf for the currently visible week and resets the loading state", () => {
      sessionsService.schedulePdf.and.returnValue(of(new Blob(["%PDF"], { type: "application/pdf" })));

      component.printSchedule();

      expect(sessionsService.schedulePdf).toHaveBeenCalled();
      expect(component.printingSchedule()).toBe(false);
    });

    it("is a Pro tool: on Starter and the trial the button leads to the plan, and nothing is asked", () => {
      proFeatures.set(false);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector("a.fx-cal-print-locked")?.getAttribute("href")).toBe("/admin/subscription");
      component.printSchedule();
      expect(sessionsService.schedulePdf).not.toHaveBeenCalled();
    });

    it("shows an error toast and resets loading state when the pdf request fails", () => {
      sessionsService.schedulePdf.and.returnValue(throwError(() => new Error("boom")));

      component.printSchedule();

      expect(toast.toasts()[0].kind).toBe("error");
      expect(component.printingSchedule()).toBe(false);
    });
  });

  describe("create-session form", () => {
    it("selecting a collective activity sets its capacity and does not require a client", () => {
      component.createForm.controls.activity_id.setValue("a1");
      expect(component.createFormat()).toBe("collective");
      expect(component.createForm.controls.capacity.value).toBe(20);
      expect(component.createForm.controls.client_id.enabled).toBe(true);
    });

    it("selecting an individual activity locks capacity to 1 and leaves the member optional, for an open slot", () => {
      component.createForm.controls.activity_id.setValue("a2");
      expect(component.createFormat()).toBe("individual");
      expect(component.createForm.controls.capacity.disabled).toBe(true);
      component.createForm.controls.client_id.updateValueAndValidity();
      expect(component.createForm.controls.client_id.hasError("required")).toBe(false);
    });

    it("books a named member's trial into the one-to-one slot it creates", () => {
      component.createForm.patchValue({
        activity_id: "a2", client_id: client.id, booking_kind: "trial", date: "2026-01-06", start_time: "09:00",
      });
      sessionsService.create.and.returnValue(of({ session }));

      component.submitCreate();

      expect(sessionsService.create).toHaveBeenCalledWith(jasmine.objectContaining({ client_id: client.id, trial: true }));
    });

    it("sends no trial flag for an open slot, whatever the radio says", () => {
      component.createForm.patchValue({ activity_id: "a2", booking_kind: "trial", date: "2026-01-06", start_time: "09:00" });
      sessionsService.create.and.returnValue(of({ session }));

      component.submitCreate();

      const payload = sessionsService.create.calls.mostRecent().args[0];
      expect(payload.client_id).toBeUndefined();
      expect(payload.trial).toBeUndefined();
    });

    it("clearing the activity resets format and client requirement", () => {
      component.createForm.controls.activity_id.setValue("a2");
      component.createForm.controls.activity_id.setValue(null);
      expect(component.createFormat()).toBeNull();
      expect(component.createForm.controls.capacity.enabled).toBe(true);
    });

    it("openCreate seeds the date/time from a clicked slot, or defaults to now", () => {
      const clicked = new Date("2026-03-01T14:30:00");
      component.openCreate(clicked);
      expect(component.createForm.value.date).toBe("2026-03-01");
      expect(component.createForm.value.start_time).toBe("14:30");
      expect(component.createModalOpen()).toBe(true);

      component.openCreate();
      expect(component.createForm.value.start_time).toBe("09:00");
    });

    it("closeCreateModal closes it", () => {
      component.createModalOpen.set(true);
      component.closeCreateModal();
      expect(component.createModalOpen()).toBe(false);
    });

    it("submitCreate does nothing with an invalid form", () => {
      component.submitCreate();
      expect(sessionsService.create).not.toHaveBeenCalled();
    });

    it("submitCreate does nothing if the chosen activity vanished from the list", () => {
      component.createForm.patchValue({ activity_id: "unknown", date: "2026-01-01", start_time: "10:00" });
      component.submitCreate();
      expect(sessionsService.create).not.toHaveBeenCalled();
    });

    it("submitCreate creates the session and closes the modal", () => {
      component.createForm.patchValue({ activity_id: "a1", date: "2026-01-05", start_time: "10:00" });
      sessionsService.create.and.returnValue(of({ session }));
      component.submitCreate();
      expect(sessionsService.create).toHaveBeenCalled();
      expect(component.createModalOpen()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("submitCreate sends undefined capacity/price when left blank", () => {
      component.createForm.patchValue({ activity_id: "a1", date: "2026-01-05", start_time: "10:00", capacity: null, price: null });
      sessionsService.create.and.returnValue(of({ session }));
      component.submitCreate();
      const payload = sessionsService.create.calls.mostRecent().args[0] as { capacity?: number; price?: number };
      expect(payload.capacity).toBeUndefined();
      expect(payload.price).toBeUndefined();
    });

    it("submitCreate shows the backend error on failure", () => {
      component.createForm.patchValue({ activity_id: "a1", date: "2026-01-05", start_time: "10:00" });
      sessionsService.create.and.returnValue(throwError(() => new Error("nope")));
      component.submitCreate();
      expect(component.formError()).toBeTruthy();
    });

    it("repeating weekly creates a weekly class on that day instead of one session", () => {
      component.createForm.patchValue({
        activity_id: "a1", date: "2026-01-06", start_time: "18:00", repeat_weekly: true, repeat_until: "2026-03-03",
      });
      recurringService.create.and.returnValue(of({ generated: 9, skipped: 0, conflicts: [] }));

      component.submitCreate();

      expect(sessionsService.create).not.toHaveBeenCalled();
      expect(recurringService.create).toHaveBeenCalledWith({
        activity_id: "a1", coach_id: null, start_time: "18:00",
        starts_on: "2026-01-06", ends_on: "2026-03-03", weekdays: [2],
      });
      expect(component.createModalOpen()).toBe(false);
    });

    it("refuses an end date before the start", () => {
      component.createForm.patchValue({
        activity_id: "a1", date: "2026-01-06", start_time: "18:00", repeat_weekly: true, repeat_until: "2026-01-01",
      });

      component.submitCreate();

      expect(recurringService.create).not.toHaveBeenCalled();
      expect(component.formError()).toBeTruthy();
    });

    it("never repeats an individual session booked for a member", () => {
      component.createForm.patchValue({ activity_id: individualActivity.id, client_id: client.id, repeat_weekly: true });
      expect(component.repeats()).toBe(false);
    });

    it("repeats an open one-to-one slot every week, in its cabin", () => {
      component.createForm.patchValue({
        activity_id: individualActivity.id, space_id: cabin.id, date: "2026-01-06", start_time: "09:00",
        repeat_weekly: true, repeat_until: "2026-03-03",
      });
      recurringService.create.and.returnValue(of({ generated: 9, skipped: 0, conflicts: [] }));

      component.submitCreate();

      expect(recurringService.create).toHaveBeenCalledWith(jasmine.objectContaining({ activity_id: "a2", space_id: cabin.id }));
    });

    it("lists the gym's rooms only when it runs them", () => {
      expect(spacesService.list).not.toHaveBeenCalled();

      features.set({ spaces: true });
      build("admin");

      expect(spacesService.list).toHaveBeenCalled();
      expect(component.spaces().map((r) => r.id)).toEqual([cabin.id]);
    });
  });

  describe("weekly classes", () => {
    it("stops the series from one of its sessions", async () => {
      component.selectedSession.set({ ...session, recurring_schedule_id: "rs1" });
      spyOn(confirmService, "ask").and.resolveTo(true);
      recurringService.stop.and.returnValue(of({ cancelled_sessions: 6, kept_sessions: 1 }));

      await component.stopSeries();

      expect(recurringService.stop).toHaveBeenCalledWith("rs1");
      expect(component.detailOpen()).toBe(false);
    });

    it("does nothing for a one-off session", async () => {
      component.selectedSession.set({ ...session, recurring_schedule_id: null });
      await component.stopSeries();
      expect(recurringService.stop).not.toHaveBeenCalled();
    });
  });

  describe("session detail", () => {
    it("openDetail loads attendance for the session", () => {
      attendanceService.forSession.and.returnValue(of({ session, bookings: [attBooking] }));
      component.openDetail(session);
      expect(component.selectedSession()).toBe(session);
      expect(component.detailOpen()).toBe(true);
      expect(component.detailBookings().length).toBe(1);
      expect(component.detailLoading()).toBe(false);
    });

    it("openDetail stops loading even on error", () => {
      attendanceService.forSession.and.returnValue(throwError(() => new Error("nope")));
      component.openDetail(session);
      expect(component.detailLoading()).toBe(false);
    });

    it("closeDetail closes it", () => {
      component.detailOpen.set(true);
      component.closeDetail();
      expect(component.detailOpen()).toBe(false);
    });

    it("markAttendance updates the matching booking and leaves others untouched", () => {
      const other: AttendanceBooking = { ...attBooking, booking_id: "b2", client_name: "Bo" } as never;
      component.detailBookings.set([attBooking, other]);
      const updated = { ...attBooking, status: "present" };
      attendanceService.mark.and.returnValue(of({ attendance: updated }));
      component.markAttendance(attBooking, "present");
      expect(component.detailBookings()[0]).toEqual(updated);
      expect(component.detailBookings()[1]).toEqual(other);
      expect(component.markingBookingId()).toBeNull();
    });

    it("markAttendance shows an error toast on failure", () => {
      attendanceService.mark.and.returnValue(throwError(() => new Error("nope")));
      component.markAttendance(attBooking, "present");
      expect(toast.toasts()[0].kind).toBe("error");
    });

    it("searchClientsToAdd clears results for a short term", () => {
      component.searchClientsToAdd("a");
      expect(component.addClientResults()).toEqual([]);
    });

    it("searchClientsToAdd queries for a 2+ char term", () => {
      component.searchClientsToAdd("amy");
      expect(component.addClientResults()).toEqual([client]);
    });

    it("addClientToSession does nothing without a selected session", () => {
      component.selectedSession.set(null);
      component.addClientToSession(client);
      expect(bookingsService.create).not.toHaveBeenCalled();
    });

    it("addClientToSession books the client and re-opens the detail", () => {
      attendanceService.forSession.and.returnValue(of({ session, bookings: [] }));
      component.selectedSession.set(session);
      bookingsService.create.and.returnValue(of({ booking: {} as never }));
      component.addClientToSession(client);
      expect(component.addingClient()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("addClientToSession shows an error toast on failure", () => {
      component.selectedSession.set(session);
      bookingsService.create.and.returnValue(throwError(() => new Error("nope")));
      component.addClientToSession(client);
      expect(component.addingClient()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("error");
    });

    it("cancelSession does nothing without a selected session", async () => {
      component.selectedSession.set(null);
      await component.cancelSession();
      expect(sessionsService.cancel).not.toHaveBeenCalled();
    });

    it("cancelSession does nothing when declined", async () => {
      component.selectedSession.set(session);
      spyOn(confirmService, "ask").and.resolveTo(false);
      await component.cancelSession();
      expect(sessionsService.cancel).not.toHaveBeenCalled();
    });

    it("cancelSession cancels and closes the detail on confirmation", async () => {
      component.selectedSession.set(session);
      spyOn(confirmService, "ask").and.resolveTo(true);
      sessionsService.cancel.and.returnValue(of({ session }));
      await component.cancelSession();
      expect(component.detailOpen()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("cancelSession shows an error toast on failure", async () => {
      component.selectedSession.set(session);
      spyOn(confirmService, "ask").and.resolveTo(true);
      sessionsService.cancel.and.returnValue(throwError(() => new Error("nope")));
      await component.cancelSession();
      expect(toast.toasts()[0].kind).toBe("error");
    });
  });

  describe("internal FullCalendar callbacks", () => {
    it("onDatesSet wires an events fetcher that maps the range through calendarService", () => {
      calendarService.range.and.returnValue(of([{ id: "s1", title: "Yoga", start: "2026-01-05T10:00:00Z", end: "2026-01-05T11:00:00Z", session } as CalendarEvent]));
      const success = jasmine.createSpy();
      internal().onDatesSet(new Date("2026-01-01"), new Date("2026-01-08"));

      const events = component.calendarOptions().events as (info: unknown, s: (e: unknown[]) => void, f: (e: unknown) => void) => void;
      events({}, success, () => {});

      expect(calendarService.range).toHaveBeenCalled();
      expect(success).toHaveBeenCalled();
    });

    it("the events fetcher surfaces a toast and calls failureCallback on error", () => {
      calendarService.range.and.returnValue(throwError(() => new Error("nope")));
      const failure = jasmine.createSpy();
      internal().onDatesSet(new Date("2026-01-01"), new Date("2026-01-08"));

      const events = component.calendarOptions().events as (info: unknown, s: (e: unknown[]) => void, f: (e: unknown) => void) => void;
      events({}, () => {}, failure);

      expect(toast.toasts()[0].kind).toBe("error");
      expect(failure).toHaveBeenCalled();
    });

    it("toFullCalendarEvent marks an ended, still-scheduled session with fc-session-ended", () => {
      const ended = { ...session, ends_at: "2000-01-01T00:00:00Z" };
      const fcEvent = internal().toFullCalendarEvent({ id: "s1", title: "x", start: "a", end: "b", session: ended });
      expect(fcEvent.classNames).toContain("fc-session-ended");
    });

    it("toFullCalendarEvent omits fc-session-ended for a session that hasn't ended", () => {
      const notEnded = { ...session, ends_at: "2999-01-01T00:00:00Z" };
      const fcEvent = internal().toFullCalendarEvent({ id: "s1", title: "x", start: "a", end: "b", session: notEnded });
      expect(fcEvent.classNames).not.toContain("fc-session-ended");
    });

    it("toFullCalendarEvent's title is the activity, with the emoji prefix only when there is one", () => {
      const noEmoji = { ...session, activity_emoji: null } as unknown as Session;
      const fcEvent = internal().toFullCalendarEvent({ id: "s1", title: "x", start: "a", end: "b", session: noEmoji }) as unknown as { title: string };
      expect(fcEvent.title).toBe("Yoga");
      expect(fcEvent.title).not.toContain("🧘");
    });

    it("renderEvent lays the block out as time, activity, coach and occupancy", () => {
      const full = { ...session, coach_name: "Alex", confirmed_count: 12, capacity: 12 } as unknown as Session;
      const { domNodes } = internal().renderEvent({
        event: { extendedProps: { session: full } },
        timeText: "18:00",
        view: { type: "timeGridWeek" },
      }) as { domNodes: HTMLElement[] };

      const block = domNodes[0];
      expect(block.querySelector(".fx-ev-time")?.textContent).toBe("18:00");
      expect(block.querySelector(".fx-ev-title")?.textContent).toContain("Yoga");
      expect(block.querySelector(".fx-ev-coach")?.textContent).toBe("Alex");
      const count = block.querySelector(".fx-ev-count");
      expect(count?.textContent).toBe("12/12");
      expect(count?.classList.contains("is-full")).toBe(true);
    });

    it("renderEvent drops the coach line in the month view, where there is no room", () => {
      const withCoach = { ...session, coach_name: "Alex" } as unknown as Session;
      const { domNodes } = internal().renderEvent({
        event: { extendedProps: { session: withCoach } },
        timeText: "18:00",
        view: { type: "dayGridMonth" },
      }) as { domNodes: HTMLElement[] };

      expect(domNodes[0].classList.contains("fx-ev--compact")).toBe(true);
      expect(domNodes[0].querySelector(".fx-ev-coach")).toBeNull();
    });

    it("renderEvent writes names as text, so a name can never be read as markup", () => {
      const nasty = { ...session, activity_name: "<img src=x onerror=alert(1)>", activity_emoji: null } as unknown as Session;
      const { domNodes } = internal().renderEvent({
        event: { extendedProps: { session: nasty } },
        timeText: "18:00",
        view: { type: "timeGridWeek" },
      }) as { domNodes: HTMLElement[] };

      expect(domNodes[0].querySelector("img")).toBeNull();
      expect(domNodes[0].querySelector(".fx-ev-title")?.textContent).toBe("<img src=x onerror=alert(1)>");
    });

    it("showPreview pins the hover card beside the event, and a click clears it", () => {
      internal().showPreview({
        event: { extendedProps: { session } },
        el: { getBoundingClientRect: () => ({ top: 100, left: 200, right: 320 }) },
      });

      expect(component.hoverPreview()?.session).toBe(session);
      expect(component.hoverPreview()?.top).toBe(100);

      attendanceService.forSession.and.returnValue(of({ session, bookings: [] }));
      internal().onEventClick({ event: { extendedProps: { session } } });
      expect(component.hoverPreview()).toBeNull();
    });

    it("previewFill clamps the occupancy bar, and handles a zero capacity", () => {
      expect(component.previewFill({ confirmed_count: 6, capacity: 12 } as Session)).toBe(50);
      expect(component.previewFill({ confirmed_count: 20, capacity: 12 } as Session)).toBe(100);
      expect(component.previewFill({ confirmed_count: 3, capacity: 0 } as Session)).toBe(0);
    });

    it("onEventClick opens the detail for the clicked session", () => {
      attendanceService.forSession.and.returnValue(of({ session, bookings: [] }));
      internal().onEventClick({ event: { extendedProps: { session } } });
      expect(component.selectedSession()).toBe(session);
    });

    it("wires eventClick/eventDrop/dateClick/datesSet through to their handlers", async () => {
      attendanceService.forSession.and.returnValue(of({ session, bookings: [] }));
      const opts = component.calendarOptions() as unknown as {
        eventClick: (arg: unknown) => void;
        eventDrop: (arg: unknown) => Promise<void>;
        dateClick: (arg: { date: Date; dayEl: HTMLElement }) => void;
        datesSet: (arg: { start: Date; end: Date }) => void;
      };

      opts.eventClick({ event: { extendedProps: { session } } });
      expect(component.selectedSession()).toBe(session);

      spyOn(confirmService, "ask").and.resolveTo(false);
      const revert = jasmine.createSpy();
      await opts.eventDrop({ event: { extendedProps: { session }, start: new Date() }, revert });
      expect(revert).toHaveBeenCalled();

      const el = document.createElement("div");
      opts.dateClick({ date: new Date("2026-01-05T10:00:00"), dayEl: el });
      expect(component.createModalOpen()).toBe(true);

      calendarService.range.and.returnValue(of([]));
      opts.datesSet({ start: new Date("2026-01-01"), end: new Date("2026-01-08") });
      expect(calendarService.range).toHaveBeenCalled();
    });

    it("onDateClick opens the create modal for someone who can manage sessions", () => {
      const el = document.createElement("div");
      internal().onDateClick(new Date("2026-01-05T10:00:00"), el);
      expect(component.createModalOpen()).toBe(true);
      expect(el.classList).toContain("fc-cell-selected");
    });

    it("onDateClick does nothing for someone who cannot manage sessions", () => {
      build("coach");
      const el = document.createElement("div");
      internal().onDateClick(new Date(), el);
      expect(component.createModalOpen()).toBe(false);
    });

    it("onEventDrop reverts without saving when declined", async () => {
      spyOn(confirmService, "ask").and.resolveTo(false);
      const revert = jasmine.createSpy();
      await internal().onEventDrop({ event: { extendedProps: { session }, start: new Date() }, revert });
      expect(sessionsService.update).not.toHaveBeenCalled();
      expect(revert).toHaveBeenCalled();
    });

    it("onEventDrop saves the new time on confirmation", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      sessionsService.update.and.returnValue(of({ session }));
      const revert = jasmine.createSpy();
      await internal().onEventDrop({ event: { extendedProps: { session }, start: new Date("2026-01-06T10:00:00Z") }, revert });
      expect(sessionsService.update).toHaveBeenCalled();
      expect(toast.toasts()[0].kind).toBe("success");
      expect(revert).not.toHaveBeenCalled();
    });

    it("onEventDrop reverts and shows an error toast when the save fails", async () => {
      spyOn(confirmService, "ask").and.resolveTo(true);
      sessionsService.update.and.returnValue(throwError(() => new Error("nope")));
      const revert = jasmine.createSpy();
      await internal().onEventDrop({ event: { extendedProps: { session }, start: new Date() }, revert });
      expect(toast.toasts()[0].kind).toBe("error");
      expect(revert).toHaveBeenCalled();
    });
  });

  describe("a session nobody is running", () => {
    function render(session: Record<string, unknown>) {
      const arg = {
        event: { extendedProps: { session } },
        view: { type: "timeGridWeek" },
        timeText: "18:00",
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (component as any).renderEvent(arg).domNodes[0] as HTMLElement;
    }

    const base = {
      id: "s1", coach_id: "c1", coach_name: "Leila", activity_name: "Pilates",
      activity_emoji: null, confirmed_count: 4, capacity: 10, status: "scheduled",
      starts_at: new Date(Date.now() + 86_400_000).toISOString(),
      ends_at: new Date(Date.now() + 90_000_000).toISOString(),
    };

    it("names the coach when there is one", () => {
      const el = render(base);

      expect(el.classList).not.toContain("is-uncoached");
      expect(el.textContent).toContain("Leila");
    });

    it("says so on the block, rather than leaving a gap where a name goes", () => {
      const el = render({ ...base, coach_id: null, coach_name: null });

      expect(el.classList).toContain("is-uncoached");
      expect(el.querySelector(".fx-ev-coach.is-missing")).toBeTruthy();
    });

    it("puts a short session on one line — twenty pixels cannot hold four", () => {
      const el = render({
        ...base,
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        // Twenty minutes, like an EMS slot.
        ends_at: new Date(Date.now() + 86_400_000 + 20 * 60_000).toISOString(),
      });

      expect(el.classList).toContain("fx-ev--compact");
      expect(el.querySelector(".fx-ev-line")).toBeTruthy();
      expect(el.querySelector(".fx-ev-title")).toBeNull();
      expect(el.querySelector(".fx-ev-count.is-hidden")).toBeTruthy();
    });

    it("keeps the full stack on a session with room for it", () => {
      const el = render(base);

      expect(el.classList).not.toContain("fx-ev--compact");
      expect(el.querySelector(".fx-ev-title")).toBeTruthy();
      expect(el.querySelector(".fx-ev-line")).toBeNull();
    });

    it("marks the session that is running right now", () => {
      const el = render({
        ...base,
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        ends_at: new Date(Date.now() + 60_000).toISOString(),
      });

      expect(el.classList).toContain("is-now");
    });

    it("does not mark a cancelled session as running, even mid-slot", () => {
      const el = render({
        ...base,
        status: "cancelled",
        starts_at: new Date(Date.now() - 60_000).toISOString(),
        ends_at: new Date(Date.now() + 60_000).toISOString(),
      });

      expect(el.classList).not.toContain("is-now");
    });
  });
});
