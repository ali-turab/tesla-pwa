import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiError, toApiError } from '../../core/api-error';
import { AuthStateService } from '../../core/auth-state.service';
import { GatewayKeyService } from '../../core/gateway-key.service';
import { RateLimitService } from '../../core/rate-limit.service';
import { TeslaApiService } from '../../core/tesla-api.service';

const CALLBACK_PATH = '/auth/callback';
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface CallbackParams {
  code: string | null;
  state: string | null;
  oauthError: string | null;
}

/**
 * Reads the OAuth parameters and immediately scrubs them from the address bar/history,
 * before any network call or render, so they can't leak via history, referrers or screenshots.
 */
function consumeCallbackParams(): CallbackParams {
  const params = new URLSearchParams(window.location.search);
  const result: CallbackParams = {
    code: params.get('code'),
    state: params.get('state'),
    oauthError: params.get('error_description') ?? params.get('error'),
  };
  window.history.replaceState({}, document.title, CALLBACK_PATH);
  return result;
}

type Phase = 'waiting-key' | 'exchanging' | 'error';

@Component({
  selector: 'app-auth-callback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="container">
      <div class="card" style="max-width: 520px; margin: 8vh auto 0">
        <h1>Connecting Tesla account</h1>

        @switch (phase()) {
          @case ('waiting-key') {
            <p class="muted">Unlock the gateway with your <code>X-App-Key</code> to finish connecting your Tesla account.</p>
          }
          @case ('exchanging') {
            <p class="row"><span class="spinner" aria-hidden="true"></span> Completing sign-in with Tesla…</p>
          }
          @case ('error') {
            <div class="alert alert-danger" role="alert">{{ error()?.message }}</div>
            @if (canRetryExchange()) {
              <button class="btn btn-primary" type="button" [disabled]="rateLimit.active()" (click)="exchange()">
                @if (rateLimit.active()) { Retry in {{ rateLimit.remainingSeconds() }}s } @else { Try again }
              </button>
            } @else {
              <div class="row">
                <button
                  class="btn btn-primary btn-grow"
                  type="button"
                  [disabled]="auth.redirecting() || rateLimit.active() || !gatewayKey.hasKey()"
                  (click)="retryLogin()"
                >
                  Retry Tesla login
                </button>
                <button class="btn btn-grow" type="button" (click)="goHome()">Back to dashboard</button>
              </div>
            }
          }
        }
      </div>
    </section>
  `,
})
export class AuthCallbackComponent {
  private readonly params = consumeCallbackParams();
  protected readonly gatewayKey = inject(GatewayKeyService);
  protected readonly rateLimit = inject(RateLimitService);
  protected readonly auth = inject(AuthStateService);
  private readonly api = inject(TeslaApiService);
  private readonly router = inject(Router);

  /** Held in memory only for a single exchange attempt; never logged or persisted. */
  private pending: { code: string; state: string } | null = null;
  protected readonly phase = signal<Phase>('waiting-key');
  protected readonly error = signal<ApiError | null>(null);
  /** True only when the gateway rejected the exchange before the single-use state was consumed. */
  protected readonly canRetryExchange = signal(false);

  constructor() {
    const { code, state, oauthError } = this.params;
    if (oauthError) {
      this.fail({ kind: 'tesla-auth', status: 0, message: `Tesla sign-in was not completed: ${oauthError.slice(0, 200)}` });
    } else if (!code || code.length > 4096 || !state || !STATE_PATTERN.test(state)) {
      this.fail({ kind: 'validation', status: 0, message: 'The Tesla callback is missing a valid authorization code or state.' });
    } else {
      this.pending = { code, state };
    }

    effect(() => {
      if (this.phase() === 'waiting-key' && this.gatewayKey.hasKey() && !this.rateLimit.active()) {
        untracked(() => void this.exchange());
      }
    });
  }

  protected async exchange(): Promise<void> {
    const pending = this.pending;
    if (!pending || this.phase() === 'exchanging') {
      return;
    }
    this.phase.set('exchanging');
    this.canRetryExchange.set(false);
    try {
      const status = await firstValueFrom(this.api.exchangeCode(pending.code, pending.state));
      this.pending = null;
      this.auth.setStatus(status);
      await this.auth.refresh();
      await this.router.navigateByUrl('/', { replaceUrl: true });
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.kind === 'gateway-key') {
        // Rejected by the gateway before the code reached Tesla: wait for the key, then exchange.
        this.phase.set('waiting-key');
        return;
      }
      if (apiError.kind === 'rate-limited') {
        // Rejected before the single-use state was consumed; let the user retry after the cooldown.
        this.canRetryExchange.set(true);
      } else {
        this.pending = null;
      }
      this.fail(apiError);
    }
  }

  protected async retryLogin(): Promise<void> {
    const err = await this.auth.startLogin();
    if (err) {
      this.fail(err);
    }
  }

  protected goHome(): void {
    void this.router.navigateByUrl('/', { replaceUrl: true });
  }

  private fail(error: ApiError): void {
    this.error.set(error);
    this.phase.set('error');
  }
}
