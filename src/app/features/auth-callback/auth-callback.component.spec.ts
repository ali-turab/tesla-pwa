import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { backendAuthInterceptor } from '../../core/backend-auth.interceptor';
import { GatewayKeyService } from '../../core/gateway-key.service';
import { AuthCallbackComponent } from './auth-callback.component';

const STATE = 'a'.repeat(43);

describe('AuthCallbackComponent', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState({}, '', `/auth/callback?code=the-code&state=${STATE}`);
    TestBed.configureTestingModule({
      imports: [AuthCallbackComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([backendAuthInterceptor])),
        provideHttpClientTesting(),
      ],
    });
  });

  it('scrubs code/state from the URL and waits for the gateway key before exchanging', async () => {
    const fixture = TestBed.createComponent(AuthCallbackComponent);
    expect(window.location.search).toBe('');
    expect(window.location.pathname).toBe('/auth/callback');

    await fixture.whenStable();
    const ctrl = TestBed.inject(HttpTestingController);
    ctrl.expectNone(`${environment.apiBaseUrl}/api/auth/callback`);

    TestBed.inject(GatewayKeyService).unlock('k', true);
    await fixture.whenStable();
    const req = ctrl.expectOne(`${environment.apiBaseUrl}/api/auth/callback`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ code: 'the-code', state: STATE });
    expect(req.request.withCredentials).toBe(true);
  });
});
