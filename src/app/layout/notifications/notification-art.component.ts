import { Component, Input } from "@angular/core";
import { NotificationKind } from "../../core/models/notification.model";

const EMOJI: Record<NotificationKind, string> = {
  contract_expiring: "📋",
  employee_birthday: "🎂",
  system_update: "🚀",
  invoice_issued: "🧾",
  session_cancelled: "🚫",
  waitlist_promoted: "🎟️",
  subscription_expiring: "⏳",
  session_reminder: "⏰",
};

/**
 * The decorative artwork for a notification — an emoji badge plus a small
 * animated SVG scene per kind (confetti, a ticking clock, a calendar).
 * Animation is CSS-only and stops under prefers-reduced-motion.
 */
@Component({
  selector: "app-notification-art",
  standalone: true,
  template: `
    <div class="art" [class.art--mini]="mini" [attr.data-kind]="kind">
      <span class="art-emoji">{{ emoji }}</span>

      @switch (kind) {
        @case ("employee_birthday") {
          <svg class="art-svg" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="14" y="34" width="36" height="20" rx="3" fill="#fde68a" />
            <rect x="14" y="34" width="36" height="7" fill="#fca5a5" />
            <rect x="30" y="18" width="4" height="12" rx="2" fill="#f59e0b" />
            <circle class="flame" cx="32" cy="15" r="4" fill="#fb923c" />
            <g class="confetti">
              <rect x="10" y="8" width="4" height="4" fill="#4a2a8f" />
              <rect x="50" y="12" width="4" height="4" fill="#22c55e" />
              <rect x="26" y="4" width="4" height="4" fill="#8b5cf6" />
              <rect x="44" y="6" width="4" height="4" fill="#f59e0b" />
            </g>
          </svg>
        }
        @case ("invoice_issued") {
          <svg class="art-svg" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M18 10h28v40l-5-4-5 4-5-4-5 4-5-4-3 2z" fill="#dcfce7" />
            <path d="M24 22h16M24 30h16M24 38h10" stroke="#16a34a" stroke-width="2.5" stroke-linecap="round" />
            <circle class="pulse" cx="45" cy="45" r="9" fill="#16a34a" />
            <path d="M41 45l3 3 5-6" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
        }
        @case ("contract_expiring") {
          <svg class="art-svg" viewBox="0 0 64 64" aria-hidden="true">
            <rect x="14" y="12" width="36" height="40" rx="4" fill="#e0e7ff" />
            <rect x="14" y="12" width="36" height="10" rx="4" fill="#a5b4fc" />
            <circle class="pulse" cx="32" cy="36" r="11" fill="#6366f1" opacity="0.9" />
            <path d="M32 30v7l5 3" stroke="#fff" stroke-width="2.5" stroke-linecap="round" />
          </svg>
        }
        @default {
          <svg class="art-svg" viewBox="0 0 64 64" aria-hidden="true">
            <path d="M18 10h20l8 8v36H18z" fill="#dbeafe" />
            <path d="M38 10v8h8z" fill="#93c5fd" />
            <circle class="pulse" cx="44" cy="44" r="10" fill="#ef4444" />
            <path d="M44 39v6M44 48v.5" stroke="#fff" stroke-width="2.5" stroke-linecap="round" />
          </svg>
        }
      }
    </div>
  `,
  styles: [
    `
      .art {
        position: relative;
        width: 92px;
        height: 92px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .art--mini { width: 40px; height: 40px; border-radius: 11px; }
      .art[data-kind="employee_birthday"] { background: linear-gradient(150deg, #fef3c7, #fde68a); }
      .art[data-kind="contract_expiring"] { background: linear-gradient(150deg, #e0e7ff, #c7d2fe); }
      .art[data-kind="invoice_issued"] { background: linear-gradient(150deg, #dcfce7, #bbf7d0); }
      .art[data-kind="session_cancelled"] { background: linear-gradient(150deg, #fee2e2, #fecaca); }
      .art[data-kind="waitlist_promoted"] { background: linear-gradient(150deg, #dcfce7, #bbf7d0); }
      .art[data-kind="subscription_expiring"] { background: linear-gradient(150deg, #e0e7ff, #c7d2fe); }
      .art-svg { width: 76%; height: 76%; }
      .art-emoji {
        position: absolute;
        bottom: 4px;
        right: 5px;
        font-size: 18px;
        line-height: 1;
        filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25));
      }
      .art--mini .art-emoji { font-size: 12px; bottom: 2px; right: 3px; }

      .flame { animation: flicker 0.9s ease-in-out infinite alternate; transform-origin: 32px 15px; }
      .confetti rect { animation: fall 1.8s linear infinite; }
      .confetti rect:nth-child(2) { animation-delay: 0.4s; }
      .confetti rect:nth-child(3) { animation-delay: 0.8s; }
      .confetti rect:nth-child(4) { animation-delay: 1.2s; }
      .pulse { animation: pulse 1.6s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }

      @keyframes flicker { from { transform: scale(0.9) translateY(1px); opacity: 0.85; } to { transform: scale(1.1) translateY(-1px); opacity: 1; } }
      @keyframes fall { 0% { transform: translateY(-6px) rotate(0); opacity: 0; } 15% { opacity: 1; } 100% { transform: translateY(46px) rotate(220deg); opacity: 0; } }
      @keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.95; } 50% { transform: scale(1.12); opacity: 0.7; } }

      @media (prefers-reduced-motion: reduce) {
        .flame, .confetti rect, .pulse { animation: none; }
        .confetti rect { opacity: 1; }
      }
    `,
  ],
})
export class NotificationArtComponent {
  @Input({ required: true }) kind!: NotificationKind;
  @Input() mini = false;

  get emoji(): string {
    return EMOJI[this.kind] ?? "🔔";
  }
}
