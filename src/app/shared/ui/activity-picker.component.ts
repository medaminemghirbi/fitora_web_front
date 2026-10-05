import { Component, DestroyRef, computed, inject, input, model, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import {
  ACTIVITY_FAMILIES,
  ActivityFamily,
  ActivityTemplate,
  CustomActivity,
  templateName,
} from "../../core/models/activity-template.model";

/** Lower-case, accents off — so "pilate", "Pilates" and "PILATÈS" all match. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * The activity catalogue as a grid of tiles, family by family — what a gym
 * picks its activities from when it opens, and again from the activities
 * page later on.
 *
 * Several can be picked. A discipline the catalogue lacks is added from the
 * "Autre" tile with a name and an emoji of the gym's own. Templates the gym
 * already teaches say so, but stay pickable: "Pilates débutants" and
 * "Pilates avancés" can both start from the same one.
 */
@Component({
  selector: "app-activity-picker",
  standalone: true,
  imports: [FormsModule, TranslateModule],
  templateUrl: "./activity-picker.component.html",
  styleUrl: "./activity-picker.component.scss",
})
export class ActivityPickerComponent {
  private readonly translate = inject(TranslateService);

  readonly templates = input<ActivityTemplate[]>([]);
  /** Ids of the picked templates. */
  readonly selected = model<string[]>([]);
  /** Activities named by the gym itself. */
  readonly custom = model<CustomActivity[]>([]);
  /** Templates the gym already has an activity from. */
  readonly adoptedIds = input<string[]>([]);
  readonly allowCustom = input(true);

  readonly search = signal("");
  private readonly lang = signal(this.translate.currentLang || this.translate.defaultLang || "fr");

  readonly customOpen = signal(false);
  readonly customName = signal("");
  readonly customEmoji = signal<string | null>(null);

  // The same short list the activity form offers — enough to find one in a
  // click, rather than an emoji keyboard.
  readonly emojiChoices = ["🏋️", "💪", "🤸", "🧘", "🥊", "🥋", "🚴", "🏃", "🏊", "⚡", "🤾", "🏓", "🏸", "⚽", "🏀", "💃", "🩰", "🔥", "🎯", "🧗"];

  readonly groups = computed(() => {
    const term = fold(this.search());
    const lang = this.lang();
    const matches = (t: ActivityTemplate) =>
      !term || [t.key, ...Object.values(t.names)].some((name) => !!name && fold(name).includes(term));

    return ACTIVITY_FAMILIES.map((family) => ({
      family,
      tiles: this.templates()
        .filter((t) => t.family === family && matches(t))
        .map((t) => ({ template: t, name: templateName(t, lang) })),
    })).filter((group) => group.tiles.length > 0);
  });

  readonly count = computed(() => this.selected().length + this.custom().length);

  constructor() {
    this.translate.onLangChange.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((event) => this.lang.set(event.lang));
  }

  isSelected(id: string): boolean {
    return this.selected().includes(id);
  }

  isAdopted(id: string): boolean {
    return this.adoptedIds().includes(id);
  }

  toggle(template: ActivityTemplate): void {
    this.selected.update((ids) => (ids.includes(template.id) ? ids.filter((id) => id !== template.id) : [...ids, template.id]));
  }

  familyLabel(family: ActivityFamily): string {
    return `activity_catalogue.family_${family}`;
  }

  openCustom(): void {
    this.customName.set(this.search().trim());
    this.customEmoji.set(null);
    this.customOpen.set(true);
  }

  pickEmoji(emoji: string): void {
    this.customEmoji.update((current) => (current === emoji ? null : emoji));
  }

  addCustom(): void {
    const name = this.customName().trim();
    if (!name) return;
    this.custom.update((list) => [...list, { name, emoji: this.customEmoji() }]);
    this.customOpen.set(false);
    this.customName.set("");
    this.customEmoji.set(null);
  }

  removeCustom(index: number): void {
    this.custom.update((list) => list.filter((_, i) => i !== index));
  }
}
