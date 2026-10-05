import { Component, OnInit, inject, signal } from "@angular/core";
import { DatePipe } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { SupportTicket } from "../../../core/models/support-ticket.model";
import { SupportTicketsService } from "../../../core/services/support-tickets.service";
import { ToastService } from "../../../core/services/toast.service";
import { extractErrorMessage } from "../../../core/services/error.util";
import { SpinnerComponent } from "../../../shared/components/spinner.component";

const MAX_FILES = 5;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf", "video/mp4", "video/quicktime", "video/webm"];

/**
 * Writing to Fitora: a problem report with optional attachments, plus the
 * gym's own history of what it has already asked.
 *
 * It used to be a tab on the subscription page, which is why the navbar's
 * Support button led to `/admin/subscription?tab=contact`. That tab went
 * away with the ledger rework and the button led nowhere, so the form lives
 * on its own page now — support is not a billing question.
 */
@Component({
  selector: "app-admin-support",
  standalone: true,
  imports: [FormsModule, DatePipe, TranslateModule, SpinnerComponent],
  templateUrl: "./support.component.html",
  styleUrl: "./support.component.scss",
})
export class AdminSupportComponent implements OnInit {
  private readonly ticketsService = inject(SupportTicketsService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly tickets = signal<SupportTicket[]>([]);
  readonly loadingTickets = signal(false);
  readonly subject = signal("");
  readonly message = signal("");
  readonly files = signal<File[]>([]);
  readonly fileError = signal<string | null>(null);
  readonly submitting = signal(false);

  ngOnInit(): void {
    this.loadTickets();
  }

  loadTickets(): void {
    this.loadingTickets.set(true);
    this.ticketsService.list().subscribe({
      next: (res) => {
        this.tickets.set(res.support_tickets);
        this.loadingTickets.set(false);
      },
      error: () => this.loadingTickets.set(false),
    });
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = "";

    const combined = [...this.files(), ...picked];
    if (combined.length > MAX_FILES) {
      this.fileError.set(this.translate.instant("modules_page.contact.too_many_files", { max: MAX_FILES }));
      return;
    }
    const invalid = picked.find((f) => !ALLOWED_TYPES.includes(f.type) || f.size > MAX_FILE_SIZE);
    if (invalid) {
      this.fileError.set(this.translate.instant("modules_page.contact.invalid_file", { name: invalid.name }));
      return;
    }

    this.fileError.set(null);
    this.files.set(combined);
  }

  removeFile(index: number): void {
    this.files.update((files) => files.filter((_, i) => i !== index));
    this.fileError.set(null);
  }

  submit(): void {
    const subject = this.subject().trim();
    const message = this.message().trim();
    if (!subject || !message) return;

    this.submitting.set(true);
    this.ticketsService.create(subject, message, this.files()).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.tickets.update((list) => [res.support_ticket, ...list]);
        this.subject.set("");
        this.message.set("");
        this.files.set([]);
        this.toast.success(this.translate.instant("modules_page.contact.sent"));
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }
}
