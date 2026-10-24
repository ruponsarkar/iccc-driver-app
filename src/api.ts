import { Coordinates, Duty, DutyHistory, Page, Session, Vehicle } from './models';
import { storage } from './storage';
export const DEMO = process.env.EXPO_PUBLIC_USE_MOCK_API === 'true';
const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(path: string, token?: string, body?: unknown, method = 'GET'): Promise<T> {
  if (!baseUrl || baseUrl.includes('your-backend')) throw new Error('Set EXPO_PUBLIC_API_URL in .env before using the live API.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(baseUrl + path, { method, signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) { const data = await response.json().catch(() => null); throw new ApiError(data?.message || `Request failed (${response.status}). Please retry.`, response.status); }
    return response.status === 204 ? undefined as T : await response.json() as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The server took too long. Please retry; your duty status will be checked first.');
    throw error;
  } finally { clearTimeout(timeout); }
}
const demoVehicle: Vehicle = { id: 'BUS-014', number: 'AS 01 UC 8803', type: 'City bus', gpsOnline: true, currentDriver: { id: 'DRV-009', name: 'B. Paidraju' } };
export const api = {
  async login(identifier: string, pin: string): Promise<Session> {
    if (!DEMO) return request('/auth/login', undefined, { identifier, pin }, 'POST');
    if (!['DRV-014', '9876543210'].includes(identifier.toUpperCase()) || pin !== '1234') throw new Error('Use demo Driver ID DRV-014 and PIN 1234.');
    return { token: 'demo-session', driver: { id: 'DRV-014', name: 'Amit Boro' } };
  },
  async current(session: Session): Promise<Duty | null> {
    return DEMO ? storage.get<Duty>('duty') : request('/duties/current', session.token);
  },
  async logout(session: Session): Promise<void> {
    if (!DEMO) await request('/auth/logout', session.token, {}, 'POST');
  },
  async searchVehicles(query: string, session: Session, offset = 0): Promise<Page<Vehicle>> {
    if (!DEMO) return request(`/vehicles?q=${encodeURIComponent(query)}&limit=20&offset=${offset}`, session.token);
    const matches = demoVehicle.number.replace(/ /g, '').includes(query.toUpperCase().replace(/ /g, ''));
    return { items: matches && offset === 0 ? [demoVehicle] : [], total: matches ? 1 : 0, limit: 20, offset };
  },
  async history(session: Session, offset = 0): Promise<Page<DutyHistory>> {
    if (!DEMO) return request(`/duties/history?limit=20&offset=${offset}`, session.token);
    const current = await storage.get<Duty>('duty');
    return { items: current && offset === 0 ? [current] : [], total: current ? 1 : 0, limit: 20, offset };
  },
  async vehicle(identifier: string, session: Session): Promise<Vehicle> {
    if (!DEMO) return request(`/vehicles/${encodeURIComponent(identifier)}`, session.token);
    if (!['BUS-014', 'AS01UC8803'].includes(identifier.replace(/ /g, ''))) throw new Error('Demo vehicle not found. Use AS 01 UC 8803 or BUS-014.');
    return demoVehicle;
  },
  async start(session: Session, vehicle: Vehicle, location: Coordinates | null): Promise<Duty> {
    if (!DEMO) return request('/duties', session.token, { vehicleId: vehicle.id, assignmentVersion: vehicle.assignmentVersion, replaceExistingDriver: Boolean(vehicle.currentDriver), location }, 'POST');
    const existing = await storage.get<Duty>('duty');
    if (existing) return existing;
    const duty: Duty = { id: `duty-${Date.now()}`, driver: session.driver, vehicle: { ...vehicle, currentDriver: session.driver }, startedAt: new Date().toISOString(), location, status: 'ACTIVE' };
    await storage.set('duty', duty); return duty;
  },
  async end(session: Session, duty: Duty, location: Coordinates | null): Promise<void> {
    if (!DEMO) return request(`/duties/${encodeURIComponent(duty.id)}/end`, session.token, { location }, 'POST');
    await storage.remove('duty');
  },
};
