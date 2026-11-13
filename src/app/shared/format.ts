import { GuiSettings } from '../core/models';

const KM_PER_MILE = 1.609344;

/** Tesla reports ranges in miles; honour the car's GUI distance setting. */
export function formatRange(miles: number | undefined, gui: GuiSettings | undefined): string {
  if (typeof miles !== 'number' || !Number.isFinite(miles)) {
    return '—';
  }
  return gui?.gui_distance_units?.startsWith('km')
    ? `${Math.round(miles * KM_PER_MILE)} km`
    : `${Math.round(miles)} mi`;
}

export function formatTemp(celsius: number | null | undefined): string {
  return typeof celsius === 'number' && Number.isFinite(celsius) ? `${celsius.toFixed(1)} °C` : '—';
}

export function stateBadgeClass(state: string | undefined): string {
  switch (state) {
    case 'online':
      return 'badge badge-ok';
    case 'asleep':
      return 'badge badge-warn';
    case 'offline':
      return 'badge badge-danger';
    default:
      return 'badge';
  }
}
