import { Component, computed, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { AuthService } from "../../../core/auth/auth.service";
import { LocaleService } from "../../../core/services/locale.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { AuthProShellComponent } from "../../../shared/ui/auth-pro-shell.component";
import { SpinnerComponent } from "../../../shared/components/spinner.component";

/**
 * Sign-in for a gym: its admin and its staff. A member's account is refused
 * here — not because it is invalid, but because it belongs to the other zone,
 * so the session is dropped again and the page points at /connexion rather
 * than dumping someone into a back office that has nothing for them.
 */
@Component({
  selector: "app-pro-login",
  standalone: true,
  imports: [AuthProShellComponent, ReactiveFormsModule, RouterLink, TranslateModule, SpinnerComponent],
  templateUrl: "./pro-login.component.html",
  styleUrl: "../../auth/auth.component.scss",
})
export class ProLoginComponent {
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  private readonly locale = inject(LocaleService);

  /** Today, in the page's language, for the panel's day card. */
  readonly todayLabel = computed(() => {
    const code = this.locale.locale() === "ar" ? "ar-TN" : this.locale.locale();
    const label = new Intl.DateTimeFormat(code, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    return label.charAt(0).toLocaleUpperCase(code) + label.slice(1);
  });

  readonly form = this.fb.nonNullable.group({
    email: ["", [Validators.required, Validators.email]],
    password: ["", Validators.required],
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly translate: TranslateService
  ) {}

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl(this.auth.homeRouteForCurrentUser());
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(err, this.translate.instant("auth.invalid_credentials")));
      },
    });
  }
}
