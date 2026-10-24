export type Driver = { id: string; name: string };
export type Session = { token: string; driver: Driver };
export type Vehicle = { id: string; number: string; type: string; gpsOnline: boolean; currentDriver: Driver | null; assignmentVersion?: string; qrValue?: string; division?: string | null };
export type Page<T> = { items: T[]; total: number; limit: number; offset: number };
export type Coordinates = { latitude: number; longitude: number; accuracy: number | null };
export type Duty = { id: string; driver: Driver; vehicle: Vehicle; startedAt: string; location: Coordinates | null; status: 'ACTIVE' };
export type DutyHistory = Omit<Duty, 'status'> & { status: 'ACTIVE' | 'ENDED'; endedAt?: string; endLocation?: Coordinates | null; endReason?: string };
export function vehicleIdentifier(raw: string): string {
  let value = raw.trim();
  if (value.startsWith('{')) {
    try { const data = JSON.parse(value); value = data.vehicleId ?? data.vehicleNumber ?? ''; }
    catch { throw new Error('This QR code does not contain valid vehicle data.'); }
  }
  if (typeof value !== 'string' || !/^[a-zA-Z0-9 -]{1,40}$/.test(value) || !value.trim()) throw new Error('Enter a valid vehicle number or scan a vehicle QR code.');
  return value.trim().toUpperCase();
}
