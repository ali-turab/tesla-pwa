import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { toApiError } from '../../core/api-error';
import { AuthStateService } from '../../core/auth-state.service';
import { GatewayKeyService } from '../../core/gateway-key.service';
import { RateLimitService } from '../../core/rate-limit.service';
import { TeslaApiService } from '../../core/tesla-api.service';

@Component({
  selector: 'app-unlock-gateway',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
      <form class="modal" (submit)="submit($event)" autocomplete="on">
        <div class="stack">
          <h1 id="unlock-title">🔒 Unlock Gateway</h1>
          <p class="muted">
            Enter your gateway <code>X-App-Key</code>. It's kept in memory only
            @if (remember()) { (and this tab's session storage) }
            and is never written to the URL or source.
          </p>
        </div>

        @if (gatewayKey.promptReason(); as reason) {
          <div class="alert alert-warn" role="status">{{ reason }}</div>
        }

        <!-- Lets password managers associate the saved key with a stable account name. -->
        <input class="sr-only" type="text" name="username" autocomplete="username" value="tesla-gateway" readonly tabindex="-1" aria-hidden="true" />

        <label class="field">
          Gateway key
          <input
            #keyInput
            class="input"
            type="password"
            name="password"
            autocomplete="current-password"
            autocapitalize="off"
            spellcheck="false"
            maxlength="1024"
            required
            [attr.aria-invalid]="error() ? 'true' : null"
            [value]="key()"
            (input)="key.set(keyInput.value)"
          />
        </label>

        <label class="check">
          <input type="checkbox" [checked]="remember()" (change)="remember.set($any($event.target).checked)" />
          Keep for this tab session (needed to survive the Tesla sign-in redirect)
        </label>

        @if (error(); as message) {
          <div class="alert alert-danger" role="alert">{{ message }}</div>
        }

        @if (rateLimit.active()) {
          <div class="alert alert-warn" role="status">Rate limited — retry in {{ rateLimit.remainingSeconds() }}s</div>
        }

        <button class="btn btn-primary" type="submit" [disabled]="verifying() || !key().trim() || rateLimit.active()">
          @if (verifying()) { <span class="spinner" aria-hidden="true"></span> Verifying… } @else { Unlock }
        </button>
        <p class="muted">5 failed attempts lock this network address out for 5 minutes.</p>
      </form>
    </div>
  `,
})
export class UnlockGatewayComponent {
  protected readonly gatewayKey = inject(GatewayKeyService);
  protected readonly rateLimit = inject(RateLimitService);
  private readonly api = inject(TeslaApiService);
  private readonly auth = inject(AuthStateService);

  protected readonly key = signal('');
  protected readonly remember = signal(true);
  protected readonly verifying = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly keyInput = viewChild<ElementRef<HTMLInputElement>>('keyInput');

  constructor() {
    afterNextRender(() => this.keyInput()?.nativeElement.focus());
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const candidate = this.key().trim();
    if (!candidate || this.verifying() || this.rateLimit.active()) {
      return;
    }
    this.verifying.set(true);
    this.error.set(null);
    try {
      const status = await firstValueFrom(this.api.authStatus(candidate));
      this.gatewayKey.unlock(candidate, this.remember());
      this.auth.setStatus(status);
      this.key.set('');
    } catch (err) {
      const apiError = toApiError(err);
      this.error.set(
        apiError.kind === 'gateway-key' ? 'That key was rejected by the gateway.' : apiError.message,
      );
    } finally {
      this.verifying.set(false);
    }
  }
}
