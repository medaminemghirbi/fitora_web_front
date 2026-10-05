import { HttpClient } from "@angular/common/http";
import { Injectable, computed, inject, signal } from "@angular/core";
import { createConsumer, Consumer, Subscription } from "@rails/actioncable";
import { API_BASE_URL, API_ORIGIN } from "../models/api-config";
import { AppNotification, NotificationPage } from "../models/notification.model";
import { AuthService } from "../auth/auth.service";
import { AppVersionService } from "./app-version.service";

interface ChannelEvent {
  type: "created" | "unread_count";
  count?: number;
  // when type === "created", the rest of the payload is an AppNotification
  id?: string;
  kind?: AppNotification["kind"];
  data?: AppNotification["data"];
  url?: string;
  subject?: AppNotification["subject"];
  read?: boolean;
  created_at?: string;
}

/**
 * The signed-in account's notification feed — an admin's, a Fitora superadmin's
 * (system_update), or a member's on their own app. Live pushes come over an
 * ActionCable subscription (NotificationChannel); history + read-state go
 * over REST. Connected/disconnected by ConfigurationService.load /
 * AuthService.logout, and by the member shell for a member.
 *
 * The socket opens with a cable ticket, not the login token: whatever
 * authenticates /cable rides in its URL, where proxy logs keep it, so it is
 * a pass that lasts 30 seconds and opens one connection. A fresh one is
 * fetched before each reconnect.
 */
@Injectable({ providedIn: "root" })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly appVersion = inject(AppVersionService);

  readonly items = signal<AppNotification[]>([]);
  readonly unreadCount = signal(0);
  readonly loading = signal(false);
  private readonly page = signal(1);
  private readonly totalPages = signal(1);
  readonly hasMore = computed(() => this.page() < this.totalPages());

  private consumer: Consumer | null = null;
  private subscription: Subscription | null = null;
  private ticket = "";

  /** A member reads theirs under /me; everyone else at the top level. */
  private get base(): string {
    return this.auth.isClient() ? `${API_BASE_URL}/me/notifications` : `${API_BASE_URL}/notifications`;
  }

  /** Seed the badge from the bootstrap payload before the socket / first fetch. */
  seedUnreadCount(count: number): void {
    this.unreadCount.set(count ?? 0);
  }

  connect(): void {
    const role = this.auth.currentUser()?.role;
    const member = this.auth.isClient();
    if (this.consumer || (!member && role !== "admin" && role !== "superadmin")) return;
    if (!this.auth.getToken()) return;

    const wsBase = API_ORIGIN.replace(/^http/, "ws");
    // A function, so every reconnect reads whichever ticket is current.
    this.consumer = createConsumer(() => `${wsBase}/cable?ticket=${encodeURIComponent(this.ticket)}`);
    this.refreshTicket(() => {
      if (!this.consumer) return;
      this.subscription = this.consumer.subscriptions.create("NotificationChannel", {
        received: (raw: unknown) => this.onEvent(raw as ChannelEvent),
        // The ticket that opened this connection is spent; have the next one
        // ready before ActionCable's monitor tries again — unless this was
        // disconnect() closing it on purpose.
        disconnected: () => {
          if (this.consumer) this.refreshTicket();
        },
      });
    });
  }

  private refreshTicket(then?: () => void): void {
    this.http.post<{ ticket: string }>(`${API_BASE_URL}/cable_ticket`, {}).subscribe({
      next: (res) => {
        this.ticket = res.ticket;
        then?.();
      },
      error: () => {},
    });
  }

  disconnect(): void {
    this.subscription?.unsubscribe();
    this.consumer?.disconnect();
    this.subscription = null;
    this.consumer = null;
    this.ticket = "";
    this.items.set([]);
    this.unreadCount.set(0);
    this.page.set(1);
    this.totalPages.set(1);
  }

  loadFirstPage(): void {
    this.page.set(1);
    this.fetch(1, true);
  }

  loadMore(): void {
    if (this.loading() || !this.hasMore()) return;
    this.fetch(this.page() + 1, false);
  }

  get(id: string) {
    return this.http.get<{ notification: AppNotification }>(`${this.base}/${id}`);
  }

  markRead(id: string): void {
    const target = this.items().find((n) => n.id === id);
    if (target && target.read) return;
    this.http.patch<{ notification: AppNotification }>(`${this.base}/${id}/read`, {}).subscribe({
      next: () => {
        this.items.update((list) => list.map((n) => (n.id === id ? { ...n, read: true } : n)));
        this.unreadCount.update((c) => Math.max(0, c - 1));
      },
      error: () => {},
    });
  }

  markAllRead(): void {
    this.http.post(`${this.base}/read_all`, {}).subscribe({
      next: () => {
        this.items.update((list) => list.map((n) => ({ ...n, read: true })));
        this.unreadCount.set(0);
      },
      error: () => {},
    });
  }

  refresh(): void {
    this.loadFirstPage();
    this.http.get<{ count: number }>(`${this.base}/unread_count`).subscribe({
      next: (r) => this.unreadCount.set(r.count),
      error: () => {},
    });
  }

  private fetch(page: number, replace: boolean): void {
    this.loading.set(true);
    this.http.get<NotificationPage>(this.base, { params: { page: String(page) } }).subscribe({
      next: (res) => {
        this.page.set(res.meta.page);
        this.totalPages.set(res.meta.total_pages);
        this.unreadCount.set(res.unread_count);
        this.items.update((list) => (replace ? res.notifications : [...list, ...res.notifications]));
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private onEvent(event: ChannelEvent): void {
    if (event.type === "unread_count") {
      this.unreadCount.set(event.count ?? 0);
      return;
    }
    if (event.type === "created" && event.id) {
      const incoming = event as unknown as AppNotification;
      this.items.update((list) => (list.some((n) => n.id === incoming.id) ? list : [incoming, ...list]));
      // The version badge has no push of its own — piggyback on this one so
      // it updates live instead of waiting for a reload.
      if (incoming.kind === "system_update") this.appVersion.refresh();
    }
  }
}
