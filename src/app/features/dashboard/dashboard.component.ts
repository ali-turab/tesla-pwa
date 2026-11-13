import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AuthStateService } from '../../core/auth-state.service';
import { GatewayKeyService } from '../../core/gateway-key.service';
import { RateLimitService } from '../../core/rate-limit.service';
import { VehicleStore } from '../../core/vehicle.store';
import { BatteryCardComponent } from './battery-card.component';
import { ClimateCardComponent } from './climate-card.component';
import { LogDrawerComponent } from './log-drawer.component';
import { SecurityCardComponent } from './security-card.component';
import { VehicleHeaderComponent } from './vehicle-header.component';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, VehicleHeaderComponent, BatteryCardComponent, ClimateCardComponent, SecurityCardComponent, LogDrawerComponent],
  template: `
    <section class="container stack" style="gap: var(--gap)">
      @if (!gatewayKey.hasKey()) {
        <p class="muted">🔒 Gateway locked. Enter your X-App-Key to continue.</p>
      } @else if (auth.authenticated() === false) {
        <div class="alert alert-warn" role="status">
          <div class="stack" style="gap: 2px">
            <strong>Connect Tesla Account</strong>
            <span class="muted">{{ auth.disconnectedReason() ?? 'The gateway is not linked to a Tesla account yet.' }}</span>
          </div>
          <button class="btn btn-primary" type="button" [disabled]="auth.redirecting() || rateLimit.active()" (click)="connect()">
            @if (auth.redirecting()) { <span class="spinner" aria-hidden="true"></span> Redirecting… } @else { Connect Tesla Account }
          </button>
        </div>
        @if (loginError(); as message) {
          <div class="alert alert-danger" role="alert">{{ message }}</div>
        }
      } @else if (auth.authenticated() === null) {
        @if (auth.lastError(); as err) {
          <div class="alert alert-danger" role="alert">
            <span>{{ err.message }}</span>
            <button class="btn btn-sm" type="button" [disabled]="auth.checking() || rateLimit.active()" (click)="auth.refresh()">Retry</button>
          </div>
        } @else {
          <p class="row muted"><span class="spinner" aria-hidden="true"></span> Checking gateway status…</p>
        }
      } @else {
        @if (auth.status()?.expiresAt; as expiresAt) {
          <p class="muted" style="margin: 0">Tesla token valid until {{ expiresAt | date: 'medium' }}</p>
        }

        @if (store.vehicles(); as vehicles) {
          @if (vehicles.length === 0) {
            <div class="alert alert-info">No vehicles found in the connected Tesla account.</div>
          } @else {
            @if (vehicles.length > 1) {
              <label class="field">
                Vehicle
                <select class="input" (change)="store.select($any($event.target).value)">
                  @for (v of vehicles; track v.vin) {
                    <option [value]="v.vin" [selected]="v.vin === store.selectedVin()">{{ v.display_name || v.vin }}</option>
                  }
                </select>
              </label>
            }

            <app-vehicle-header />

            @if (store.error(); as err) {
              <div class="alert alert-danger" role="alert">
                <span>{{ err.message }}</span>
                <button class="btn btn-sm btn-ghost" type="button" (click)="store.dismissMessages()">Dismiss</button>
              </div>
            }
            @if (store.needsWake()) {
              <div class="alert alert-warn" role="status">
                <span>The vehicle appears to be asleep or offline. Wake it before sending live requests or commands.</span>
                <button class="btn btn-sm btn-primary" type="button" [disabled]="!store.canRequest() || store.isBusy('wake')" (click)="store.wake()">
                  Wake Vehicle
                </button>
              </div>
            }
            @if (store.notice(); as notice) {
              <div class="alert alert-ok" role="status">
                <span>{{ notice }}</span>
                <button class="btn btn-sm btn-ghost" type="button" (click)="store.notice.set(null)">Dismiss</button>
              </div>
            }

            <div class="grid">
              <app-battery-card />
              <app-climate-card />
              <app-security-card />
            </div>
          }
        } @else if (store.isBusy('vehicles')) {
          <p class="row muted"><span class="spinner" aria-hidden="true"></span> Loading vehicles…</p>
        } @else {
          @if (store.error(); as err) {
            <div class="alert alert-danger" role="alert">{{ err.message }}</div>
          }
          <button class="btn" type="button" [disabled]="!store.canRequest()" (click)="store.loadVehicles()">Load vehicles</button>
        }
      }

      <app-log-drawer />
    </section>
  `,
})
export class DashboardComponent {
  protected readonly auth = inject(AuthStateService);
  protected readonly store = inject(VehicleStore);
  protected readonly rateLimit = inject(RateLimitService);
  protected readonly gatewayKey = inject(GatewayKeyService);
  protected readonly loginError = signal<string | null>(null);

  constructor() {
    // Load the inventory once per (unlocked, authenticated) transition; failures need a manual retry.
    effect(() => {
      if (this.gatewayKey.hasKey() && this.auth.authenticated() === true) {
        untracked(() => {
          if (this.store.vehicles() === null) {
            void this.store.loadVehicles();
          }
        });
      }
    });
  }

  protected async connect(): Promise<void> {
    this.loginError.set(null);
    const err = await this.auth.startLogin();
    if (err) {
      this.loginError.set(err.message);
    }
  }
}
