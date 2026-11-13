export interface AuthStatus {
  authenticated: boolean;
  expiresAt: string | null;
}

export interface LoginUrlResponse {
  url: string;
}

export interface TeslaEnvelope<T> {
  response: T;
  count?: number;
}

export type VehicleState = 'online' | 'asleep' | 'offline' | string;

export interface Vehicle {
  id?: number;
  vehicle_id?: number;
  vin: string;
  display_name?: string | null;
  state?: VehicleState;
  in_service?: boolean;
}

export interface ChargeState {
  battery_level?: number;
  usable_battery_level?: number;
  battery_range?: number;
  est_battery_range?: number;
  ideal_battery_range?: number;
  charge_limit_soc?: number;
  charge_limit_soc_min?: number;
  charge_limit_soc_max?: number;
  charging_state?: string;
  charge_port_door_open?: boolean;
  charge_port_latch?: string;
  charger_power?: number;
  charge_rate?: number;
  minutes_to_full_charge?: number;
  time_to_full_charge?: number;
}

export interface ClimateState {
  inside_temp?: number | null;
  outside_temp?: number | null;
  driver_temp_setting?: number;
  passenger_temp_setting?: number;
  is_climate_on?: boolean;
  is_auto_conditioning_on?: boolean;
  min_avail_temp?: number;
  max_avail_temp?: number;
}

export interface VehicleStateDetails {
  locked?: boolean;
  odometer?: number;
  car_version?: string;
  df?: number;
  dr?: number;
  pf?: number;
  pr?: number;
  ft?: number;
  rt?: number;
  fd_window?: number;
  fp_window?: number;
  rd_window?: number;
  rp_window?: number;
  sentry_mode?: boolean;
  remote_start?: boolean;
}

export interface DriveState {
  latitude?: number;
  longitude?: number;
  heading?: number;
  speed?: number | null;
  shift_state?: string | null;
  timestamp?: number;
}

export interface GuiSettings {
  gui_distance_units?: string;
  gui_temperature_units?: string;
  gui_range_display?: string;
}

export interface VehicleData extends Vehicle {
  charge_state?: ChargeState;
  climate_state?: ClimateState;
  vehicle_state?: VehicleStateDetails;
  drive_state?: DriveState;
  gui_settings?: GuiSettings;
  vehicle_config?: Record<string, unknown>;
  closures_state?: Record<string, unknown>;
  location_data?: Record<string, unknown>;
}

export interface CommandResult {
  result?: boolean;
  reason?: string;
}

export const NO_PAYLOAD_COMMANDS = [
  'door_lock',
  'door_unlock',
  'auto_conditioning_start',
  'auto_conditioning_stop',
  'charge_start',
  'charge_stop',
  'charge_port_door_open',
  'charge_port_door_close',
  'flash_lights',
  'honk_horn',
] as const;

export type NoPayloadCommand = (typeof NO_PAYLOAD_COMMANDS)[number];
export type EmptyPayload = Record<string, never>;

export interface CommandPayloads extends Record<NoPayloadCommand, EmptyPayload> {
  set_temps: { driver_temp: number; passenger_temp: number };
  set_charge_limit: { percent: number };
  actuate_trunk: { which_trunk: 'front' | 'rear' };
  window_control: { command: 'vent' | 'close'; lat?: number; lon?: number };
  remote_start_drive: { password?: string };
}

export type VehicleCommand = keyof CommandPayloads;

export const LIVE_DATA_ENDPOINTS =
  'charge_state;climate_state;vehicle_state;drive_state;closures_state;location_data;gui_settings;vehicle_config';
