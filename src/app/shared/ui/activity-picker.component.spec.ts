import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { ActivityTemplate } from "../../core/models/activity-template.model";
import { ActivityPickerComponent } from "./activity-picker.component";

describe("ActivityPickerComponent", () => {
  let fixture: ComponentFixture<ActivityPickerComponent>;
  let component: ActivityPickerComponent;

  const template = (id: string, family: ActivityTemplate["family"], fr: string, en: string): ActivityTemplate => ({
    id, key: id, family, emoji: "•", names: { fr, en }, session_format: "collective", duration: 60, capacity: 15,
  });
  const boxe = template("boxe", "combat", "Boxe", "Boxing");
  const yoga = template("yoga", "wellness", "Yoga", "Yoga");
  const reformer = template("reformer", "wellness", "Pilates Reformer", "Reformer Pilates");

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ActivityPickerComponent, TranslateModule.forRoot()] });
    TestBed.inject(TranslateService).use("fr");
    fixture = TestBed.createComponent(ActivityPickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput("templates", [boxe, yoga, reformer]);
    fixture.detectChanges();
  });

  it("groups the catalogue family by family, in the catalogue's order", () => {
    expect(component.groups().map((g) => g.family)).toEqual(["wellness", "combat"]);
    expect(component.groups()[0].tiles.map((t) => t.name)).toEqual(["Yoga", "Pilates Reformer"]);
  });

  it("finds a template by any of its names, ignoring case and accents", () => {
    component.search.set("REFORMER");
    expect(component.groups().flatMap((g) => g.tiles.map((t) => t.template.id))).toEqual(["reformer"]);

    component.search.set("boxing");
    expect(component.groups().flatMap((g) => g.tiles.map((t) => t.template.id))).toEqual(["boxe"]);
  });

  it("toggles a tile in and out of the selection", () => {
    component.toggle(boxe);
    component.toggle(yoga);
    expect(component.selected()).toEqual(["boxe", "yoga"]);

    component.toggle(boxe);
    expect(component.selected()).toEqual(["yoga"]);
    expect(component.count()).toBe(1);
  });

  it("marks the tile as a checked checkbox", () => {
    component.toggle(boxe);
    fixture.detectChanges();

    const checked = fixture.nativeElement.querySelectorAll('.ap-tile[aria-checked="true"]');
    expect(checked.length).toBe(1);
    expect(checked[0].textContent).toContain("Boxe");
  });

  it("adds an activity of the gym's own from the Other tile, starting from the search term", () => {
    component.search.set("Aerial yoga");
    component.openCustom();
    expect(component.customName()).toBe("Aerial yoga");

    component.pickEmoji("🤸");
    component.addCustom();

    expect(component.custom()).toEqual([{ name: "Aerial yoga", emoji: "🤸" }]);
    expect(component.customOpen()).toBe(false);
    expect(component.count()).toBe(1);

    component.removeCustom(0);
    expect(component.custom()).toEqual([]);
  });

  it("will not add an activity with no name", () => {
    component.openCustom();
    component.customName.set("   ");
    component.addCustom();

    expect(component.custom()).toEqual([]);
  });

  it("says when a template is already in the gym", () => {
    fixture.componentRef.setInput("adoptedIds", ["yoga"]);
    expect(component.isAdopted("yoga")).toBe(true);
    expect(component.isAdopted("boxe")).toBe(false);
  });
});
