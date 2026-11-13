import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { VehicleStore } from '../../core/vehicle.store';
import { formatTemp } from '../../shared/format';

const MIN_TEMP = 15;
const MAX_TEMP = 30;

function validTemp(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_TEMP && value <= MAX_TEMP;
}

@Component({
  selector: 'app-climate-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .zone { display: grid; grid-template-columns: 44px 1fr 44px; gap: 6px; align-items: center; }
    .zone .input { text-align: center; }
  `,
  template: `
    <section class="card" aria-labelledby="climate-title">
      <div class="card-head">
        <h2 id="climate-title">🌡 Climate</h2>
        <span [class]="climateOn() ? 'badge badge-ok' : 'badge'">HVAC {{ climateOn() ? 'on' : 'off' }}</span>
      </div>

      <dl class="kv">
        <dt>Cabin</dt><dd>{{ inside() }}</dd>
        <dt>Outside</dt><dd>{{ outside() }}</dd>
      </dl>

      <button class="btn" type="button" [class.btn-primary]="!climateOn()" [disabled]="hvacBusy()" (click)="toggleHvac()">
        @if (hvacBusy() && store.canRequest()) { <span class="spinner" aria-hidden="true"></span> }
        {{ climateOn() ? 'Turn HVAC off' : 'Turn HVAC on' }}
      </button>

      <div class="row" style="align-items: stretch">
        @for (zone of zones; track zone.key) {
          <label class="field" style="flex: 1 1 140px">
            {{ zone.label }} (°C)
            <span class="zone">
              <button class="btn btn-sm" type="button" [attr.aria-label]="'Decrease ' + zone.label" (click)="nudge(zone.key, -0.5)">−</button>
              <input class="input" type="number" inputmode="decimal" step="0.5" [min]="min" [max]="max"
                     [value]="draft(zone.key)" [attr.aria-invalid]="!valid(zone.key) ? 'true' : null"
                     (input)="setDraft(zone.key, $any($event.target).valueAsNumber)" />
              <button class="btn btn-sm" type="button" [attr.aria-label]="'Increase ' + zone.label" (click)="nudge(zone.key, 0.5)">+</button>
            </span>
          </label>
        }
      </div>
      @if (!valid('driver') || !valid('passenger')) {
        <span class="muted" style="color: var(--danger)">Temperatures must be between {{ min }} and {{ max }} °C.</span>
      }
      <button class="btn" type="button" [disabled]="!canSetTemps()" (click)="setTemps()">
        @if (store.isBusy('cmd:set_temps')) { <span class="spinner" aria-hidden="true"></span> } Apply temperatures
      </button>
    </section>
  `,
})
export class ClimateCardComponent {
  protected readonly store = inject(VehicleStore);
  protected readonly min = MIN_TEMP;
  protected readonly max = MAX_TEMP;
  protected readonly zones = [
    { key: 'driver', label: 'Driver' },
    { key: 'passenger', label: 'Passenger' },
  ] as const;

  private readonly climate = computed(() => this.store.data()?.climate_state);
  protected readonly climateOn = computed(() => this.climate()?.is_climate_on === true);
  protected readonly inside = computed(() => formatTemp(this.climate()?.inside_temp));
  protected readonly outside = computed(() => formatTemp(this.climate()?.outside_temp));
  private readonly driverDraft = linkedSignal(() => this.climate()?.driver_temp_setting ?? 21);
  private readonly passengerDraft = linkedSignal(() => this.climate()?.passenger_temp_setting ?? 21);

  protected readonly hvacBusy = computed(
    () =>
      !this.store.canRequest() ||
      this.store.isBusy('cmd:auto_conditioning_start') ||
      this.store.isBusy('cmd:auto_conditioning_stop'),
  );
  protected readonly canSetTemps = computed(
    () =>
      this.store.canRequest() &&
      !this.store.isBusy('cmd:set_temps') &&
      validTemp(this.driverDraft()) &&
      validTemp(this.passengerDraft()),
  );

  protected draft(zone: 'driver' | 'passenger'): number {
    return zone === 'driver' ? this.driverDraft() : this.passengerDraft();
  }

  protected valid(zone: 'driver' | 'passenger'): boolean {
    return validTemp(this.draft(zone));
  }

  protected setDraft(zone: 'driver' | 'passenger', value: number): void {
    (zone === 'driver' ? this.driverDraft : this.passengerDraft).set(value);
  }

  protected nudge(zone: 'driver' | 'passenger', delta: number): void {
    const current = this.draft(zone);
    const base = Number.isFinite(current) ? current : 21;
    this.setDraft(zone, Math.min(MAX_TEMP, Math.max(MIN_TEMP, Math.round((base + delta) * 2) / 2)));
  }

  protected toggleHvac(): void {
    if (this.climateOn()) {
      void this.store.sendCommand('auto_conditioning_stop', {}, 'Stop climate');
    } else {
      void this.store.sendCommand('auto_conditioning_start', {}, 'Start climate');
    }
  }

  protected setTemps(): void {
    void this.store.sendCommand(
      'set_temps',
      { driver_temp: this.driverDraft(), passenger_temp: this.passengerDraft() },
      'Set temperatures',
    );
  }
}
