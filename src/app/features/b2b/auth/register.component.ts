import { Component, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { AuthService } from "../../../core/auth/auth.service";
import { LocaleService } from "../../../core/services/locale.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { AuthProShellComponent } from "../../../shared/ui/auth-pro-shell.component";
import { SpinnerComponent } from "../../../shared/components/spinner.component";

/**
 * A gym opening its own account: three fields, then the address is confirmed
 * (/confirmation-email), then the gym itself is named on
 * /admin/setup-company, where the 14 days start.
 *
 * Split that way on purpose — five fields in front of someone who has not
 * seen the product yet is four too many.
 */
@Component({
  selector: "app-register",
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslateModule, AuthProShellComponent, SpinnerComponent],
  templateUrl: "./register.component.html",
  styleUrl: "../../auth/auth.component.scss",
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  /** Four things Fitora does, for the panel beside the form. */
  readonly pitchPoints = [
    "auth.pitch_point_booking",
    "auth.pitch_point_one_place",
    "auth.pitch_point_receipts",
    "auth.pitch_point_any_gym",
  ];

  readonly form = this.fb.nonNullable.group({
    first_name: ["", Validators.required],
    last_name: ["", Validators.required],
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(8)]],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.auth.register({ ...this.form.getRawValue(), locale: this.locale.locale() }).subscribe({
      next: () => {
        this.loading.set(false);
        // The link is on its way; the next screen waits for the click, then
        // hands over to naming the gym.
        this.router.navigateByUrl("/confirmation-email");
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }
}
