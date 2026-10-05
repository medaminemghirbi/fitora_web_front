import { Component, inject, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { AuthService } from "../../../core/auth/auth.service";
import { MemberService } from "../../../core/services/member.service";
import { extractErrorMessage, isErrorCode } from "../../../core/services/error.util";
import { ToastService } from "../../../core/services/toast.service";
import { EmptyStateComponent } from "../../../shared/components/empty-state.component";
import { ModalComponent } from "../../../shared/components/modal.component";
import { SkeletonComponent } from "../../../shared/ui/skeleton.component";
import { ErrorStateComponent } from "../../../shared/ui/error-state.component";
import { ChangePasswordComponent } from "../../../shared/ui/change-password.component";

/**
 * The member's own file: the subscription they train on, whether they have
 * been turning up — and their account: their name and phone, their password,
 * and leaving Fitora.
 *
 * No money anywhere on this screen. What a member owes is settled with the
 * desk; an app quoting a balance back at them invites an argument nobody
 * here can resolve.
 */
@Component({
  selector: "app-member-profile",
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    TranslateModule,
    EmptyStateComponent,
    ModalComponent,
    SkeletonComponent,
    ErrorStateComponent,
    ChangePasswordComponent,
  ],
  templateUrl: "./member-profile.component.html",
  styleUrl: "./member-profile.component.scss",
})
export class MemberProfileComponent {
  readonly member = inject(MemberService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly loading = signal(true);
  readonly error = signal(false);

  readonly editingDetails = signal(false);
  readonly savingDetails = signal(false);
  readonly detailsForm = this.fb.nonNullable.group({
    first_name: ["", Validators.required],
    last_name: ["", Validators.required],
    phone: ["", Validators.required],
  });

  readonly deleteOpen = signal(false);
  readonly deleting = signal(false);
  readonly deleteError = signal<string | null>(null);
  readonly deleteForm = this.fb.nonNullable.group({ password: ["", Validators.required] });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(false);
    this.member.load().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }

  editDetails(): void {
    const client = this.member.profile()?.client;
    if (!client) return;

    this.detailsForm.reset({ first_name: client.first_name, last_name: client.last_name, phone: client.phone ?? "" });
    this.editingDetails.set(true);
  }

  saveDetails(): void {
    if (this.detailsForm.invalid) {
      this.detailsForm.markAllAsTouched();
      return;
    }

    this.savingDetails.set(true);
    this.member.updateDetails(this.detailsForm.getRawValue()).subscribe({
      next: () => {
        this.savingDetails.set(false);
        this.editingDetails.set(false);
        this.toast.success(this.translate.instant("account.details_saved"));
      },
      error: (err) => {
        this.savingDetails.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }

  openDelete(): void {
    this.deleteForm.reset();
    this.deleteError.set(null);
    this.deleteOpen.set(true);
  }

  deleteAccount(): void {
    if (this.deleteForm.invalid) {
      this.deleteForm.markAllAsTouched();
      return;
    }

    this.deleting.set(true);
    this.deleteError.set(null);
    this.member.deleteAccount(this.deleteForm.getRawValue().password).subscribe({
      next: () => {
        this.deleting.set(false);
        this.deleteOpen.set(false);
        this.member.clear();
        this.toast.success(this.translate.instant("account.deleted"));
        this.auth.logout();
      },
      error: (err) => {
        this.deleting.set(false);
        this.deleteError.set(
          isErrorCode(err, "password_invalid")
            ? this.translate.instant("account.current_password_wrong")
            : extractErrorMessage(err, this.translate.instant("common.error_generic"))
        );
      },
    });
  }
}
