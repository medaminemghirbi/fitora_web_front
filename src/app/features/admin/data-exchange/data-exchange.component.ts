import { Component, computed, inject, signal } from "@angular/core";
import { AuthService } from "../../../core/auth/auth.service";
import { FormsModule } from "@angular/forms";
import { TranslateModule, TranslateService } from "@ngx-translate/core";
import { DataExchangeEntity, DataExchangeService, ImportResult } from "../../../core/services/data-exchange.service";
import { downloadBlob } from "../../../core/services/download.util";
import { extractErrorMessage } from "../../../core/services/error.util";
import { parseCsv } from "../../../core/services/csv.util";
import { ToastService } from "../../../core/services/toast.service";
import { SpinnerComponent } from "../../../shared/components/spinner.component";

interface EntityCard {
  entity: DataExchangeEntity;
  icon: string;
  titleKey: string;
  descKey: string;
}

const ENTITIES: EntityCard[] = [
  { entity: "clients", icon: "bi-people", titleKey: "nav.clients", descKey: "data_exchange.clients_desc" },
  { entity: "activities", icon: "bi-lightning-charge", titleKey: "activities.title", descKey: "data_exchange.activities_desc" },
  { entity: "contracts", icon: "bi-file-earmark-text", titleKey: "nav.subscriptions", descKey: "data_exchange.contracts_desc" },
  { entity: "payments", icon: "bi-credit-card", titleKey: "nav.payments", descKey: "data_exchange.payments_desc" },
];

// Preview only the first N data rows — a large file would otherwise render
// hundreds of table rows before the admin has even confirmed the import.
const PREVIEW_ROW_LIMIT = 20;

@Component({
  selector: "app-data-exchange",
  standalone: true,
  imports: [FormsModule, TranslateModule, SpinnerComponent],
  templateUrl: "./data-exchange.component.html",
  styleUrl: "./data-exchange.component.scss",
})
export class DataExchangeComponent {
  /** Bulk export is the admin's alone; importing follows the entity's permission. */
  readonly isAdmin = inject(AuthService).isAdmin;
  readonly entities = ENTITIES;

  readonly selectedEntity = signal<DataExchangeEntity>("clients");
  readonly selectedCard = computed(() => this.entities.find((e) => e.entity === this.selectedEntity())!);

  readonly downloadingTemplate = signal(false);
  readonly exporting = signal(false);
  readonly importing = signal(false);
  readonly results = signal<Partial<Record<DataExchangeEntity, ImportResult>>>({});

  // The picked file, parsed client-side and shown for review — nothing is
  // sent to the backend until the admin confirms with "Importer".
  readonly previewFile = signal<File | null>(null);
  readonly previewHeaders = signal<string[]>([]);
  readonly previewRows = signal<string[][]>([]);
  readonly previewTotalRows = signal(0);
  readonly previewError = signal<string | null>(null);

  constructor(
    private readonly dataExchange: DataExchangeService,
    private readonly toast: ToastService,
    private readonly translate: TranslateService
  ) {}

  selectEntity(entity: DataExchangeEntity): void {
    if (entity === this.selectedEntity()) return;
    this.selectedEntity.set(entity);
    this.clearPreview();
  }

  downloadTemplate(): void {
    const entity = this.selectedEntity();
    this.downloadingTemplate.set(true);
    this.dataExchange.template(entity).subscribe({
      next: (blob) => {
        this.downloadingTemplate.set(false);
        downloadBlob(blob, `fitora-${entity}-modele.csv`);
      },
      error: () => {
        this.downloadingTemplate.set(false);
        this.toast.error(this.translate.instant("common.error_generic"));
      },
    });
  }

  exportData(): void {
    const entity = this.selectedEntity();
    this.exporting.set(true);
    this.dataExchange.export(entity).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        downloadBlob(blob, `fitora-${entity}-export.csv`);
      },
      error: () => {
        this.exporting.set(false);
        this.toast.error(this.translate.instant("common.error_generic"));
      },
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    this.results.update((r) => ({ ...r, [this.selectedEntity()]: undefined }) as Partial<Record<DataExchangeEntity, ImportResult>>);
    this.previewError.set(null);

    const reader = new FileReader();
    reader.onload = () => {
      const rows = parseCsv(String(reader.result ?? ""));
      if (rows.length === 0) {
        this.previewError.set(this.translate.instant("data_exchange.preview_empty"));
        return;
      }
      this.previewFile.set(file);
      this.previewHeaders.set(rows[0]);
      this.previewTotalRows.set(rows.length - 1);
      this.previewRows.set(rows.slice(1, 1 + PREVIEW_ROW_LIMIT));
    };
    reader.onerror = () => this.previewError.set(this.translate.instant("data_exchange.preview_empty"));
    reader.readAsText(file);
  }

  clearPreview(): void {
    this.previewFile.set(null);
    this.previewHeaders.set([]);
    this.previewRows.set([]);
    this.previewTotalRows.set(0);
    this.previewError.set(null);
  }

  confirmImport(): void {
    const file = this.previewFile();
    const entity = this.selectedEntity();
    if (!file) return;

    this.importing.set(true);
    this.dataExchange.import(entity, file).subscribe({
      next: (result) => {
        this.importing.set(false);
        this.results.update((r) => ({ ...r, [entity]: result }));
        this.clearPreview();
        if (result.created > 0) {
          this.toast.success(this.translate.instant("data_exchange.import_created", { count: result.created }));
        }
        if (result.errors.length > 0 && result.created === 0) {
          this.toast.error(this.translate.instant("data_exchange.import_failed"));
        }
      },
      error: (err) => {
        this.importing.set(false);
        this.toast.error(extractErrorMessage(err, this.translate.instant("common.error_generic")));
      },
    });
  }
}
