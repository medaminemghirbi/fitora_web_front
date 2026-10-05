import { ComponentFixture, TestBed } from "@angular/core/testing";
import { TranslateModule } from "@ngx-translate/core";
import { of, throwError } from "rxjs";
import { SuperadminSupportTicket } from "../../../core/models/support-ticket.model";
import { SuperadminSupportTicketsService } from "../../../core/services/superadmin-support-tickets.service";
import { ToastService } from "../../../core/services/toast.service";
import { SuperadminSupportTicketsComponent } from "./support-tickets.component";

describe("SuperadminSupportTicketsComponent", () => {
  let fixture: ComponentFixture<SuperadminSupportTicketsComponent>;
  let component: SuperadminSupportTicketsComponent;
  let service: jasmine.SpyObj<SuperadminSupportTicketsService>;
  let toast: ToastService;

  const ticket: SuperadminSupportTicket = {
    id: "t1",
    subject: "Help",
    message: "Something's broken",
    status: "open",
    kind: "general",
    contact_phone: null,
    created_at: "2026-01-01T00:00:00Z",
    attachments: [],
    company: { id: "co1", name: "Acme Gym" },
    created_by: { id: "u1", full_name: "Sami Admin", email: "sami@x.test" },
  };

  beforeEach(async () => {
    service = jasmine.createSpyObj<SuperadminSupportTicketsService>("SuperadminSupportTicketsService", ["list", "resolve"]);
    service.list.and.returnValue(of({ support_tickets: [ticket], meta: { page: 1, per_page: 20, total: 1, total_pages: 1 } }));

    await TestBed.configureTestingModule({
      imports: [SuperadminSupportTicketsComponent, TranslateModule.forRoot()],
      providers: [{ provide: SuperadminSupportTicketsService, useValue: service }],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperadminSupportTicketsComponent);
    component = fixture.componentInstance;
    toast = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  it("loads open tickets by default", () => {
    expect(service.list).toHaveBeenCalledWith("open");
    expect(component.tickets().length).toBe(1);
  });

  it("sets the error flag when loading fails", () => {
    service.list.and.returnValue(throwError(() => new Error("nope")));
    component.load();
    expect(component.error()).toBe(true);
  });

  it("setFilter('all') reloads with no status filter", () => {
    component.setFilter("all");
    expect(component.filter()).toBe("all");
    expect(service.list).toHaveBeenCalledWith(undefined);
  });

  // Fitora calls back to set a requested plan up: the number is the first
  // thing to act on, one click from dialling.
  it("marks a plan request and puts its number one click from dialling", () => {
    service.list.and.returnValue(
      of({
        support_tickets: [{ ...ticket, kind: "upgrade", contact_phone: "+216 22 123 456" }],
        meta: { page: 1, per_page: 20, total: 1, total_pages: 1 },
      })
    );
    component.load();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector(".ticket-kind")).not.toBeNull();
    const phone: HTMLAnchorElement = fixture.nativeElement.querySelector("a.ticket-phone");
    expect(phone.getAttribute("href")).toBe("tel:+21622123456");
    expect(phone.textContent).toContain("+216 22 123 456");
  });

  it("open()/close() track the selected ticket", () => {
    component.open(ticket);
    expect(component.selected()).toBe(ticket);
    component.close();
    expect(component.selected()).toBeNull();
  });

  it("resolve() removes the ticket from an 'open' list and shows a success toast", () => {
    const resolved = { ...ticket, status: "resolved" } as SuperadminSupportTicket;
    service.resolve.and.returnValue(of({ support_ticket: resolved }));

    component.resolve(ticket);

    expect(component.resolving()).toBe(false);
    expect(component.selected()).toEqual(resolved);
    expect(component.tickets().length).toBe(0);
    expect(toast.toasts()[0].kind).toBe("success");
  });

  it("resolve() updates in place (not removed) when filter is 'all'", () => {
    const other: SuperadminSupportTicket = { ...ticket, id: "t2" };
    service.list.and.returnValue(of({ support_tickets: [ticket, other], meta: { page: 1, per_page: 20, total: 2, total_pages: 1 } }));
    component.setFilter("all");
    const resolved = { ...ticket, status: "resolved" } as SuperadminSupportTicket;
    service.resolve.and.returnValue(of({ support_ticket: resolved }));

    component.resolve(ticket);

    expect(component.tickets()[0]).toEqual(resolved);
    expect(component.tickets()[1]).toEqual(other);
  });

  it("resolve() shows an error toast on failure", () => {
    service.resolve.and.returnValue(throwError(() => new Error("nope")));
    component.resolve(ticket);
    expect(component.resolving()).toBe(false);
    expect(toast.toasts()[0].kind).toBe("error");
  });
});
