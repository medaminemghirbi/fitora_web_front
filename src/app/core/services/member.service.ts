import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Injectable, computed, inject, signal } from "@angular/core";
import { Observable, catchError, map, tap, throwError } from "rxjs";
import { API_BASE_URL } from "../models/api-config";
import { MemberProfile } from "../models/member.model";

const ACTIVE_GYM_KEY = "fitora_member_gym";

/**
 * The member's own file — who they are, which gym they are looking at, what
 * they train on, and whether they have been turning up.
 *
 * Held in a signal because the shell (the gym's name) and four screens all
 * read it, and it changes only when a booking does.
 *
 * A person is global here, not a row inside one gym: one login, one profile,
 * and a membership at each gym they have joined. Most have exactly one, but
 * "most" is not "all" — this used to read `gyms[0]` and a person who had
 * joined two could never reach the second.
 */
@Injectable({ providedIn: "root" })
export class MemberService {
  private readonly http = inject(HttpClient);

  readonly profile = signal<MemberProfile | null>(null);

  /** Which gym the app is showing, when the person has picked one. */
  private readonly chosenGymId = signal<string | null>(readStoredGym());

  readonly gyms = computed(() => this.profile()?.gyms ?? []);

  /**
   * The gym whose schedule the app is showing: the one they picked, if they
   * still belong to it, else the first. Checking membership matters — a gym
   * can remove someone, and a stale id in browser storage must not strand
   * them on a gym they are no longer part of.
   */
  readonly companyId = computed(() => this.activeGym()?.id ?? null);
  readonly companyName = computed(() => this.activeGym()?.name ?? null);

  /** Whether to offer a switcher at all. One gym needs no choosing. */
  readonly hasSeveralGyms = computed(() => this.gyms().length > 1);

  private readonly activeGym = computed(() => {
    const gyms = this.gyms();
    const chosen = this.chosenGymId();

    return gyms.find((gym) => gym.id === chosen) ?? gyms[0] ?? null;
  });

  load(): Observable<MemberProfile> {
    const chosen = this.chosenGymId();

    return this.fetch(chosen).pipe(
      catchError((err: unknown) => {
        // A gym can remove someone, and the id in browser storage outlives
        // that. The backend 404s a gym they are not a member of; forgetting
        // it and loading their own is better than an app that will not open.
        if (chosen && err instanceof HttpErrorResponse && err.status === 404) {
          this.forget();
          return this.fetch(null);
        }

        return throwError(() => err);
      }),
      tap((profile) => this.profile.set(profile))
    );
  }

  /**
   * Show a different gym. Remembered across visits, because someone who
   * trains at two places usually has one they mostly use.
   */
  switchTo(gymId: string): void {
    this.chosenGymId.set(gymId);

    try {
      localStorage.setItem(ACTIVE_GYM_KEY, gymId);
    } catch {
      // Private browsing, blocked storage: the choice still holds for this
      // session, it just will not be there next time.
    }
  }

  clear(): void {
    this.profile.set(null);
    this.forget();
  }

  /**
   * The person's own name and phone. Once they sign in, their gyms can no
   * longer change these for them — keeping them right is theirs. The email
   * is the login and stays put.
   */
  updateDetails(details: { first_name: string; last_name: string; phone: string }): Observable<void> {
    return this.http.patch<unknown>(`${API_BASE_URL}/me/profile`, { client: details }).pipe(
      tap(() => {
        const profile = this.profile();
        if (profile) {
          this.profile.set({
            ...profile,
            client: { ...profile.client, ...details, full_name: `${details.first_name} ${details.last_name}` },
          });
        }
      }),
      map(() => undefined)
    );
  }

  /**
   * Leaving Fitora. Their gyms keep their books, but nothing on them names
   * this person any more, and every session ends. Confirmed by password.
   */
  deleteAccount(password: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE_URL}/me/account`, { body: { password } });
  }

  private fetch(gymId: string | null): Observable<MemberProfile> {
    // company_id is only sent once a choice exists. The backend picks the
    // person's own gym otherwise, and validates whatever is sent against
    // their memberships either way — this never widens what they can see.
    const params: Record<string, string> = gymId ? { company_id: gymId } : {};

    return this.http.get<MemberProfile>(`${API_BASE_URL}/me/profile`, { params });
  }

  private forget(): void {
    this.chosenGymId.set(null);

    try {
      localStorage.removeItem(ACTIVE_GYM_KEY);
    } catch {
      // Private browsing, blocked storage — nothing to clean up.
    }
  }
}

function readStoredGym(): string | null {
  try {
    return localStorage.getItem(ACTIVE_GYM_KEY);
  } catch {
    return null;
  }
}
