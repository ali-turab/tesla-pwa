import { HttpClient, HttpContext } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { GATEWAY_KEY_OVERRIDE } from './http-context';
import { assertValidVin, buildCommandPayload } from './command-validation';
import {
  AuthStatus,
  CommandPayloads,
  CommandResult,
  LIVE_DATA_ENDPOINTS,
  LoginUrlResponse,
  TeslaEnvelope,
  Vehicle,
  VehicleCommand,
  VehicleData,
} from './models';

/** Strongly typed client for the Tesla Fleet gateway. Commands are never retried automatically. */
@Injectable({ providedIn: 'root' })
export class TeslaApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl.replace(/\/+$/, '');

  authStatus(candidateKey?: string): Observable<AuthStatus> {
    const context = candidateKey ? new HttpContext().set(GATEWAY_KEY_OVERRIDE, candidateKey) : undefined;
    return this.http.get<AuthStatus>(`${this.base}/api/auth/status`, { context });
  }

  loginUrl(): Observable<LoginUrlResponse> {
    return this.http.get<LoginUrlResponse>(`${this.base}/api/auth/login-url`);
  }

  exchangeCode(code: string, state: string): Observable<AuthStatus> {
    return this.http.post<AuthStatus>(`${this.base}/api/auth/callback`, { code, state });
  }

  vehicles(): Observable<TeslaEnvelope<Vehicle[]>> {
    return this.http.get<TeslaEnvelope<Vehicle[]>>(`${this.base}/api/vehicles`);
  }

  /** Passive cached telemetry; never wakes the vehicle. */
  cachedData(vin: string): Observable<TeslaEnvelope<VehicleData>> {
    return this.http.get<TeslaEnvelope<VehicleData>>(`${this.vehicleUrl(vin)}/data/cached`);
  }

  /** Live telemetry; only call from an explicit user action. */
  liveData(vin: string): Observable<TeslaEnvelope<VehicleData>> {
    return this.http.get<TeslaEnvelope<VehicleData>>(`${this.vehicleUrl(vin)}/data`, {
      params: { endpoints: LIVE_DATA_ENDPOINTS },
    });
  }

  wake(vin: string): Observable<TeslaEnvelope<Vehicle>> {
    return this.http.post<TeslaEnvelope<Vehicle>>(`${this.vehicleUrl(vin)}/wake`, {});
  }

  command<C extends VehicleCommand>(
    vin: string,
    command: C,
    payload: CommandPayloads[C],
  ): Observable<TeslaEnvelope<CommandResult>> {
    const body = buildCommandPayload(command, payload);
    return this.http.post<TeslaEnvelope<CommandResult>>(
      `${this.vehicleUrl(vin)}/command/${encodeURIComponent(command)}`,
      body,
    );
  }

  private vehicleUrl(vin: string): string {
    return `${this.base}/api/vehicles/${encodeURIComponent(assertValidVin(vin))}`;
  }
}
