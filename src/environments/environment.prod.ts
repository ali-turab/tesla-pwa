import { apiBaseUrl } from './api-config.generated';

// Never put the gateway X-App-Key (TESLA_APP_KEY) or any other secret in this file: it ships to the browser.
export const environment = {
  production: true,
  apiBaseUrl,
  /** Hosts the backend's /api/auth/login-url response is allowed to redirect to. */
  teslaAuthHosts: ['auth.tesla.com'],
};
