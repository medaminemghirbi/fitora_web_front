import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { HttpErrorResponse } from "@angular/common/http";
import { signal } from "@angular/core";
import { AuthService } from "../../../core/auth/auth.service";
import { DataExchangeService } from "../../../core/services/data-exchange.service";
import { ToastService } from "../../../core/services/toast.service";
import { DataExchangeComponent } from "./data-exchange.component";

describe("DataExchangeComponent", () => {
  let fixture: ComponentFixture<DataExchangeComponent>;
  let component: DataExchangeComponent;
  let service: jasmine.SpyObj<DataExchangeService>;
  let toast: ToastService;

  function fileEvent(file: File | null): Event {
    const input = document.createElement("input");
    input.type = "file";
    spyOnProperty(input, "files").and.returnValue(file ? ([file] as unknown as FileList) : null);
    return { target: input } as unknown as Event;
  }

  // FileReader.readAsText is async in real browsers; drive it synchronously
  // in tests via a stub that immediately fires onload with the given text.
  function stubFileReader(text: string): void {
    class FakeFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsText(): void {
        this.result = text;
        this.onload?.();
      }
    }
    spyOn(window, "FileReader").and.returnValue(new FakeFileReader() as unknown as FileReader);
  }

  beforeEach(async () => {
    service = jasmine.createSpyObj<DataExchangeService>("DataExchangeService", ["template", "export", "import"]);

    await TestBed.configureTestingModule({
      imports: [DataExchangeComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DataExchangeService, useValue: service },
        { provide: AuthService, useValue: { isAdmin: signal(true) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DataExchangeComponent);
    component = fixture.componentInstance;
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it("lists all four entities and defaults to clients", () => {
    expect(component.entities.map((e) => e.entity)).toEqual(["clients", "activities", "contracts", "payments"]);
    expect(component.selectedEntity()).toBe("clients");
  });

  describe("selectEntity", () => {
    it("switches the selected entity and clears any preview in progress", () => {
      stubFileReader("first_name,last_name,email,phone\nA,B,a@b.com,123\n");
      component.onFileSelected(fileEvent(new File(["x"], "c.csv")));
      expect(component.previewFile()).not.toBeNull();

      component.selectEntity("payments");

      expect(component.selectedEntity()).toBe("payments");
      expect(component.previewFile()).toBeNull();
    });

    it("does nothing when re-selecting the already active entity", () => {
      stubFileReader("first_name,last_name,email,phone\nA,B,a@b.com,123\n");
      component.onFileSelected(fileEvent(new File(["x"], "c.csv")));

      component.selectEntity("clients");

      expect(component.previewFile()).not.toBeNull();
    });
  });

  describe("downloadTemplate", () => {
    it("downloads the template blob and clears the loading flag", () => {
      service.template.and.returnValue(of(new Blob(["x"])));
      component.downloadTemplate();
      expect(service.template).toHaveBeenCalledWith("clients");
      expect(component.downloadingTemplate()).toBe(false);
    });

    it("shows an error toast on failure", () => {
      service.template.and.returnValue(throwError(() => new Error("nope")));
      component.downloadTemplate();
      expect(component.downloadingTemplate()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("error");
    });
  });

  describe("exportData", () => {
    it("downloads the export blob and clears the loading flag", () => {
      service.export.and.returnValue(of(new Blob(["x"])));
      component.exportData();
      expect(service.export).toHaveBeenCalledWith("clients");
      expect(component.exporting()).toBe(false);
    });

    it("shows an error toast on failure", () => {
      service.export.and.returnValue(throwError(() => new Error("nope")));
      component.exportData();
      expect(toast.toasts()[0].kind).toBe("error");
    });
  });

  describe("onFileSelected + preview", () => {
    it("does nothing when no file was picked", () => {
      component.onFileSelected(fileEvent(null));
      expect(component.previewFile()).toBeNull();
    });

    it("parses the CSV and fills the preview without calling the backend", () => {
      stubFileReader("first_name,last_name,email,phone\nRania,Ferjani,rania@example.com,123\nKarim,Nasri,karim@example.com,456\n");
      const file = new File(["x"], "clients.csv");

      component.onFileSelected(fileEvent(file));

      expect(service.import).not.toHaveBeenCalled();
      expect(component.previewFile()).toBe(file);
      expect(component.previewHeaders()).toEqual(["first_name", "last_name", "email", "phone"]);
      expect(component.previewRows().length).toBe(2);
      expect(component.previewTotalRows()).toBe(2);
    });

    it("caps the visible preview rows while keeping the true total", () => {
      const rows = Array.from({ length: 25 }, (_, i) => `A${i},B,a${i}@b.com,1`).join("\n");
      stubFileReader(`first_name,last_name,email,phone\n${rows}\n`);

      component.onFileSelected(fileEvent(new File(["x"], "clients.csv")));

      expect(component.previewTotalRows()).toBe(25);
      expect(component.previewRows().length).toBe(20);
    });

    it("sets a preview error for an unreadable/empty file", () => {
      stubFileReader("");
      component.onFileSelected(fileEvent(new File([""], "empty.csv")));

      expect(component.previewFile()).toBeNull();
      expect(component.previewError()).toBeTruthy();
    });
  });

  describe("clearPreview", () => {
    it("resets all preview state", () => {
      stubFileReader("first_name,last_name,email,phone\nA,B,a@b.com,1\n");
      component.onFileSelected(fileEvent(new File(["x"], "c.csv")));

      component.clearPreview();

      expect(component.previewFile()).toBeNull();
      expect(component.previewHeaders()).toEqual([]);
      expect(component.previewRows()).toEqual([]);
      expect(component.previewTotalRows()).toBe(0);
    });
  });

  describe("confirmImport", () => {
    it("does nothing without a previewed file", () => {
      component.confirmImport();
      expect(service.import).not.toHaveBeenCalled();
    });

    it("imports the previewed file, stores the result and clears the preview", () => {
      stubFileReader("first_name,last_name,email,phone\nA,B,a@b.com,1\n");
      const file = new File(["x"], "clients.csv");
      component.onFileSelected(fileEvent(file));

      service.import.and.returnValue(of({ created: 1, errors: [] }));
      component.confirmImport();

      expect(service.import).toHaveBeenCalledWith("clients", file);
      expect(component.importing()).toBe(false);
      expect(component.previewFile()).toBeNull();
      expect(component.results()["clients"]).toEqual({ created: 1, errors: [] });
      expect(toast.toasts()[0].kind).toBe("success");
    });

    it("toasts an error when every row failed", () => {
      stubFileReader("first_name,last_name,email,phone\nA,B,a@b.com,1\n");
      component.onFileSelected(fileEvent(new File(["x"], "clients.csv")));

      service.import.and.returnValue(of({ created: 0, errors: [{ row: 2, message: "bad" }] }));
      component.confirmImport();

      expect(toast.toasts()[0].kind).toBe("error");
    });

    it("shows the backend's error message when the request itself fails", () => {
      stubFileReader("first_name,last_name,email,phone\nA,B,a@b.com,1\n");
      component.onFileSelected(fileEvent(new File(["x"], "clients.csv")));

      service.import.and.returnValue(throwError(() => new HttpErrorResponse({ error: { error: "boom" } })));
      component.confirmImport();

      expect(component.importing()).toBe(false);
      expect(toast.toasts()[0].kind).toBe("error");
    });
  });
});
