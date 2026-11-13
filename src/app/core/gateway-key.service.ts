import { Injectable, computed, signal } from '@angular/core';

const STORAGE_KEY = 'tesla-gateway.app-key';

/**
 * Holds the gateway X-App-Key entered by the owner. The key lives in memory and is optionally
 * mirrored to sessionStorage (tab-scoped, cleared when the tab closes) so it survives the
 * full-page redirect to Tesla's OAuth page and back.
 */
@Injectable({ providedIn: 'root' })
export class GatewayKeyService {
  private readonly key = signal<string | null>(readStorage());
  private readonly persisted = signal(this.key() !== null);

  readonly hasKey = computed(() => this.key() !== null);
  readonly isPersisted = this.persisted.asReadonly();
  /** Reason shown on the Unlock Gateway screen (e.g. after a 401 from the gateway). */
  readonly promptReason = signal<string | null>(null);

  current(): string | null {
    return this.key();
  }

  unlock(key: string, persist: boolean): void {
    this.key.set(key);
    this.promptReason.set(null);
    this.persisted.set(persist);
    if (persist) {
      writeStorage(key);
    } else {
      clearStorage();
    }
  }

  /** Ensures the key survives the full-page Tesla OAuth redirect. */
  persistForRedirect(): boolean {
    const key = this.key();
    if (!key) {
      return false;
    }
    this.persisted.set(writeStorage(key));
    return this.persisted();
  }

  lock(reason: string | null = null): void {
    this.key.set(null);
    this.persisted.set(false);
    this.promptReason.set(reason);
    clearStorage();
  }
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function readStorage(): string | null {
  try {
    const value = storage()?.getItem(STORAGE_KEY);
    return value ? value : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string): boolean {
  try {
    storage()?.setItem(STORAGE_KEY, key);
    return storage() !== null;
  } catch {
    return false;
  }
}

function clearStorage(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable (e.g. privacy mode); in-memory state is already cleared.
  }
}
