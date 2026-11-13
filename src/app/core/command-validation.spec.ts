import { CommandValidationError, buildCommandPayload, isValidVin } from './command-validation';
import { CommandPayloads } from './models';

describe('buildCommandPayload', () => {
  it('sends an exact empty body for no-payload commands, dropping stray fields', () => {
    expect(buildCommandPayload('door_lock', { extra: 1 } as unknown as CommandPayloads['door_lock'])).toEqual({});
  });

  it('keeps only allowlisted fields for parameterized commands', () => {
    const input = { driver_temp: 21, passenger_temp: 22.5, seat: 1 } as CommandPayloads['set_temps'];
    expect(buildCommandPayload('set_temps', input)).toEqual({ driver_temp: 21, passenger_temp: 22.5 });
  });

  it.each([
    ['set_temps', { driver_temp: 14.5, passenger_temp: 20 }],
    ['set_temps', { driver_temp: 20, passenger_temp: Number.NaN }],
    ['set_charge_limit', { percent: 80.5 }],
    ['set_charge_limit', { percent: 101 }],
    ['actuate_trunk', { which_trunk: 'side' }],
    ['window_control', { command: 'vent', lat: 10 }],
    ['window_control', { command: 'close', lat: 91, lon: 0 }],
    ['remote_start_drive', { password: '   ' }],
    ['remote_start_drive', { password: 'x'.repeat(257) }],
  ])('rejects invalid %s payload %j', (command, payload) => {
    expect(() => buildCommandPayload(command as 'set_temps', payload as never)).toThrow(CommandValidationError);
  });

  it('accepts optional window coordinates and remote start without password', () => {
    expect(buildCommandPayload('window_control', { command: 'close', lat: -33.5, lon: 151.2 })).toEqual({
      command: 'close',
      lat: -33.5,
      lon: 151.2,
    });
    expect(buildCommandPayload('remote_start_drive', {})).toEqual({});
  });
});

describe('isValidVin', () => {
  it('enforces 17 uppercase VIN characters without I, O or Q', () => {
    expect(isValidVin('5YJ3E1EA7KF000001')).toBe(true);
    expect(isValidVin('5yj3e1ea7kf000001')).toBe(false);
    expect(isValidVin('5YJ3E1EA7KF00000O')).toBe(false);
    expect(isValidVin('5YJ3E1EA7KF00000')).toBe(false);
  });
});
