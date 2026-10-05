import { Component, OnInit, computed, inject } from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { ActivatedRoute, Router } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { map } from "rxjs";
import { PageHeaderComponent } from "../../../shared/ui/page-header.component";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { ActivitiesComponent } from "../activities/activities.component";
import { PacksComponent } from "../packs/packs.component";
import { PlansComponent } from "../plans/plans.component";
import { CatalogueKind, CatalogueStore } from "./catalogue.store";
import { PriceGridComponent } from "./price-grid.component";

export type CatalogueTab = "tarifs" | "activites" | "formules" | "packs";

const TABS: CatalogueTab[] = ["tarifs", "activites", "formules", "packs"];
const TAB_FOR: Record<CatalogueKind, CatalogueTab> = { activity: "activites", plan: "formules", pack: "packs" };

function asTab(value: string | null): CatalogueTab {
  return TABS.includes(value as CatalogueTab) ? (value as CatalogueTab) : "tarifs";
}

/**
 * What the gym sells: the activities it teaches, the formules that price
 * them, and the packs that sell several of them as one.
 *
 * Plans and activities used to face each other in two columns. With packs
 * there were three halves, and an empty gym saw two empty states, two
 * "create" buttons per column and no hint that activities come first. Now:
 *
 *   - one tab per kind of thing, each with a single way to create one;
 *   - a "Tarifs" tab where a price lives — the crossing of a formule with an
 *     activity or a pack — as one editable grid;
 *   - until the gym has an activity and a formule, that tab is a three-step
 *     guide in the order the steps have to be done.
 *
 * The tab is in the URL (?tab=), so a link and the back button land on it.
 */
@Component({
  selector: "app-catalogue",
  standalone: true,
  imports: [
    TranslateModule,
    PageHeaderComponent,
    SkeletonComponent,
    ErrorStateComponent,
    PlansComponent,
    ActivitiesComponent,
    PacksComponent,
    PriceGridComponent,
  ],
  providers: [CatalogueStore],
  templateUrl: "./catalogue.component.html",
  styleUrl: "./catalogue.component.scss",
})
export class CatalogueComponent implements OnInit {
  readonly store = inject(CatalogueStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly requestedTab = toSignal(this.route.queryParamMap.pipe(map((params) => asTab(params.get("tab")))), {
    initialValue: asTab(this.route.snapshot.queryParamMap.get("tab")),
  });

  /** The tab on screen — never packs for a gym that has them turned off. */
  readonly tab = computed<CatalogueTab>(() => {
    const requested = this.requestedTab();
    return requested === "packs" && !this.store.packsEnabled() ? "tarifs" : requested;
  });

  readonly tabs = computed(() => [
    { key: "tarifs" as const, labelKey: "catalogue.tab_prices", icon: "bi-grid-3x3-gap", count: null },
    { key: "activites" as const, labelKey: "nav.activities", icon: "bi-lightning-charge", count: this.store.activeActivities().length },
    { key: "formules" as const, labelKey: "nav.plans", icon: "bi-award", count: this.store.activePlans().length },
    ...(this.store.packsEnabled()
      ? [{ key: "packs" as const, labelKey: "catalogue.tab_packs", icon: "bi-collection", count: this.store.activePacks().length }]
      : []),
  ]);

  /** The grid needs something on both of its axes before it means anything. */
  readonly ready = computed(() => this.store.activeActivities().length > 0 && this.store.activePlans().length > 0);

  readonly activityCount = computed(() => this.store.activeActivities().length);
  readonly planCount = computed(() => this.store.activePlans().length);
  readonly packCount = computed(() => this.store.activePacks().length);

  ngOnInit(): void {
    this.store.loadOnce();
  }

  select(tab: CatalogueTab): void {
    // `action` is the old "?action=new" deep link — spent once a tab is picked.
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab, action: null }, queryParamsHandling: "merge" });
  }

  /** From a setup step: go to the tab that owns the form, and open it. */
  start(kind: CatalogueKind): void {
    this.store.requestCreate(kind);
    this.select(TAB_FOR[kind]);
  }
}
