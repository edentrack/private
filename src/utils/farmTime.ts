import { DateTime } from 'luxon';

export function getFarmTimeZone(currentFarm: any): string {
  const tz = String(currentFarm?.timezone || currentFarm?.time_zone || '').trim();
  if (tz) return tz;

  // Sensible default for Cameroon farms.
  const country = String(currentFarm?.country || '').toLowerCase();
  if (country.includes('cameroon') || country === 'cm') return 'Africa/Douala';

  // Fall back to viewer timezone if farm timezone is unknown.
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function farmLocalToUtcIso(params: { dateISO: string; timeHHMM: string; farmTz: string }): string {
  const dt = DateTime.fromISO(`${params.dateISO}T${params.timeHHMM}:00`, { zone: params.farmTz });
  if (!dt.isValid) return new Date().toISOString();
  return dt.toUTC().toISO() || new Date().toISOString();
}

export function formatFarmTimeForViewer(params: { dateISO: string; timeHHMM: string; farmTz: string }): string {
  const dt = DateTime.fromISO(`${params.dateISO}T${params.timeHHMM}:00`, { zone: params.farmTz });
  if (!dt.isValid) return params.timeHHMM;
  return dt.setZone(DateTime.local().zoneName).toLocaleString(DateTime.TIME_SIMPLE);
}

export function formatFarmTimeForViewerWithFormat(params: {
  dateISO: string;
  timeHHMM: string;
  farmTz: string;
  timeFormat: '24h' | '12h';
}): string {
  const dt = DateTime.fromISO(`${params.dateISO}T${params.timeHHMM}:00`, { zone: params.farmTz });
  if (!dt.isValid) return params.timeHHMM;
  const local = dt.setZone(DateTime.local().zoneName);
  return params.timeFormat === '12h' ? local.toFormat('h:mm a') : local.toFormat('HH:mm');
}

export function formatFarmTimeForFarm(params: { dateISO: string; timeHHMM: string; farmTz: string }): string {
  const dt = DateTime.fromISO(`${params.dateISO}T${params.timeHHMM}:00`, { zone: params.farmTz });
  if (!dt.isValid) return params.timeHHMM;
  return dt.setZone(params.farmTz).toLocaleString(DateTime.TIME_SIMPLE);
}

export function formatFarmClockWithFormat(params: {
  dateISO: string;
  timeHHMM: string;
  farmTz: string;
  timeFormat: '24h' | '12h';
}): string {
  const dt = DateTime.fromISO(`${params.dateISO}T${params.timeHHMM}:00`, { zone: params.farmTz });
  if (!dt.isValid) return params.timeHHMM;
  const farmLocal = dt.setZone(params.farmTz);
  return params.timeFormat === '12h' ? farmLocal.toFormat('h:mm a') : farmLocal.toFormat('HH:mm');
}

const TIME_FORMAT_KEY = 'ui_time_format';
export function getUiTimeFormat(): '24h' | '12h' {
  try {
    const v = String(localStorage.getItem(TIME_FORMAT_KEY) || '').toLowerCase();
    if (v === '12h') return '12h';
    return '24h';
  } catch {
    return '24h';
  }
}

export function setUiTimeFormat(format: '24h' | '12h') {
  try {
    localStorage.setItem(TIME_FORMAT_KEY, format);
  } catch {
    // ignore
  }
}

export function getNowMinutesInFarmTz(farmTz: string): number {
  const now = DateTime.now().setZone(farmTz);
  if (!now.isValid) {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }
  return now.hour * 60 + now.minute;
}

export function getFarmTodayISO(farmTz: string): string {
  const now = DateTime.now().setZone(farmTz);
  if (!now.isValid) return new Date().toISOString().split('T')[0];
  return now.toISODate() || new Date().toISOString().split('T')[0];
}

/** YYYY-MM-DD as a calendar day in farm TZ → JS weekday 0=Sun..6=Sat (task template `days_of_week`). */
export function jsWeekdayForFarmDate(dateISO: string, farmTz: string): number {
  let dt = DateTime.fromISO(dateISO, { zone: farmTz });
  if (!dt.isValid) dt = DateTime.fromISO(`${dateISO}T12:00:00`, { zone: farmTz });
  if (!dt.isValid) return new Date(`${dateISO}T12:00:00`).getDay();
  return dt.weekday % 7;
}

export function dayOfMonthForFarmDate(dateISO: string, farmTz: string): number {
  let dt = DateTime.fromISO(dateISO, { zone: farmTz });
  if (!dt.isValid) dt = DateTime.fromISO(`${dateISO}T12:00:00`, { zone: farmTz });
  if (!dt.isValid) return new Date(`${dateISO}T12:00:00`).getDate();
  return dt.day;
}

