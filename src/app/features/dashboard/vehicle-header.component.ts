import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { VehicleStore } from '../../core/vehicle.store';
import { stateBadgeClass } from '../../shared/format';

@Component({
  selector: 'app-vehicle-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <header class="card">
      <div class="card-head" style="align-items: flex-start">
        <div class="stack" style="gap: 4px; min-width: 0">
          <h1 style="font-size: 1.4rem">{{ name() }}</h1>
          <code class="muted" style="word-break: break-all">{{ store.selectedVin() }}</code>
        </div>
        <span [class]="badgeClass()">{{ store.vehicleState() }}</span>
      </div>

      <p class="muted" style="margin: 0">
        @if (store.updatedAt(); as at) {
          {{ store.dataSource() === 'live' ? 'Live' : 'Cached' }} data · {{ at | date: 'mediumTime' }}
        } @else if (store.isBusy('cached') || store.isBusy('live')) {
          Loading telemetry…
        } @else {
          No telemetry loaded yet
        }
      </p>

      <div class="row">
        <button class="btn btn-grow" type="button" [disabled]="!store.canRequest() || store.isBusy('cached')" (click)="store.refreshCached()"
                title="Fetch cached data without waking the vehicle">
          @if (store.isBusy('cached')) { <span class="spinner" aria-hidden="true"></span> } ⟳ Passive Refresh
        </button>
        <button class="btn btn-grow" type="button" [disabled]="!store.canRequest() || store.isBusy('live')" (click)="store.refreshLive()"
                title="Query the vehicle directly (it must be awake)">
          @if (store.isBusy('live')) { <span class="spinner" aria-hidden="true"></span> } ⚡ Live Refresh
        </button>
        <button class="btn btn-grow" type="button" [disabled]="!store.canRequest() || store.isBusy('wake')" (click)="store.wake()">
          @if (store.isBusy('wake')) { <span class="spinner" aria-hidden="true"></span> } ☀ Wake Vehicle
        </button>
      </div>
    </header>
  `,
})
export class VehicleHeaderComponent {
  protected readonly store = inject(VehicleStore);
  protected readonly name = computed(
    () => this.store.data()?.display_name || this.store.selectedVehicle()?.display_name || 'My Tesla',
  );
  protected readonly badgeClass = computed(() => stateBadgeClass(this.store.vehicleState()));
}
