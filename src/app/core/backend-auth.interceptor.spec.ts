import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { GATEWAY_KEY_REQUIRED_MESSAGE } from './api-error';
import { backendAuthInterceptor, isGatewayUrl } from './backend-auth.interceptor';
import { GatewayKeyService } from './gateway-key.service';
import { RateLimitService } from './rate-limit.service';

const api = environment.apiBaseUrl;

describe('backendAuthInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let keys: GatewayKeyService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([backendAuthInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    keys = TestBed.inject(GatewayKeyService);
  });

  afterEach(() => ctrl.verify());

  it('attaches X-App-Key and withCredentials only to gateway requests', () => {
    keys.unlock('secret-key', false);
    http.get(`${api}/api/auth/status`).subscribe();
    http.get('https://example.com/other').subscribe();

    const gateway = ctrl.expectOne(`${api}/api/auth/status`);
    expect(gateway.request.headers.get('X-App-Key')).toBe('secret-key');
    expect(gateway.request.withCredentials).toBe(true);
    const other = ctrl.expectOne('https://example.com/other');
    expect(other.request.headers.has('X-App-Key')).toBe(false);
    gateway.flush({});
    other.flush({});
  });

  it('does not treat look-alike hosts as the gateway', () => {
    expect(isGatewayUrl(`${api}.evil.example/api/vehicles`)).toBe(false);
    expect(isGatewayUrl(`${api}/api/vehicles`)).toBe(true);
  });

  it('never sends keyless requests', async () => {
    await expect(firstValueFrom(http.get(`${api}/api/vehicles`))).rejects.toMatchObject({ status: 401 });
    ctrl.expectNone(`${api}/api/vehicles`);
  });

  it('locks the gateway when the stored key is rejected', async () => {
    keys.unlock('stale', true);
    const pending = firstValueFrom(http.get(`${api}/api/vehicles`));
    ctrl.expectOne(`${api}/api/vehicles`).flush({ error: GATEWAY_KEY_REQUIRED_MESSAGE }, { status: 401, statusText: 'Unauthorized' });
    await expect(pending).rejects.toBeTruthy();
    expect(keys.hasKey()).toBe(false);
    expect(sessionStorage.length).toBe(0);
  });

  it('starts a cooldown on 429 and blocks further requests locally', async () => {
    keys.unlock('k', false);
    const first = firstValueFrom(http.get(`${api}/api/vehicles`));
    ctrl.expectOne(`${api}/api/vehicles`).flush(
      { error: 'Too many requests; try again later' },
      { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '300' } },
    );
    await expect(first).rejects.toBeTruthy();
    expect(TestBed.inject(RateLimitService).remainingSeconds()).toBe(300);

    await expect(firstValueFrom(http.get(`${api}/api/vehicles`))).rejects.toMatchObject({ status: 429 });
    ctrl.expectNone(`${api}/api/vehicles`);
  });
});
