import {
  HttpErrorResponse,
  HttpEventType,
  HttpHeaders,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { ActivityLogService } from './activity-log.service';
import { GATEWAY_KEY_REQUIRED_MESSAGE, toApiError } from './api-error';
import { AuthStateService } from './auth-state.service';
import { GatewayKeyService } from './gateway-key.service';
import { GATEWAY_KEY_OVERRIDE } from './http-context';
import { RateLimitService } from './rate-limit.service';

/** True only for URLs on the configured gateway origin and base path (prevents key leakage to other hosts). */
export function isGatewayUrl(url: string, baseUrl: string = environment.apiBaseUrl): boolean {
  try {
    const base = new URL(baseUrl);
    const target = new URL(url);
    const basePath = base.pathname.replace(/\/+$/, '');
    return (
      target.origin === base.origin &&
      (basePath === '' || target.pathname === basePath || target.pathname.startsWith(`${basePath}/`))
    );
  } catch {
    return false;
  }
}

function localError(req: HttpRequest<unknown>, status: number, error: string, headers?: HttpHeaders) {
  return new HttpErrorResponse({ status, error: { error }, headers, url: req.urlWithParams });
}

function describe(req: HttpRequest<unknown>): string {
  try {
    return `${req.method} ${new URL(req.url).pathname}`;
  } catch {
    return req.method;
  }
}

export const backendAuthInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isGatewayUrl(req.url)) {
    return next(req);
  }
  const gatewayKey = inject(GatewayKeyService);
  const rateLimit = inject(RateLimitService);
  const auth = inject(AuthStateService);
  const log = inject(ActivityLogService);
  const label = describe(req);

  if (rateLimit.active()) {
    log.add({ kind: 'request', label, status: 429, ok: false, detail: 'Blocked locally during rate-limit cooldown' });
    return throwError(() =>
      localError(
        req,
        429,
        `Rate limited; wait ${rateLimit.remainingSeconds()}s`,
        new HttpHeaders({ 'Retry-After': String(rateLimit.remainingSeconds()) }),
      ),
    );
  }

  const override = req.context.get(GATEWAY_KEY_OVERRIDE);
  const key = override ?? gatewayKey.current();
  if (!key) {
    // Don't send keyless requests: every failed key check counts toward the gateway's lockout.
    log.add({ kind: 'request', label, status: 401, ok: false, detail: 'Blocked locally: gateway is locked' });
    return throwError(() => localError(req, 401, GATEWAY_KEY_REQUIRED_MESSAGE));
  }

  const started = performance.now();
  const authed = req.clone({ setHeaders: { 'X-App-Key': key }, withCredentials: true });

  return next(authed).pipe(
    tap((event) => {
      if (event.type === HttpEventType.Response) {
        log.add({ kind: 'request', label, status: event.status, ok: true, durationMs: Math.round(performance.now() - started) });
      }
    }),
    catchError((err: unknown) => {
      const apiError = toApiError(err);
      log.add({
        kind: 'request',
        label,
        status: apiError.status,
        ok: false,
        durationMs: Math.round(performance.now() - started),
        detail: apiError.message,
      });
      switch (apiError.kind) {
        case 'gateway-key':
          if (override === null) {
            gatewayKey.lock('The gateway rejected the stored key. Enter your X-App-Key again.');
          }
          break;
        case 'tesla-auth':
          auth.markDisconnected(apiError.message);
          break;
        case 'rate-limited':
          rateLimit.start(apiError.retryAfterSeconds ?? 300, apiError.message);
          break;
      }
      return throwError(() => err);
    }),
  );
};
