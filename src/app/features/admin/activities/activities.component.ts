import { Component, OnInit, computed, effect, signal, Input, inject, untracked } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { Activity, CAPACITY_BOUNDS, SessionFormat } from "../../../core/models/activity.model";
import { ActivityTemplate } from "../../../core/models/activity-template.model";
import { ActivityTemplatesService } from "../../../core/services/activity-templates.service";
import { clientPageMeta, filterBySearch, pageSlice } from "../../../shared/utils/client-list";
import { ActivitiesService } from "../../../core/services/activities.service";
import { ToastService } from "../../../core/services/toast.service";
import { ConfirmService } from "../../../core/services/confirm.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { EmptyStateComponent } from "../../../shared/components/empty-state.component";
import { ModalComponent } from "../../../shared/components/modal.component";
import { SpinnerComponent } from "../../../shared/components/spinner.component";
import { StatusBadgeComponent } from "../../../shared/components/status-badge.component";
import { HighlightPipe } from "../../../shared/pipes/highlight.pipe";
import { PaginationComponent } from "../../../shared/components/pagination.component";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { ActionMenuComponent } from "../../../shared/ui/action-menu.component";
import { MoneyPipe } from "../../../shared/pipes/money.pipe";
import { PageHeaderComponent } from "../../../shared/ui/page-header.component";
import { CatalogueStore } from "../catalogue/catalogue.store";
import { ActivityPickerComponent } from "../../../shared/ui/activity-picker.component";

@Component({
  selector: "app-activities",
  standalone: true,
  imports: [
    PageHeaderComponent,
    FormsModule,
    ReactiveFormsModule,
    MoneyPipe,
    TranslateModule,
    EmptyStateComponent,
    ModalComponent,
    SpinnerComponent,
    StatusBadgeComponent,
    HighlightPipe,
    PaginationComponent,
    SkeletonComponent,
    ErrorStateComponent,
    ActionMenuComponent,
    ActivityPickerComponent,
  ],
  templateUrl: "./activities.component.html",
  styleUrl: "./activities.component.scss",
})
export class ActivitiesComponent implements OnInit {
  /**
   * Rendered inside the catalogue page rather than on a route of its own.
   * A price only exists where a plan crosses an activity, so the two belong
   * on one screen; the shell supplies the heading when they are there.
   */
  @Input() embedded = false;

  readonly store = inject(CatalogueStore);
  private readonly activityTemplates = inject(ActivityTemplatesService);
  readonly loading = this.store.loading;
  readonly error = this.store.error;
  readonly saving = signal(false);
  readonly activities = this.store.activities;
  readonly modalOpen = signal(false);
  readonly editing = signal<Activity | null>(null);
  readonly formError = signal<string | null>(null);

  // ---- adding from the platform's catalogue ------------------------------
  // The usual way in: pick disciplines from tiles, each becoming one of the
  // gym's own activities. The blank form is still there for anything else.
  readonly catalogueOpen = signal(false);
  readonly templates = signal<ActivityTemplate[]>([]);
  readonly templatesLoading = signal(false);
  readonly catalogueSelection = signal<string[]>([]);
  readonly adopting = signal(false);
  /** Templates this gym already teaches — the picker marks them. */
  readonly adoptedTemplateIds = computed(() =>
    this.activities().flatMap((a) => (a.activity_template_id ? [a.activity_template_id] : []))
  );

  readonly search = signal("");
  readonly page = signal(1);
  readonly filtered = computed(() =>
    filterBySearch(this.activities(), this.search(), (a) => [a.name])
  );
  readonly pagedActivities = computed(() => pageSlice(this.filtered(), this.page()));
  readonly meta = computed(() => clientPageMeta(this.filtered().length, this.page()));

  readonly sessionFormats: { value: SessionFormat; labelKey: string; hintKey: string; preset: number }[] = [
    { value: "individual", labelKey: "activities.format_individual", hintKey: "activities.format_individual_hint", preset: 1 },
    { value: "small_group", labelKey: "activities.format_small_group", hintKey: "activities.format_small_group_hint", preset: 6 },
    { value: "collective", labelKey: "activities.format_collective", hintKey: "activities.format_collective_hint", preset: 15 },
  ];

  /** Live capacity bounds for the currently-selected format. */
  readonly capacityBounds = signal(CAPACITY_BOUNDS.collective);

  // A curated set, not an exhaustive picker — covers the activity types a
  // gym/studio actually creates, so staff can click instead of hunting for
  // an emoji to type/paste.
  readonly emojiChoices: string[] = [
    "🏋️", "💪", "🤸", "🧘", "🥊", "🥋", "🚴", "🏃", "🏊", "⚡",
    "🤾", "🏓", "🏸", "⚽", "🏀", "🏐", "🕺", "💃", "🩰", "🥇",
    "🔥", "🕉️", "🏹", "🎽",
  ];

  readonly form = this.fb.nonNullable.group({
    name: ["", Validators.required],
    emoji: ["", Validators.maxLength(4)],
    description: [""],
    session_format: ["collective" as SessionFormat, Validators.required],
    duration: [60, [Validators.required, Validators.min(1)]],
    capacity: [15, [Validators.required, Validators.min(1)]],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly activitiesService: ActivitiesService,
    private readonly toast: ToastService,
    private readonly confirm: ConfirmService,
    private readonly route: ActivatedRoute,
    private readonly translate: TranslateService
  ) {
    // Any new search term resets to the first page.
    effect(() => {
      this.search();
      this.page.set(1);
    }, { allowSignalWrites: true });

    // "Create an activity" asked for from the setup steps or another tab —
    // which, for a gym, starts from the catalogue.
    effect(() => {
      if (this.loading()) return;
      if (this.store.takeCreateRequest("activity")) untracked(() => this.openCatalogue());
    }, { allowSignalWrites: true });

    // The session format drives the capacity range: keep the capacity field's
    // bounds + value coherent whenever the admin switches format.
    this.form.controls.session_format.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((format) => this.applyFormat(format, { snap: true }));
  }

  /** Sync the capacity control (bounds + value) to a session format. */
  private applyFormat(format: SessionFormat, opts: { snap: boolean }): void {
    const bounds = CAPACITY_BOUNDS[format];
    this.capacityBounds.set(bounds);

    const validators = [Validators.required, Validators.min(bounds.min)];
    if (bounds.max !== null) validators.push(Validators.max(bounds.max));
    const capacity = this.form.controls.capacity;
    capacity.setValidators(validators);

    if (format === "individual") {
      capacity.setValue(1, { emitEvent: false });
      capacity.disable({ emitEvent: false });
    } else {
      capacity.enable({ emitEvent: false });
      const current = capacity.value;
      const outOfRange = current < bounds.min || (bounds.max !== null && current > bounds.max);
      if (opts.snap && outOfRange) {
        capacity.setValue(this.sessionFormats.find((f) => f.value === format)!.preset, { emitEvent: false });
      }
    }
    capacity.updateValueAndValidity({ emitEvent: false });
  }

  ngOnInit(): void {
    this.store.loadOnce();
    if (this.route.snapshot.queryParamMap.get("action") === "new") this.store.requestCreate("activity");
  }

  load(): void {
    this.store.reload();
  }

  /** Read off the formules, so a price typed in the grid shows here at once. */
  pricesOf(activity: Activity): { plan: { id: string; name: string; currency: string }; price: number }[] {
    return this.store.pricesForActivity(activity.id);
  }

  openCatalogue(): void {
    this.catalogueSelection.set([]);
    this.catalogueOpen.set(true);
    if (this.templates().length > 0 || this.templatesLoading()) return;

    this.templatesLoading.set(true);
    this.activityTemplates.list().subscribe({
      next: (res) => {
        this.templates.set(res.activity_templates);
        this.templatesLoading.set(false);
      },
      error: (err) => {
        this.templatesLoading.set(false);
        this.catalogueOpen.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  closeCatalogue(): void {
    this.catalogueOpen.set(false);
  }

  /** Something the catalogue does not have: the blank form instead. */
  createFromScratch(): void {
    this.catalogueOpen.set(false);
    this.openCreate();
  }

  adoptSelected(): void {
    const ids = this.catalogueSelection();
    if (ids.length === 0 || this.adopting()) return;

    this.adopting.set(true);
    this.activitiesService.adopt(ids).subscribe({
      next: (res) => {
        this.adopting.set(false);
        this.catalogueOpen.set(false);
        this.toast.success(this.translate.instant("activity_catalogue.added", { count: res.activities.length }));
        this.load();
      },
      error: (err) => {
        this.adopting.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  openCreate(): void {
    this.editing.set(null);
    this.form.reset(
      { session_format: "collective", duration: 60, capacity: 15, emoji: "" },
      { emitEvent: false }
    );
    this.applyFormat("collective", { snap: false });
    this.formError.set(null);
    this.modalOpen.set(true);
  }

  openEdit(activity: Activity): void {
    this.editing.set(activity);
    this.form.setValue({
      name: activity.name,
      emoji: activity.emoji || "",
      description: activity.description || "",
      session_format: activity.session_format,
      duration: activity.duration,
      capacity: activity.capacity,
    }, { emitEvent: false });
    this.applyFormat(activity.session_format, { snap: false });
    this.formError.set(null);
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  selectEmoji(emoji: string): void {
    const current = this.form.controls.emoji.value;
    this.form.controls.emoji.setValue(current === emoji ? "" : emoji);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const payload = this.form.getRawValue();
    const editing = this.editing();
    const request = editing
      ? this.activitiesService.update(editing.id, payload)
      : this.activitiesService.create(payload);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalOpen.set(false);
        this.toast.success(this.translate.instant("common.save"));
        this.load();
      },
      error: (err) => {
        this.saving.set(false);
        this.formError.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  async deactivate(activity: Activity): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: this.translate.instant("common.deactivate") + " " + activity.name + "?",
      body: this.translate.instant("common.confirm"),
      confirmLabel: this.translate.instant("common.deactivate"),
      danger: true,
    });
    if (!confirmed) return;

    this.activitiesService.deactivate(activity.id).subscribe({
      next: () => {
        this.toast.success(this.translate.instant("common.deactivate"));
        this.load();
      },
      error: (err) => this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic"))),
    });
  }
}
