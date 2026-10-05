import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { API_BASE_URL } from "../models/api-config";
import { ContractsService } from "./contracts.service";

describe("ContractsService", () => {
  let service: ContractsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ContractsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it("list GETs with a default page of 1", () => {
    service.list().subscribe();
    const req = httpMock.expectOne((r) => r.url === `${API_BASE_URL}/contracts`);
    expect(req.request.params.get("page")).toBe("1");
    req.flush({ contracts: [], meta: {} });
  });

  it("list forwards status/contract_type_id/q filters", () => {
    service.list({ status: "active", contract_type_id: "ct1", q: "amy", page: 2 }).subscribe();
    const req = httpMock.expectOne((r) => r.url === `${API_BASE_URL}/contracts`);
    expect(req.request.params.get("status")).toBe("active");
    expect(req.request.params.get("contract_type_id")).toBe("ct1");
    expect(req.request.params.get("q")).toBe("amy");
    expect(req.request.params.get("page")).toBe("2");
    req.flush({ contracts: [], meta: {} });
  });

  it("create POSTs the raw payload", () => {
    const payload = { client_id: "c1", contract_type_id: "ct1", activity_id: "a1" };
    service.create(payload).subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/contracts`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual(payload);
    req.flush({ contract: {}, payment: null });
  });

  it("update PATCHes the raw payload", () => {
    service.update("ct1", { discount: 10 }).subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/contracts/ct1`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toEqual({ discount: 10 });
    req.flush({ contract: {} });
  });

  it("renew POSTs to /contracts/:id/renew", () => {
    service.renew("ct1").subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/contracts/ct1/renew`);
    expect(req.request.method).toBe("POST");
    req.flush({ contract: {} });
  });

  it("cancel POSTs to /contracts/:id/cancel", () => {
    service.cancel("ct1").subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/contracts/ct1/cancel`);
    expect(req.request.method).toBe("POST");
    req.flush({ contract: {} });
  });

  it("destroy DELETEs the contract", () => {
    service.destroy("ct1").subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/contracts/ct1`);
    expect(req.request.method).toBe("DELETE");
    req.flush(null);
  });

  it("receipt GETs a blob", () => {
    service.receipt("ct1").subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/contracts/ct1/receipt`);
    expect(req.request.responseType).toBe("blob");
    req.flush(new Blob());
  });

  it("agreement GETs the contract PDF as a blob", () => {
    service.agreement("ct1").subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/contracts/ct1/agreement`);
    expect(req.request.responseType).toBe("blob");
    req.flush(new Blob());
  });

  it("renew sends the formule to move onto, when there is one", () => {
    service.renew("ct1", { contract_type_id: "p2", activity_id: "a1" }).subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/contracts/ct1/renew`);
    expect(req.request.body).toEqual({ contract_type_id: "p2", activity_id: "a1" });
    req.flush({ contract: {} });
  });
});

