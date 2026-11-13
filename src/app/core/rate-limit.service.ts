import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

/** Tracks a 429 cooldown and exposes a live countdown; all gateway requests are blocked while active. */
@Injectable({ providedIn: 'root' })
export class RateLimitService {
  private readonly until = signal(0);
  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly remainingSeconds = computed(() => Math.max(0, Math.ceil((this.until() - this.now()) / 1000)));
  readonly active = computed(() => this.remainingSeconds() > 0);
  readonly message = signal<string | null>(null);

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopTimer());
  }

  start(seconds: number, message: string | null = null): void {
    const until = Date.now() + Math.max(1, seconds) * 1000;
    if (until > this.until()) {
      this.until.set(until);
    }
    this.message.set(message);
    this.now.set(Date.now());
    if (!this.timer) {
      this.timer = setInterval(() => {
        this.now.set(Date.now());
        if (!this.active()) {
          this.message.set(null);
          this.stopTimer();
        }
      }, 1000);
    }
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
