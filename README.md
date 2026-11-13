# Tesla Owner Dashboard (Angular PWA)

Mobile-first, dark-mode owner dashboard for the Tesla Fleet Spring Boot gateway (`../../backend/tesla-backend`).
Angular 21 standalone components, Signals, functional `HttpInterceptorFn`, zoneless change detection.

## Configuration

| File | Purpose |
| --- | --- |
| `application.properties` | API URL source of truth (`api.base-url`); used to generate the Angular environment value and Cloudflare CSP origin |
| `src/environments/environment.ts` / `environment.prod.ts` | Production mode and allowed Tesla OAuth hosts |
| `ngsw-config.json` | Service worker. `/api/**` (same-origin and on `apiBaseUrl`) is network-only (`freshness`, `maxSize: 0`) |
| `public/_headers` | Cloudflare response headers (CSP, `Referrer-Policy: no-referrer`, …). The build fills `connect-src` from `application.properties` |
| `public/manifest.webmanifest` | PWA install metadata |

**Never put `TESLA_APP_KEY` in source or environment files.** The key is typed into the
Unlock Gateway screen at runtime. It's held in memory and, optionally, in `sessionStorage`
(tab-scoped) so it survives the Tesla OAuth redirect. **Lock App** clears it.

Backend settings that must match this frontend:

- `FRONTEND_ORIGINS` must include the dashboard's origin (otherwise you get `403 Origin is not allowed`).
- `TESLA_REDIRECT_URI` must be `https://<dashboard-origin>/auth/callback`.
- Cross-site deployments need secure cookies enabled (`__Host-tesla-oauth`, `SameSite=None; Secure`).
- Optional: expose `Retry-After` via CORS (`cors.setExposedHeaders(List.of("Retry-After"))`).
  Without it, the browser can't read the header cross-origin, so the app falls back to the
  gateway's known cooldowns (300 s general, 60 s for auth endpoints).

## Structure

```
src/app/core/        API client, interceptor, gateway key, auth state, vehicle store, rate limit, validation
src/app/features/    unlock modal, /auth/callback, dashboard cards + debug drawer
src/app/shared/      confirm dialog, formatting helpers
```

## Behaviour notes

- Dashboard loads **cached** telemetry (`/data/cached`) by default, which never wakes the car. **Live Refresh** and **Wake Vehicle** run only when you press them.
- Commands are validated client-side against the backend allowlist, send only allowlisted fields, disable their button while in flight, and are **never retried automatically**.
- `/auth/callback` reads `code`/`state`, scrubs them from the URL with `history.replaceState` before doing anything else, and posts them in the JSON body.
- If the gateway key is missing, the interceptor blocks the request locally. Keyless requests would otherwise count toward the gateway's 5-failure lockout.

## Commands

```bash
yarn start        # dev server (http://localhost:4200)
yarn build        # production build -> dist/tesla-pwa/browser (service worker enabled; CSP is configured from application.properties)
yarn test         # unit tests (Vitest)
npx wrangler deploy   # Cloudflare static assets (see wrangler.jsonc)
```
