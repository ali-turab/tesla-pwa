import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { GATEWAY_KEY_REQUIRED_MESSAGE, toApiError } from './api-error';

const http = (status: number, error: unknown, headers?: HttpHeaders) => new HttpErrorResponse({ status, error, headers });

describe('toApiError', () => {
  it('distinguishes a gateway-key 401 from a Tesla token 401', () => {
    expect(toApiError(http(401, { error: GATEWAY_KEY_REQUIRED_MESSAGE })).kind).toBe('gateway-key');
    expect(toApiError(http(401, { error: 'Tesla authorization expired or was revoked; reconnect' })).kind).toBe('tesla-auth');
  });

  it('uses Retry-After when readable, else the gateway default for the message', () => {
    expect(toApiError(http(429, { error: 'x' }, new HttpHeaders({ 'Retry-After': '42' }))).retryAfterSeconds).toBe(42);
    expect(toApiError(http(429, { error: 'Too many requests; try again later' })).retryAfterSeconds).toBe(300);
    expect(toApiError(http(429, { error: 'Too many authorization requests' })).retryAfterSeconds).toBe(60);
  });

  it('treats an upstream Tesla 408 as vehicle-unavailable and surfaces the detail', () => {
    const err = toApiError(
      http(408, { error: 'Tesla API request failed', teslaStatus: 408, details: { error: 'vehicle unavailable: asleep' } }),
    );
    expect(err.kind).toBe('vehicle-unavailable');
    expect(err.message).toContain('vehicle unavailable');
  });
});
