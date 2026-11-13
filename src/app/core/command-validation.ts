import { CommandPayloads, NO_PAYLOAD_COMMANDS, VehicleCommand } from './models';

/** Same character set the backend enforces: 17 uppercase VIN characters, excluding I, O and Q. */
export const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

export class CommandValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandValidationError';
  }
}

export function isValidVin(vin: unknown): vin is string {
  return typeof vin === 'string' && VIN_PATTERN.test(vin);
}

export function assertValidVin(vin: unknown): string {
  if (!isValidVin(vin)) {
    throw new CommandValidationError('VIN must contain 17 valid uppercase VIN characters');
  }
  return vin;
}

function finiteNumber(value: unknown, name: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new CommandValidationError(`${name} must be a number between ${min} and ${max}`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new CommandValidationError(`${name} must be a whole number`);
  }
  return value;
}

function choice<T extends string>(value: unknown, name: string, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new CommandValidationError(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return value as T;
}

/**
 * Builds a fresh payload containing only the fields the backend allowlist accepts for the command.
 * Unknown fields are never copied through, so the request can't trip the backend's strict field check.
 */
export function buildCommandPayload<C extends VehicleCommand>(
  command: C,
  input: CommandPayloads[C],
): CommandPayloads[C] {
  const raw = (input ?? {}) as Record<string, unknown>;
  if ((NO_PAYLOAD_COMMANDS as readonly string[]).includes(command)) {
    return {} as CommandPayloads[C];
  }
  switch (command) {
    case 'set_temps':
      return {
        driver_temp: finiteNumber(raw['driver_temp'], 'Driver temperature', 15, 30),
        passenger_temp: finiteNumber(raw['passenger_temp'], 'Passenger temperature', 15, 30),
      } as CommandPayloads[C];
    case 'set_charge_limit':
      return { percent: finiteNumber(raw['percent'], 'Charge limit', 0, 100, true) } as CommandPayloads[C];
    case 'actuate_trunk':
      return { which_trunk: choice(raw['which_trunk'], 'Trunk', ['front', 'rear'] as const) } as CommandPayloads[C];
    case 'window_control': {
      const payload: CommandPayloads['window_control'] = {
        command: choice(raw['command'], 'Window command', ['vent', 'close'] as const),
      };
      const hasLat = raw['lat'] !== undefined;
      const hasLon = raw['lon'] !== undefined;
      if (hasLat !== hasLon) {
        throw new CommandValidationError('Latitude and longitude must be provided together');
      }
      if (hasLat) {
        payload.lat = finiteNumber(raw['lat'], 'Latitude', -90, 90);
        payload.lon = finiteNumber(raw['lon'], 'Longitude', -180, 180);
      }
      return payload as CommandPayloads[C];
    }
    case 'remote_start_drive': {
      const password = raw['password'];
      if (password === undefined) {
        return {} as CommandPayloads[C];
      }
      if (typeof password !== 'string' || password.trim().length === 0 || password.length > 256) {
        throw new CommandValidationError('Password must be non-blank and at most 256 characters');
      }
      return { password } as CommandPayloads[C];
    }
    default:
      throw new CommandValidationError('Unsupported vehicle command');
  }
}
