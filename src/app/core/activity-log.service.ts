import { Injectable, signal } from '@angular/core';

export interface LogEntry {
  id: number;
  at: Date;
  kind: 'request' | 'command' | 'info';
  label: string;
  status?: number;
  ok: boolean;
  durationMs?: number;
  detail?: string;
}

const MAX_ENTRIES = 100;

/**
 * In-memory debug log for the telemetry/command drawer. Callers must never pass secrets
 * (X-App-Key, OAuth code/state, passwords) — only method, path, status and safe summaries.
 */
@Injectable({ providedIn: 'root' })
export class ActivityLogService {
  private nextId = 1;
  readonly entries = signal<LogEntry[]>([]);

  add(entry: Omit<LogEntry, 'id' | 'at'>): void {
    const item: LogEntry = { ...entry, id: this.nextId++, at: new Date() };
    this.entries.update((list) => [item, ...list].slice(0, MAX_ENTRIES));
  }

  clear(): void {
    this.entries.set([]);
  }
}
