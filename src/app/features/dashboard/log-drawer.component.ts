import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, JsonPipe } from '@angular/common';
import { ActivityLogService } from '../../core/activity-log.service';
import { VehicleStore } from '../../core/vehicle.store';

@Component({
  selector: 'app-log-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, JsonPipe],
  styles: `
    details { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
    summary { padding: 14px 16px; cursor: pointer; font-weight: 600; }
    .body { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 10px; }
    .log { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow: auto; font-size: .8rem; }
    .log li { display: grid; grid-template-columns: 70px 42px 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); }
    .log .detail { grid-column: 3; color: var(--muted); word-break: break-word; }
    .fail { color: var(--danger); }
    .pass { color: var(--ok); }
    pre { max-height: 420px; overflow: auto; background: #0f1216; padding: 12px; border-radius: 10px; margin: 0; }
  `,
  template: `
    <details>
      <summary>🛠 Debug drawer · {{ log.entries().length }} log entries</summary>
      <div class="body">
        <div class="row">
          <button class="btn btn-sm" type="button" [class.btn-primary]="tab() === 'log'" (click)="tab.set('log')">Request / command log</button>
          <button class="btn btn-sm" type="button" [class.btn-primary]="tab() === 'raw'" (click)="tab.set('raw')">Raw telemetry</button>
          <button class="btn btn-sm btn-ghost" type="button" (click)="log.clear()">Clear log</button>
        </div>
        @if (tab() === 'log') {
          <ul class="log">
            @for (e of log.entries(); track e.id) {
              <li>
                <span class="muted">{{ e.at | date: 'HH:mm:ss' }}</span>
                <span [class]="e.ok ? 'pass' : 'fail'">{{ e.status ?? (e.ok ? 'OK' : 'ERR') }}</span>
                <span>{{ e.kind === 'command' ? '▶ ' : '' }}{{ e.label }}@if (e.durationMs !== undefined) {<span class="muted"> · {{ e.durationMs }} ms</span>}</span>
                @if (e.detail) { <span class="detail">{{ e.detail }}</span> }
              </li>
            } @empty {
              <li><span></span><span></span><span class="muted">No requests yet.</span></li>
            }
          </ul>
        } @else {
          @if (store.data(); as data) {
            <pre>{{ data | json }}</pre>
          } @else {
            <p class="muted">No telemetry loaded.</p>
          }
        }
      </div>
    </details>
  `,
})
export class LogDrawerComponent {
  protected readonly log = inject(ActivityLogService);
  protected readonly store = inject(VehicleStore);
  protected readonly tab = signal<'log' | 'raw'>('log');
}
