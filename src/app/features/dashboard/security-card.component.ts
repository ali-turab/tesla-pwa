import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { VehicleStore } from '../../core/vehicle.store';
import { ConfirmService } from '../../shared/confirm.service';

function currentPosition(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation is not available on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
          lon: Math.round(pos.coords.longitude * 1e6) / 1e6,
        }),
      () => reject(new Error('Could not read your location (permission denied or timed out)')),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

@Component({
  selector: 'app-security-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card" aria-labelledby="security-title">
      <div class="card-head">
        <h2 id="security-title">🛡 Security &amp; Access</h2>
        <span [class]="locked() === false ? 'badge badge-warn' : locked() ? 'badge badge-ok' : 'badge'">
          {{ locked() === undefined ? 'unknown' : locked() ? 'locked' : 'unlocked' }}
        </span>
      </div>

      <div class="row">
        <button class="btn btn-grow" type="button" [disabled]="busy('door_lock', 'door_unlock')"
                (click)="store.sendCommand('door_lock', {}, 'Lock')">🔒 Lock</button>
        <button class="btn btn-grow" type="button" [disabled]="busy('door_lock', 'door_unlock')"
                (click)="store.sendCommand('door_unlock', {}, 'Unlock')">🔓 Unlock</button>
      </div>

      <div class="row">
        <button class="btn btn-grow" type="button" [disabled]="busy('actuate_trunk')" (click)="trunk('front')">Open frunk</button>
        <button class="btn btn-grow" type="button" [disabled]="busy('actuate_trunk')" (click)="trunk('rear')">Open/close trunk</button>
      </div>

      <div class="stack">
        <div class="row">
          <button class="btn btn-grow" type="button" [disabled]="busy('window_control') || locating()" (click)="windows('vent')">Vent windows</button>
          <button class="btn btn-grow" type="button" [disabled]="busy('window_control') || locating()" (click)="windows('close')">Close windows</button>
        </div>
        <label class="check">
          <input type="checkbox" [checked]="sendLocation()" (change)="sendLocation.set($any($event.target).checked)" />
          Send my device location (some vehicles require it to close windows)
        </label>
      </div>

      <div class="row">
        <button class="btn btn-grow" type="button" [disabled]="busy('flash_lights')"
                (click)="store.sendCommand('flash_lights', {}, 'Flash lights')">💡 Flash lights</button>
        <button class="btn btn-grow" type="button" [disabled]="busy('honk_horn')"
                (click)="store.sendCommand('honk_horn', {}, 'Honk horn')">📣 Honk horn</button>
      </div>

      <details>
        <summary class="muted" style="cursor: pointer">Keyless driving (remote start)</summary>
        <form class="stack" style="margin-top: 8px" (submit)="remoteStart($event)">
          <input class="sr-only" type="text" name="username" autocomplete="username" value="tesla-account" readonly tabindex="-1" aria-hidden="true" />
          <label class="field">
            Tesla account password (optional)
            <input #pw class="input" type="password" name="password" autocomplete="current-password" maxlength="256"
                   [value]="password()" (input)="password.set(pw.value)" [attr.aria-invalid]="!passwordValid() ? 'true' : null" />
          </label>
          @if (!passwordValid()) {
            <span class="muted" style="color: var(--danger)">Password must not be blank and at most 256 characters.</span>
          }
          <button class="btn btn-danger" type="submit" [disabled]="busy('remote_start_drive') || !passwordValid()">Enable keyless driving</button>
        </form>
      </details>
    </section>
  `,
})
export class SecurityCardComponent {
  protected readonly store = inject(VehicleStore);
  private readonly confirm = inject(ConfirmService);

  protected readonly locked = computed(() => this.store.data()?.vehicle_state?.locked);
  protected readonly sendLocation = signal(false);
  protected readonly locating = signal(false);
  protected readonly password = signal('');
  protected readonly passwordValid = computed(() => {
    const value = this.password();
    return value === '' || (value.trim().length > 0 && value.length <= 256);
  });

  protected busy(...commands: string[]): boolean {
    return !this.store.canRequest() || commands.some((c) => this.store.isBusy(`cmd:${c}`));
  }

  protected async trunk(which: 'front' | 'rear'): Promise<void> {
    const label = which === 'front' ? 'frunk' : 'trunk';
    const ok = await this.confirm.ask({
      title: which === 'front' ? 'Pop the frunk?' : 'Actuate the rear trunk?',
      message:
        which === 'front'
          ? 'The front trunk will unlatch and must be closed by hand.'
          : 'The rear trunk will open (or close if already open). Make sure the area is clear.',
      confirmLabel: which === 'front' ? 'Open frunk' : 'Actuate trunk',
      danger: true,
    });
    if (ok) {
      await this.store.sendCommand('actuate_trunk', { which_trunk: which }, `Actuate ${label}`);
    }
  }

  protected async windows(command: 'vent' | 'close'): Promise<void> {
    const label = command === 'vent' ? 'Vent windows' : 'Close windows';
    if (!this.sendLocation()) {
      await this.store.sendCommand('window_control', { command }, label);
      return;
    }
    this.locating.set(true);
    try {
      const { lat, lon } = await currentPosition();
      await this.store.sendCommand('window_control', { command, lat, lon }, label);
    } catch (err) {
      this.store.error.set({ kind: 'validation', status: 0, message: (err as Error).message });
    } finally {
      this.locating.set(false);
    }
  }

  protected async remoteStart(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.passwordValid()) {
      return;
    }
    const ok = await this.confirm.ask({
      title: 'Enable keyless driving?',
      message: 'Anyone in the vehicle will be able to drive it for the next 2 minutes.',
      confirmLabel: 'Enable',
      danger: true,
    });
    if (!ok) {
      return;
    }
    const password = this.password();
    this.password.set('');
    await this.store.sendCommand('remote_start_drive', password ? { password } : {}, 'Keyless driving');
  }
}
