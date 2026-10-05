import { Component, computed, inject } from "@angular/core";
import { TranslateModule } from "@ngx-translate/core";
import { RouterLink } from "@angular/router";
import { AuthService } from "../../core/auth/auth.service";
import { ConfigurationService } from "../../core/configuration/configuration.service";

/**
 * The only page a locked gym sees. No shell, no navigation, no way back
 * into the app — the point is that the door is shut.
 *
 * There is nothing to ask for: a gym settles with Fitora directly. What it
 * can still do is read what it owes and download the invoices it has, which
 * is why those two are the only links here.
 */
@Component({
  selector: "app-account-locked",
  standalone: true,
  imports: [TranslateModule, RouterLink],
  templateUrl: "./account-locked.component.html",
  styleUrl: "./account-locked.component.scss",
})
export class AccountLockedComponent {
  readonly auth = inject(AuthService);
  private readonly config = inject(ConfigurationService);

  readonly isAdmin = computed(() => this.auth.currentUser()?.role === "admin");

  /** Why the door is shut. Two reasons, never four. */
  readonly reason = computed(() => this.config.subscription()?.lock_reason ?? "suspended");

  /**
   * An unpaid door after the free days is the trial ending, not a missed
   * payment — worded as such, and pointed at the formulas rather than at
   * invoices there are none of.
   */
  readonly trialOver = computed(() => this.reason() === "unpaid" && (this.config.subscription()?.trial ?? false));
  readonly copyKey = computed(() => (this.trialOver() ? "trial_over" : this.reason()));

  logout(): void {
    this.auth.logout();
  }
}
