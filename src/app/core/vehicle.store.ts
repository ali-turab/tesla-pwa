import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { ActivityLogService } from './activity-log.service';
import { ApiError, toApiError } from './api-error';
import { buildCommandPayload, isValidVin } from './command-validation';
import { GatewayKeyService } from './gateway-key.service';
import { CommandPayloads, TeslaEnvelope, Vehicle, VehicleCommand, VehicleData } from './models';
import { RateLimitService } from './rate-limit.service';
import { TeslaApiService } from './tesla-api.service';

type DataSource = 'cached' | 'live';

/** Local state patches applied after a successful command so the UI doesn't look stale until the next refresh. */
const OPTIMISTIC: Partial<Record<VehicleCommand, (d: VehicleData, p: Record<string, unknown>) => VehicleData>> = {
  door_lock: (d) => ({ ...d, vehicle_state: { ...d.vehicle_state, locked: true } }),
  door_unlock: (d) => ({ ...d, vehicle_state: { ...d.vehicle_state, locked: false } }),
  auto_conditioning_start: (d) => ({ ...d, climate_state: { ...d.climate_state, is_climate_on: true } }),
  auto_conditioning_stop: (d) => ({ ...d, climate_state: { ...d.climate_state, is_climate_on: false } }),
  charge_port_door_open: (d) => ({ ...d, charge_state: { ...d.charge_state, charge_port_door_open: true } }),
  charge_port_door_close: (d) => ({ ...d, charge_state: { ...d.charge_state, charge_port_door_open: false } }),
  charge_start: (d) => ({ ...d, charge_state: { ...d.charge_state, charging_state: 'Charging' } }),
  charge_stop: (d) => ({ ...d, charge_state: { ...d.charge_state, charging_state: 'Stopped' } }),
  set_charge_limit: (d, p) => ({ ...d, charge_state: { ...d.charge_state, charge_limit_soc: p['percent'] as number } }),
  set_temps: (d, p) => ({
    ...d,
    climate_state: {
      ...d.climate_state,
      driver_temp_setting: p['driver_temp'] as number,
      passenger_temp_setting: p['passenger_temp'] as number,
    },
  }),
};

@Injectable({ providedIn: 'root' })
export class VehicleStore {
  private readonly api = inject(TeslaApiService);
  private readonly log = inject(ActivityLogService);
  private readonly rateLimit = inject(RateLimitService);
  private readonly gatewayKey = inject(GatewayKeyService);

  readonly vehicles = signal<Vehicle[] | null>(null);
  readonly selectedVin = signal<string | null>(null);
  readonly data = signal<VehicleData | null>(null);
  readonly dataSource = signal<DataSource | null>(null);
  readonly updatedAt = signal<Date | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly notice = signal<string | null>(null);
  readonly needsWake = signal(false);
  private readonly busyKeys = signal<ReadonlySet<string>>(new Set());

  readonly canRequest = computed(() => this.gatewayKey.hasKey() && !this.rateLimit.active());
  readonly selectedVehicle = computed(() => this.vehicles()?.find((v) => v.vin === this.selectedVin()) ?? null);
  readonly vehicleState = computed(() => this.selectedVehicle()?.state ?? this.data()?.state ?? 'unknown');
  readonly anyCommandBusy = computed(() => [...this.busyKeys()].some((k) => k.startsWith('cmd:')));

  isBusy(key: string): boolean {
    return this.busyKeys().has(key);
  }

  reset(): void {
    this.vehicles.set(null);
    this.selectedVin.set(null);
    this.clearVehicleData();
    this.busyKeys.set(new Set());
  }

  async loadVehicles(): Promise<void> {
    const res = await this.run('vehicles', this.api.vehicles());
    if (!res) {
      return;
    }
    const list = Array.isArray(res.response) ? res.response.filter((v) => isValidVin(v?.vin)) : [];
    this.vehicles.set(list);
    const current = this.selectedVin();
    if (!current || !list.some((v) => v.vin === current)) {
      this.select(list[0]?.vin ?? null);
    }
  }

  select(vin: string | null): void {
    if (vin !== null && !isValidVin(vin)) {
      return;
    }
    if (vin !== this.selectedVin()) {
      this.selectedVin.set(vin);
      this.clearVehicleData();
    }
    if (vin) {
      void this.refreshCached();
    }
  }

  /** Passive refresh: never wakes the car. */
  async refreshCached(): Promise<void> {
    await this.loadData('cached');
  }

  /** Live refresh: explicit user action only; may fail with 408 if the car is asleep. */
  async refreshLive(): Promise<void> {
    await this.loadData('live');
  }

  async wake(): Promise<void> {
    const vin = this.selectedVin();
    if (!vin) {
      return;
    }
    const res = await this.run('wake', this.api.wake(vin));
    if (res) {
      const state = res.response?.state;
      this.patchVehicleState(vin, state);
      this.needsWake.set(state !== 'online');
      this.notice.set(
        state === 'online'
          ? 'Vehicle is online.'
          : 'Wake requested. The vehicle can take 10–30 s to come online; use Live Refresh once it is awake.',
      );
    }
  }

  /** Sends one command exactly once. Returns true when Tesla reports success. */
  async sendCommand<C extends VehicleCommand>(command: C, payload: CommandPayloads[C], label: string): Promise<boolean> {
    const vin = this.selectedVin();
    const key = `cmd:${command}`;
    if (!vin || this.isBusy(key)) {
      return false;
    }
    let body: CommandPayloads[C];
    try {
      body = buildCommandPayload(command, payload);
    } catch (err) {
      this.error.set(toApiError(err));
      return false;
    }
    const res = await this.run(key, this.api.command(vin, command, body));
    if (!res) {
      this.log.add({ kind: 'command', label: command, ok: false, detail: this.error()?.message });
      return false;
    }
    const result = res.response;
    if (result && result.result === false) {
      const reason = result.reason ? `: ${result.reason}` : '';
      this.error.set({ kind: 'upstream', status: 200, message: `${label} was rejected by the vehicle${reason}` });
      this.log.add({ kind: 'command', label: command, ok: false, detail: result.reason });
      return false;
    }
    const patch = OPTIMISTIC[command];
    const data = this.data();
    if (patch && data) {
      this.data.set(patch(data, body as Record<string, unknown>));
    }
    this.notice.set(`${label}: sent successfully.`);
    this.log.add({ kind: 'command', label: command, ok: true });
    return true;
  }

  dismissMessages(): void {
    this.error.set(null);
    this.notice.set(null);
  }

  private async loadData(source: DataSource): Promise<void> {
    const vin = this.selectedVin();
    if (!vin) {
      return;
    }
    const request = source === 'live' ? this.api.liveData(vin) : this.api.cachedData(vin);
    const res = await this.run(source, request);
    if (res?.response && this.selectedVin() === vin) {
      this.data.set(res.response);
      this.dataSource.set(source);
      this.updatedAt.set(new Date());
      if (source === 'live') {
        this.patchVehicleState(vin, res.response.state ?? 'online');
        this.needsWake.set(false);
      }
    }
  }

  private async run<T>(key: string, request: Observable<TeslaEnvelope<T>>): Promise<TeslaEnvelope<T> | null> {
    if (this.isBusy(key)) {
      return null;
    }
    this.setBusy(key, true);
    this.dismissMessages();
    try {
      return await firstValueFrom(request);
    } catch (err) {
      this.handleError(err);
      return null;
    } finally {
      this.setBusy(key, false);
    }
  }

  private handleError(err: unknown): void {
    const apiError = toApiError(err);
    if (apiError.kind === 'vehicle-unavailable') {
      this.needsWake.set(true);
      const vin = this.selectedVin();
      if (vin) {
        this.patchVehicleState(vin, 'asleep');
      }
    }
    // Gateway-key and Tesla-auth failures are surfaced globally (unlock screen / connect banner).
    if (apiError.kind !== 'gateway-key' && apiError.kind !== 'tesla-auth') {
      this.error.set(apiError);
    }
  }

  private setBusy(key: string, busy: boolean): void {
    this.busyKeys.update((keys) => {
      const next = new Set(keys);
      if (busy) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  private patchVehicleState(vin: string, state: string | undefined): void {
    if (!state) {
      return;
    }
    this.vehicles.update((list) => list?.map((v) => (v.vin === vin ? { ...v, state } : v)) ?? list);
  }

  private clearVehicleData(): void {
    this.data.set(null);
    this.dataSource.set(null);
    this.updatedAt.set(null);
    this.error.set(null);
    this.notice.set(null);
    this.needsWake.set(false);
  }
}
