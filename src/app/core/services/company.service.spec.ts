import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { API_BASE_URL } from "../models/api-config";
import { CompanyService } from "./company.service";

describe("CompanyService", () => {
  let service: CompanyService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(CompanyService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it("get GETs /company", () => {
    service.get().subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/company`);
    expect(req.request.method).toBe("GET");
    req.flush({ company: {} });
  });

  it("create POSTs a wrapped payload to the plural collection", () => {
    service.create({ name: "Acme" }).subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/companies`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ company: { name: "Acme" } });
    req.flush({ company: {} });
  });

  it("list GETs every company this admin runs", () => {
    service.list().subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/companies`);
    expect(req.request.method).toBe("GET");
    req.flush({ companies: [] });
  });

  it("switchTo POSTs to the company's switch action", () => {
    service.switchTo("co-1").subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/companies/co-1/switch`);
    expect(req.request.method).toBe("POST");
    req.flush({ company: {} });
  });

  it("update PATCHes a wrapped payload", () => {
    service.update({ name: "Acme 2" }).subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/company`);
    expect(req.request.method).toBe("PATCH");
    expect(req.request.body).toEqual({ company: { name: "Acme 2" } });
    req.flush({ company: {} });
  });

  it("updateBranding PATCHes multipart form data, skipping nullish fields", () => {
    service.updateBranding({ slug: "acme", primary_color: null }).subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/company`);
    expect(req.request.method).toBe("PATCH");
    const body = req.request.body as FormData;
    expect(body instanceof FormData).toBe(true);
    expect(body.get("company[slug]")).toBe("acme");
    expect(body.has("company[primary_color]")).toBe(false);
    req.flush({ company: {} });
  });


  it("updateBranding sends a signature file, clears text with an empty string, and flags a removal", () => {
    const signature = new File(["x"], "sig.png", { type: "image/png" });
    service.updateBranding({ signature, signatory_name: "", remove_signature: true }).subscribe();
    const body = httpMock.expectOne(`${API_BASE_URL}/company`).request.body as FormData;
    expect(body.get("company[signature]")).toEqual(jasmine.any(File));
    expect(body.get("company[signatory_name]")).toBe("");
    expect(body.get("company[remove_signature]")).toBe("true");
  });

  it("publish POSTs whether the gym is listed", () => {
    service.publish(true).subscribe();
    const req = httpMock.expectOne(`${API_BASE_URL}/company/publish`);
    expect(req.request.method).toBe("POST");
    expect(req.request.body).toEqual({ listed: true });
    req.flush({ company: {} });
  });
});
