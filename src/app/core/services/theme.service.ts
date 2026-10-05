import { Injectable, signal } from "@angular/core";

export type Theme = "light" | "dark";

const THEME_KEY = "fitora_theme";

@Injectable({ providedIn: "root" })
export class ThemeService {
  readonly theme = signal<Theme>(this.readStoredTheme());

  constructor() {
    this.applyTheme(this.theme());
  }

  toggle(): void {
    this.setTheme(this.theme() === "dark" ? "light" : "dark");
  }

  setTheme(theme: Theme): void {
    this.theme.set(theme);
    localStorage.setItem(THEME_KEY, theme);
    this.applyTheme(theme);
  }

  private applyTheme(theme: Theme): void {
    document.documentElement.setAttribute("data-theme", theme);
  }

  private readStoredTheme(): Theme {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "dark" ? "dark" : "light";
  }
}
