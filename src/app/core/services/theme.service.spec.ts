import { TestBed } from "@angular/core/testing";
import { ThemeService } from "./theme.service";

describe("ThemeService", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to light when nothing is stored", () => {
    localStorage.clear();
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("restores a stored dark theme on construction", () => {
    localStorage.setItem("fitora_theme", "dark");
    TestBed.resetTestingModule();
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("setTheme updates the signal, storage, and the DOM attribute", () => {
    const service = TestBed.inject(ThemeService);
    service.setTheme("dark");
    expect(service.theme()).toBe("dark");
    expect(localStorage.getItem("fitora_theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggle() flips between light and dark", () => {
    localStorage.clear();
    const service = TestBed.inject(ThemeService);
    service.toggle();
    expect(service.theme()).toBe("dark");
    service.toggle();
    expect(service.theme()).toBe("light");
  });
});
