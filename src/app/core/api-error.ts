import { HttpErrorResponse } from '@angular/common/http';
import { CommandValidationError } from './command-validation';

export const GATEWAY_KEY_REQUIRED_MESSAGE = 'A valid X-App-Key header is required';

export type ApiErrorKind =
  | 'gateway-key'
  | 'tesla-auth'
  | 'forbidden'
  | 'rate-limited'
  | 'vehicle-unavailable'
  | 'upstream'
  | 'validation'
  | 'network'
  | 'unknown';

export interface ApiError {
  kind: ApiErrorKind;
  status: number;
  message: string;
  /** Seconds until requests may resume; only set for `rate-limited`. */
  retryAfterSeconds?: number;
}

const MAX_MESSAGE_LENGTH = 300;

function truncate(message: string): string {
  return message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Extracts a human-readable message from the backend's `{ error }` or `{ error, teslaStatus, details }` bodies. */
export function extractBackendMessage(body: unknown): { message?: string; detail?: string; teslaStatus?: number } {
  if (typeof body === 'string') {
    try {
      return extractBackendMessage(JSON.parse(body));
    } catch {
      return {};
    }
  }
  const record = asRecord(body);
  if (!record) {
    return {};
  }
  const details = asRecord(record['details']);
  return {
    message: str(record['error']) ?? str(record['message']),
    detail: details ? str(details['error_description']) ?? str(details['error']) ?? str(details['message']) : str(record['details']),
    teslaStatus: typeof record['teslaStatus'] === 'number' ? record['teslaStatus'] : undefined,
  };
}

/** Parses a Retry-After header as delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Math.min(Number(trimmed), 86_400);
  }
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.min(Math.ceil((date - now) / 1000), 86_400));
}

/**
 * The backend's CORS config doesn't expose Retry-After, so cross-origin reads may return null.
 * Fall back to the cooldowns the gateway filter is known to send for each rejection message.
 */
function fallbackRetryAfter(message: string | undefined): number {
  return message === 'Too many authorization requests' ? 60 : 300;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof CommandValidationError) {
    return { kind: 'validation', status: 0, message: error.message };
  }
  if (!(error instanceof HttpErrorResponse)) {
    return { kind: 'unknown', status: 0, message: error instanceof Error ? truncate(error.message) : 'Unexpected error' };
  }
  const { message, detail, teslaStatus } = extractBackendMessage(error.error);
  const status = error.status;
  const text = (fallback: string) => truncate(detail && message === 'Tesla API request failed' ? `${message}: ${detail}` : (message ?? fallback));

  switch (true) {
    case status === 0:
      return {
        kind: 'network',
        status,
        message: 'Network error: the gateway is unreachable, or this origin is blocked by CORS.',
      };
    case status === 401 && message === GATEWAY_KEY_REQUIRED_MESSAGE:
      return { kind: 'gateway-key', status, message: GATEWAY_KEY_REQUIRED_MESSAGE };
    case status === 401:
      return { kind: 'tesla-auth', status, message: text('Tesla authorization expired or was revoked; reconnect') };
    case status === 403:
      return { kind: 'forbidden', status, message: text('Forbidden: origin not allowed or vehicle not linked') };
    case status === 429:
      return {
        kind: 'rate-limited',
        status,
        message: text('Too many requests; try again later'),
        retryAfterSeconds: parseRetryAfter(error.headers?.get('Retry-After') ?? null) ?? fallbackRetryAfter(message),
      };
    case status === 408 || teslaStatus === 408:
      return {
        kind: 'vehicle-unavailable',
        status,
        message: text('Vehicle is unavailable (asleep or offline). Wake it and try again.'),
      };
    case status === 502 || status === 503 || status === 504:
      return { kind: 'upstream', status, message: text('Tesla upstream request could not be completed') };
    case status === 400 || status === 413 || status === 415:
      return { kind: 'validation', status, message: text('Invalid request') };
    default:
      return { kind: 'unknown', status, message: text(`Request failed (HTTP ${status})`) };
  }
}
