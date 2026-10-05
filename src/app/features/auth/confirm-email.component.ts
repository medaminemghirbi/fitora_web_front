import { Component, DestroyRef, OnInit, computed, inject, signal } from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import { Router } from "@angular/router";
import { TranslateModule } from "@ngx-translate/core";
import { AccountRecoveryService } from "../../core/auth/account-recovery.service";
import { AuthService } from "../../core/auth/auth.service";
import { AuthProShellComponent } from "../../shared/ui/auth-pro-shell.component";
import { SpinnerComponent } from "../../shared/components/spinner.component";
import { environment } from "../../../environments/environment";
import { MailStageComponent, MailStageState } from "./mail-stage.component";
import { SetupProgressComponent } from "./setup-progress.component";

/** Mirrors EmailVerifiable::RESEND_COOLDOWN on the backend. */
export const RESEND_COOLDOWN_SECONDS = 60;
/** How often the screen asks whether the link has been clicked. */
export const POLL_MS = 4000;
/**
 * How long "Adresse confirmée — nous préparons votre salle" stays up before
 * moving on by itself: long enough for SetupProgressComponent's three lines
 * to tick over.
 */
export const CONTINUE_DELAY_MS = 3600;
/** Tabs of this app tell each other the link was clicked on this channel. */
export const AUTH_CHANNEL = "fitora-auth";

export interface Mailbox {
  name: string;
  url: string;
}

/**
 * The webmail behind an address, when it is one of the big ones — a button
 * straight to the inbox beats "go and find your mail".
 */
const MAILBOXES: { match: RegExp; name: string; url: string }[] = [
  { match: /^(gmail|googlemail)\.com$/, name: "Gmail", url: "https://mail.google.com/mail/u/0/#search/from%3Afitora.io" },
  { match: /^(outlook|hotmail|live|msn)\.[a-z.]+$/, name: "Outlook", url: "https://outlook.live.com/mail/0/" },
  { match: /^(yahoo|ymail)\.[a-z.]+$/, name: "Yahoo Mail", url: "https://mail.yahoo.com/" },
  { match: /^(icloud|me|mac)\.com$/, name: "iCloud Mail", url: "https://www.icloud.com/mail" },
  { match: /^(proton\.me|protonmail\.com|pm\.me)$/, name: "Proton Mail", url: "https://mail.proton.me/" },
];

export function mailboxFor(email: string): Mailbox | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const found = MAILBOXES.find((m) => m.match.test(domain));
  return found ? { name: found.name, url: found.url } : null;
}

type Phase = "waiting" | "confirmed";

/**
 * Between signing up and clicking the emailed link.
 *
 * Nothing past sign-up opens until the address is confirmed, so this screen
 * does the waiting for the admin: it asks every few seconds (and at once
 * when the tab comes back into focus, or when another tab of the app says
 * the link was clicked) and moves on by itself — the link can be opened on
 * a phone and this screen still notices. Resending is rate-limited to match
 * the backend, and says that only the newest link works.
 */
@Component({
  selector: "app-confirm-email",
  standalone: true,
  imports: [AuthProShellComponent, TranslateModule, SpinnerComponent, MailStageComponent, SetupProgressComponent],
  templateUrl: "./confirm-email.component.html",
  styleUrls: ["./auth.component.scss", "./confirm-email.component.scss"],
})
export class ConfirmEmailComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly recovery = inject(AccountRecoveryService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly email = computed(() => this.auth.currentUser()?.email ?? "");
  readonly mailbox = computed(() => mailboxFor(this.email()));
  /** MailCatcher, in development only — where every mail the backend sends lands. */
  readonly devInbox = environment.production ? null : "http://localhost:1080";

  readonly continueDelay = CONTINUE_DELAY_MS;
  readonly phase = signal<Phase>("waiting");
  /** The envelope is flying off with a fresh link. */
  readonly sending = signal(false);
  readonly resending = signal(false);
  readonly resendIn = signal(0);
  readonly notice = signal<"sent" | "error" | null>(null);

  readonly stage = computed<MailStageState>(() => {
    if (this.phase() === "confirmed") return "confirmed";
    return this.sending() ? "sending" : "waiting";
  });

  private checking = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  private channel: BroadcastChannel | null = null;
  private readonly onWake = () => {
    if (document.visibilityState === "visible") this.check();
  };

  ngOnInit(): void {
    this.startCountdown(this.auth.currentUser()?.email_verification_resend_in ?? 0);

    this.pollTimer = setInterval(() => {
      if (document.visibilityState === "visible") this.check();
    }, POLL_MS);
    window.addEventListener("focus", this.onWake);
    document.addEventListener("visibilitychange", this.onWake);
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(AUTH_CHANNEL);
      this.channel.onmessage = (event) => {
        if (event.data?.type === "email-verified") this.check();
      };
    }

    this.destroyRef.onDestroy(() => this.stop());
  }

  /** Has the link been clicked yet? Quiet on failure: the next tick asks again. */
  check(): void {
    if (this.checking || this.phase() === "confirmed") return;
    this.checking = true;

    this.auth.fetchCurrentUser().subscribe({
      next: (user) => {
        this.checking = false;
        if (user.email_verified) this.confirmed();
      },
      error: () => {
        this.checking = false;
      },
    });
  }

  resend(): void {
    if (this.resendIn() > 0 || this.resending()) return;
    this.resending.set(true);
    this.notice.set(null);

    this.recovery.resendVerification().subscribe({
      next: () => {
        this.resending.set(false);
        this.notice.set("sent");
        this.startCountdown(RESEND_COOLDOWN_SECONDS);
        this.fly();
      },
      error: (err: HttpErrorResponse) => {
        this.resending.set(false);
        if (err.status === 429) {
          this.startCountdown(Number(err.error?.retry_in) || RESEND_COOLDOWN_SECONDS);
        } else if (err.error?.error === "already_verified") {
          // Clicked in the meantime — the resend is moot.
          this.check();
        } else {
          this.notice.set("error");
        }
      },
    });
  }

  /** Straight on to naming the gym — or home, for an admin who already has one. */
  continue(): void {
    this.stop();
    const user = this.auth.currentUser();
    this.router.navigateByUrl(user?.company_id == null ? "/admin/setup-company" : this.auth.homeRouteForCurrentUser());
  }

  /** Mistyped address: start over with the right one. */
  restart(): void {
    this.stop();
    this.auth.logout();
    this.router.navigateByUrl("/inscription");
  }

  logout(): void {
    this.stop();
    this.auth.logout();
  }

  private confirmed(): void {
    this.phase.set("confirmed");
    this.stopListening();
    // The shell reads the rest (permissions, onboarding) from /bootstrap.
    this.auth.loadConfiguration();
    this.later(() => this.continue(), CONTINUE_DELAY_MS);
  }

  private fly(): void {
    this.sending.set(true);
    this.later(() => this.sending.set(false), 1100);
  }

  private startCountdown(seconds: number): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.resendIn.set(Math.max(0, Math.ceil(seconds)));
    if (this.resendIn() === 0) return;

    this.tickTimer = setInterval(() => {
      this.resendIn.update((s) => Math.max(0, s - 1));
      if (this.resendIn() === 0 && this.tickTimer) {
        clearInterval(this.tickTimer);
        this.tickTimer = null;
      }
    }, 1000);
  }

  private later(fn: () => void, ms: number): void {
    this.timeouts.push(setTimeout(fn, ms));
  }

  private stopListening(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    window.removeEventListener("focus", this.onWake);
    document.removeEventListener("visibilitychange", this.onWake);
    this.channel?.close();
    this.channel = null;
  }

  private stop(): void {
    this.stopListening();
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = null;
    this.timeouts.forEach(clearTimeout);
    this.timeouts = [];
  }
}
