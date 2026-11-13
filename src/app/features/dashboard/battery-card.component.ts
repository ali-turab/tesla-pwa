import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { VehicleStore } from '../../core/vehicle.store';
import { formatRange } from '../../shared/format';

@Component({
  selector: 'app-battery-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .soc { height: 12px; border-radius: 999px; background: var(--surface-2); overflow: hidden; position: relative; }
    .soc-fill { height: 100%; background: linear-gradient(90deg, #2ecc71, #3e8bff); transition: width .3s; }
    .soc-fill.low { background: var(--danger); }
    .soc-limit { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--text); opacity: .7; }
  `,
  template: `
    <section class="card" aria-labelledby="battery-title">
      <div class="card-head">
        <h2 id="battery-title">🔋 Battery &amp; Charging</h2>
        <span class="muted">{{ charge()?.charging_state ?? '—' }}</span>
      </div>

      <div class="row" style="justify-content: space-between; align-items: baseline">
        <span class="metric">{{ level() ?? '—' }}<small class="muted">%</small></span>
        <span class="muted">{{ range() }}</span>
      </div>
      <div class="soc" role="progressbar" aria-label="State of charge" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="level()">
        <div class="soc-fill" [class.low]="(level() ?? 100) < 20" [style.width.%]="level() ?? 0"></div>
        @if (charge()?.charge_limit_soc; as limit) {
          <div class="soc-limit" [style.left.%]="limit"></div>
        }
      </div>

      @if (charge()?.charging_state === 'Charging') {
        <dl class="kv">
          <dt>Power</dt><dd>{{ charge()?.charger_power ?? '—' }} kW</dd>
          <dt>Time to limit</dt><dd>{{ charge()?.time_to_full_charge ?? '—' }} h</dd>
        </dl>
      }

      <label class="field">
        <span class="row" style="justify-content: space-between">
          <span>Charge limit</span><strong style="color: var(--text)">{{ limitDraft() }}%</strong>
        </span>
        <input type="range" step="1" [min]="limitMin()" [max]="limitMax()" [value]="limitDraft()"
               (input)="limitDraft.set(toInt($any($event.target).value))" aria-label="Charge limit percent" />
      </label>
      <button class="btn" type="button" [disabled]="!canSetLimit()" (click)="setLimit()">
        @if (store.isBusy('cmd:set_charge_limit')) { <span class="spinner" aria-hidden="true"></span> } Set limit to {{ limitDraft() }}%
      </button>

      <div class="row">
        <button class="btn btn-grow" type="button" [disabled]="busy('charge_start', 'charge_stop')"
                (click)="store.sendCommand('charge_start', {}, 'Start charging')">Start charge</button>
        <button class="btn btn-grow" type="button" [disabled]="busy('charge_start', 'charge_stop')"
                (click)="store.sendCommand('charge_stop', {}, 'Stop charging')">Stop charge</button>
      </div>
      <div class="row">
        <button class="btn btn-grow" type="button" [disabled]="busy('charge_port_door_open', 'charge_port_door_close')"
                (click)="store.sendCommand('charge_port_door_open', {}, 'Open charge port')">Open port</button>
        <button class="btn btn-grow" type="button" [disabled]="busy('charge_port_door_open', 'charge_port_door_close')"
                (click)="store.sendCommand('charge_port_door_close', {}, 'Close charge port')">Close port</button>
      </div>
      <span class="muted">Charge port: {{ portLabel() }}</span>
    </section>
  `,
})
export class BatteryCardComponent {
  protected readonly store = inject(VehicleStore);
  protected readonly charge = computed(() => this.store.data()?.charge_state);
  protected readonly level = computed(() => this.charge()?.battery_level ?? null);
  protected readonly range = computed(() => formatRange(this.charge()?.battery_range, this.store.data()?.gui_settings));
  protected readonly limitMin = computed(() => clamp(this.charge()?.charge_limit_soc_min ?? 50));
  protected readonly limitMax = computed(() => clamp(this.charge()?.charge_limit_soc_max ?? 100));
  protected readonly limitDraft = linkedSignal(() => clamp(this.charge()?.charge_limit_soc ?? 80));
  protected readonly portLabel = computed(() => {
    const open = this.charge()?.charge_port_door_open;
    return open === undefined ? 'unknown' : open ? 'open' : 'closed';
  });
  protected readonly canSetLimit = computed(() => {
    const value = this.limitDraft();
    return (
      this.store.canRequest() &&
      !this.store.isBusy('cmd:set_charge_limit') &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 100
    );
  });

  protected busy(...commands: string[]): boolean {
    return !this.store.canRequest() || commands.some((c) => this.store.isBusy(`cmd:${c}`));
  }

  protected toInt(value: string): number {
    return clamp(Math.round(Number(value)));
  }

  protected setLimit(): void {
    void this.store.sendCommand('set_charge_limit', { percent: this.limitDraft() }, 'Set charge limit');
  }
}

function clamp(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : 80;
}
