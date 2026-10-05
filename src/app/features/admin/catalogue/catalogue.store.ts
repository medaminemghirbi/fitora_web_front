import { Injectable, computed, inject, signal } from "@angular/core";
import { forkJoin } from "rxjs";
import { ConfigurationService } from "../../../core/configuration/configuration.service";
import { Activity } from "../../../core/models/activity.model";
import { ContractType } from "../../../core/models/contract-type.model";
import { Pack } from "../../../core/models/pack.model";
import { ActivitiesService } from "../../../core/services/activities.service";
import { ContractTypesService } from "../../../core/services/contract-types.service";
import { PacksService } from "../../../core/services/packs.service";

export type CatalogueKind = "activity" | "plan" | "pack";

/**
 * The catalogue's one copy of what the gym sells: activities, formules and
 * packs, loaded together.
 *
 * Each tab used to fetch its own half, so a price typed on one screen left
 * the other showing the old one, and the page itself could not count what it
 * held. Provided by CatalogueComponent, so it lives as long as the page.
 */
@Injectable()
export class CatalogueStore {
  readonly activities = signal<Activity[]>([]);
  readonly plans = signal<ContractType[]>([]);
  readonly packs = signal<Pack[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);

  readonly activeActivities = computed(() => this.activities().filter((a) => a.active));
  readonly activePlans = computed(() => this.plans().filter((p) => p.active));
  readonly activePacks = computed(() => this.packs().filter((p) => p.active));

  /**
   * Packs are opt-in (Settings → Booking). A studio teaching one discipline
   * has nothing to bundle, so the catalogue never mentions them unless the
   * gym turned them on.
   */
  private readonly configuration = inject(ConfigurationService);
  readonly packsEnabled = computed(() => !!this.configuration.features()["packs"]);

  /**
   * A "create one" asked for from elsewhere on the page (the setup steps),
   * picked up by the tab that owns that form once it is on screen.
   */
  private readonly createRequest = signal<CatalogueKind | null>(null);

  private loaded = false;

  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly contractTypesService: ContractTypesService,
    private readonly packsService: PacksService
  ) {}

  /** Loads the first time any part of the page asks, and only then. */
  loadOnce(): void {
    if (!this.loaded) this.reload();
  }

  /**
   * Fetches all three again. Only the first load shows as loading: after a
   * save, the lists stay on screen and change in place rather than blinking
   * to a skeleton and back.
   */
  reload(): void {
    const first = !this.loaded;
    this.loaded = true;
    if (first) this.loading.set(true);
    this.error.set(false);
    forkJoin({
      activities: this.activitiesService.list(),
      plans: this.contractTypesService.list(),
      packs: this.packsService.list(),
    }).subscribe({
      next: ({ activities, plans, packs }) => {
        this.activities.set(activities.activities);
        this.plans.set(plans.plans);
        this.packs.set(packs.packs);
        this.loading.set(false);
      },
      error: () => {
        // A failed refresh keeps what is on screen; only a page with nothing
        // to show turns into the error state.
        if (first) this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Swaps in one formule as the API returned it, without refetching the rest. */
  replacePlan(plan: ContractType): void {
    this.plans.update((plans) => plans.map((p) => (p.id === plan.id ? plan : p)));
  }

  /** What each formule charges for this activity — read off the formules, so it is never stale. */
  pricesForActivity(activityId: string): { plan: ContractType; price: number }[] {
    return this.plans().flatMap((plan) => {
      const row = plan.activity_prices.find((r) => r.activity_id === activityId);
      return row ? [{ plan, price: Number(row.price) }] : [];
    });
  }

  pricesForPack(packId: string): { plan: ContractType; price: number }[] {
    return this.plans().flatMap((plan) => {
      const row = (plan.pack_prices ?? []).find((r) => r.pack_id === packId);
      return row ? [{ plan, price: Number(row.price) }] : [];
    });
  }

  packsWith(activityId: string): Pack[] {
    return this.packs().filter((p) => p.active && p.activity_ids.includes(activityId));
  }

  requestCreate(kind: CatalogueKind): void {
    this.createRequest.set(kind);
  }

  /** True once, for the tab whose form was asked for. */
  takeCreateRequest(kind: CatalogueKind): boolean {
    if (this.createRequest() !== kind) return false;
    this.createRequest.set(null);
    return true;
  }
}
