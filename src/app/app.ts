import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ActivityLogService } from './core/activity-log.service';
import { AuthStateService } from './core/auth-state.service';
import { GatewayKeyService } from './core/gateway-key.service';
import { RateLimitService } from './core/rate-limit.service';
import { VehicleStore } from './core/vehicle.store';
import { UnlockGatewayComponent } from './features/unlock/unlock-gateway.component';
import { ConfirmDialogComponent } from './shared/confirm-dialog.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UnlockGatewayComponent, ConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly gatewayKey = inject(GatewayKeyService);
  protected readonly auth = inject(AuthStateService);
  protected readonly rateLimit = inject(RateLimitService);
  private readonly store = inject(VehicleStore);
  private readonly log = inject(ActivityLogService);

  constructor() {
    effect(() => {
      if (this.gatewayKey.hasKey()) {
        // Key restored from sessionStorage (e.g. after the OAuth redirect): learn the Tesla link status.
        untracked(() => {
          if (this.auth.status() === null) {
            void this.auth.refresh();
          }
        });
      } else {
        // Locked (manually or after a 401): drop everything fetched with the old key.
        untracked(() => {
          this.auth.reset();
          this.store.reset();
        });
      }
    });
  }

  protected lock(): void {
    this.gatewayKey.lock();
    this.log.clear();
  }
}
