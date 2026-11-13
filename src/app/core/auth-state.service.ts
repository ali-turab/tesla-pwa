import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiError, toApiError } from './api-error';
import { GatewayKeyService } from './gateway-key.service';
import { AuthStatus } from './models';
import { TeslaApiService } from './tesla-api.service';

/** Validates the Tesla authorize URL returned by the backend before navigating to it. */
export function isTrustedAuthorizeUrl(url: unknown, allowedHosts: readonly string[] = environment.teslaAuthHosts): url is string {
  if (typeof url !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && allowedHosts.includes(parsed.hostname);
  } catch {
    return false;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthStateService {
  private readonly api = inject(TeslaApiService);
  private readonly gatewayKey = inject(GatewayKeyService);

  readonly status = signal<AuthStatus | null>(null);
  readonly checking = signal(false);
  readonly redirecting = signal(false);
  readonly lastError = signal<ApiError | null>(null);
  readonly disconnectedReason = signal<string | null>(null);

  /** `null` while unknown (locked gateway or not yet checked). */
  readonly authenticated = computed(() => this.status()?.authenticated ?? null);

  setStatus(status: AuthStatus): void {
    this.status.set({ authenticated: status.authenticated === true, expiresAt: status.expiresAt ?? null });
    if (status.authenticated) {
      this.disconnectedReason.set(null);
    }
  }

  markDisconnected(reason: string): void {
    this.status.set({ authenticated: false, expiresAt: null });
    this.disconnectedReason.set(reason);
  }

  reset(): void {
    this.status.set(null);
    this.lastError.set(null);
    this.disconnectedReason.set(null);
  }

  async refresh(): Promise<AuthStatus | null> {
    if (!this.gatewayKey.hasKey() || this.checking()) {
      return this.status();
    }
    this.checking.set(true);
    try {
      const status = await firstValueFrom(this.api.authStatus());
      this.setStatus(status);
      this.lastError.set(null);
      return status;
    } catch (err) {
      this.lastError.set(toApiError(err));
      return null;
    } finally {
      this.checking.set(false);
    }
  }

  /** Starts the Tesla OAuth flow. Resolves with an error if the redirect could not be started. */
  async startLogin(): Promise<ApiError | null> {
    if (!this.gatewayKey.hasKey()) {
      return { kind: 'gateway-key', status: 401, message: 'Unlock the gateway before connecting your Tesla account.' };
    }
    if (!this.gatewayKey.persistForRedirect()) {
      return {
        kind: 'unknown',
        status: 0,
        message: 'Session storage is unavailable, so the gateway key cannot survive the Tesla redirect.',
      };
    }
    this.redirecting.set(true);
    try {
      const res = await firstValueFrom(this.api.loginUrl());
      if (!isTrustedAuthorizeUrl(res?.url)) {
        this.redirecting.set(false);
        return { kind: 'upstream', status: 0, message: 'The gateway returned an unexpected authorization URL.' };
      }
      window.location.assign(res.url);
      return null;
    } catch (err) {
      this.redirecting.set(false);
      return toApiError(err);
    }
  }
}
