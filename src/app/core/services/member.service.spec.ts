import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { API_BASE_URL } from "../models/api-config";
import { MemberProfile } from "../models/member.model";
import { MemberService } from "./member.service";

const ACTIVE_GYM_KEY = "fitora_member_gym";

function profile(gyms: { id: string; name: string }[]): MemberProfile {
  return {
    client: { id: "c1", full_name: "Ahmed", first_name: "Ahmed", last_name: "", email: null, phone: null },
    gyms,
    subscription: null,
    attendance: { rate: null, recent: [] },
  } as MemberProfile;
}

describe("MemberService", () => {
  let service: MemberService;
  let http: HttpTestingController;

  const two = [
    { id: "g1", name: "Power Gym" },
    { id: "g2", name: "Pilates Studio" },
  ];

  function setUp() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), MemberService],
    });
    service = TestBed.inject(MemberService);
    http = TestBed.inject(HttpTestingController);
  }

  beforeEach(() => localStorage.removeItem(ACTIVE_GYM_KEY));
  afterEach(() => {
    http.verify();
    localStorage.removeItem(ACTIVE_GYM_KEY);
  });

  it("asks for no particular gym until one is chosen", () => {
    setUp();
    service.load().subscribe();

    const req = http.expectOne(`${API_BASE_URL}/me/profile`);
    expect(req.request.params.has("company_id")).toBe(false);
    req.flush(profile(two));
  });

  it("shows the first gym when nothing has been chosen", () => {
    setUp();
    service.load().subscribe();
    http.expectOne(`${API_BASE_URL}/me/profile`).flush(profile(two));

    expect(service.companyId()).toBe("g1");
    expect(service.companyName()).toBe("Power Gym");
  });

  it("offers no switcher to someone who belongs to one gym", () => {
    setUp();
    service.load().subscribe();
    http.expectOne(`${API_BASE_URL}/me/profile`).flush(profile([two[0]]));

    expect(service.hasSeveralGyms()).toBe(false);
  });

  it("offers a switcher to someone who belongs to two", () => {
    setUp();
    service.load().subscribe();
    http.expectOne(`${API_BASE_URL}/me/profile`).flush(profile(two));

    expect(service.hasSeveralGyms()).toBe(true);
  });

  it("switches, and asks for the chosen gym next time", () => {
    setUp();
    service.load().subscribe();
    http.expectOne(`${API_BASE_URL}/me/profile`).flush(profile(two));

    service.switchTo("g2");
    service.load().subscribe();

    const req = http.expectOne((r) => r.url === `${API_BASE_URL}/me/profile`);
    expect(req.request.params.get("company_id")).toBe("g2");
    req.flush(profile(two));
    expect(service.companyName()).toBe("Pilates Studio");
  });

  it("remembers the choice across a fresh visit", () => {
    localStorage.setItem(ACTIVE_GYM_KEY, "g2");
    setUp();

    service.load().subscribe();

    const req = http.expectOne((r) => r.url === `${API_BASE_URL}/me/profile`);
    expect(req.request.params.get("company_id")).toBe("g2");
    req.flush(profile(two));
    expect(service.companyId()).toBe("g2");
  });

  it("falls back to the first gym when the remembered one is no longer theirs", () => {
    localStorage.setItem(ACTIVE_GYM_KEY, "gone");
    setUp();

    service.load().subscribe();

    // The stale id 404s, and the service retries without it rather than
    // leaving the person with an app that will not open.
    http.expectOne((r) => r.params.get("company_id") === "gone").flush(null, { status: 404, statusText: "Not Found" });

    const retry = http.expectOne((r) => r.url === `${API_BASE_URL}/me/profile`);
    expect(retry.request.params.has("company_id")).toBe(false);
    retry.flush(profile(two));

    expect(service.companyId()).toBe("g1");
    expect(localStorage.getItem(ACTIVE_GYM_KEY)).toBeNull();
  });

  it("does not swallow a real failure as a stale gym", () => {
    localStorage.setItem(ACTIVE_GYM_KEY, "g2");
    setUp();
    let failed = false;

    service.load().subscribe({ error: () => (failed = true) });
    http.expectOne((r) => r.url === `${API_BASE_URL}/me/profile`).flush(null, { status: 500, statusText: "Server Error" });

    expect(failed).toBe(true);
  });

  it("forgets the gym on sign-out, so the next person does not inherit it", () => {
    setUp();
    service.load().subscribe();
    http.expectOne(`${API_BASE_URL}/me/profile`).flush(profile(two));
    service.switchTo("g2");

    service.clear();

    expect(service.profile()).toBeNull();
    expect(localStorage.getItem(ACTIVE_GYM_KEY)).toBeNull();
  });

  describe("the member's own account", () => {
    it("saves their name and phone, and shows them straight away", () => {
      setUp();
      service.profile.set(profile(two));

      service.updateDetails({ first_name: "Salma", last_name: "B", phone: "+216 20 000 000" }).subscribe();
      const req = http.expectOne(`${API_BASE_URL}/me/profile`);
      expect(req.request.method).toBe("PATCH");
      req.flush({});

      expect(service.profile()?.client.full_name).toBe("Salma B");
      expect(service.profile()?.client.phone).toBe("+216 20 000 000");
    });

    it("deletes the account with the password as confirmation", () => {
      setUp();

      service.deleteAccount("my-password-1").subscribe();
      const req = http.expectOne(`${API_BASE_URL}/me/account`);
      expect(req.request.method).toBe("DELETE");
      expect(req.request.body).toEqual({ password: "my-password-1" });
      req.flush(null);
    });
  });
});
