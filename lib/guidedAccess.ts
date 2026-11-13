import { randomBytes } from 'crypto';

import { query } from '@/lib/db';

// Capa de acceso guiado (pedido de Luisa, puntos 1-3). Ver 008_guided_access.sql.
// Convive con eventAccess.ts (QR por evento); esto es el QR PERMANENTE por tour,
// la vigencia por día y la activación por cercanía GPS.

// Zona horaria del operador para decidir "el día de hoy" de una excursión.
const TOUR_TZ = 'America/New_York';
// Radio por defecto (metros) para considerar al pasajero "cerca" del guía.
const DEFAULT_RADIUS_M = 200;
// Antigüedad máxima (min) de la ubicación del guía para tenerla por válida.
const GUIDE_LOC_MAX_AGE_MIN = 15;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode(len: number): string {
  const b = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

// --- Punto 1: QR permanente por tour ---

/**
 * Devuelve el código compartido PERMANENTE del tour, creándolo si no existe.
 * Un único QR por tour que el guía usa en todas las excursiones.
 */
export async function getOrCreateTourShareCode(
  tourUuid: string,
): Promise<string> {
  const existing = await query<{ code: string }>(
    'SELECT code FROM ext.tour_share_code WHERE tour_uuid = $1',
    [tourUuid],
  );
  if (existing[0]) return existing[0].code;

  for (let i = 0; i < 6; i++) {
    const code = genCode(8);
    try {
      const rows = await query<{ code: string }>(
        'INSERT INTO ext.tour_share_code (tour_uuid, code) VALUES ($1, $2) RETURNING code',
        [tourUuid, code],
      );
      return rows[0].code;
    } catch {
      const again = await query<{ code: string }>(
        'SELECT code FROM ext.tour_share_code WHERE tour_uuid = $1',
        [tourUuid],
      );
      if (again[0]) return again[0].code;
    }
  }
  throw new Error('No se pudo generar el código del tour.');
}

/** Resuelve el tour_uuid a partir de un código permanente, o null. */
export async function tourUuidByCode(code: string): Promise<string | null> {
  const rows = await query<{ tour_uuid: string }>(
    'SELECT tour_uuid FROM ext.tour_share_code WHERE code = $1',
    [code.trim().toUpperCase()],
  );
  return rows[0]?.tour_uuid ?? null;
}

export interface TodayEvent {
  uuid: string;
  datetime: string;
  valid_date: string; // fecha (zona del operador) del evento = YYYY-MM-DD
}

/**
 * Evento de HOY (zona del operador) para un tour. Si hay más de uno, el de hora
 * más cercana al momento actual. null si el tour no tiene excursión hoy.
 */
export async function resolveTodayEventForTour(
  tourUuid: string,
): Promise<TodayEvent | null> {
  const rows = await query<TodayEvent>(
    `SELECT e.uuid,
            e.datetime,
            (e.datetime AT TIME ZONE $2)::date AS valid_date
     FROM public.events e
     WHERE e.tour_uuid = $1
       AND (e.datetime AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
     ORDER BY abs(extract(epoch FROM (e.datetime - now())))
     LIMIT 1`,
    [tourUuid, TOUR_TZ],
  );
  return rows[0] ?? null;
}

// --- Punto 3: ubicación del guía + cercanía ---

/** Upsert de la última ubicación del guía para un evento. */
export async function upsertGuideLocation(params: {
  eventUuid: string;
  guideUuid: string;
  lat: number;
  lng: number;
}): Promise<void> {
  await query(
    `INSERT INTO ext.guide_location (event_uuid, tour_guide_uuid, lat, lng, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (event_uuid) DO UPDATE SET
       tour_guide_uuid = $2, lat = $3, lng = $4, updated_at = now()`,
    [params.eventUuid, params.guideUuid, params.lat, params.lng],
  );
}

interface GuideLoc {
  lat: number;
  lng: number;
}

/** Última ubicación del guía si es reciente (< GUIDE_LOC_MAX_AGE_MIN), o null. */
export async function getFreshGuideLocation(
  eventUuid: string,
): Promise<GuideLoc | null> {
  const rows = await query<GuideLoc>(
    `SELECT lat, lng FROM ext.guide_location
     WHERE event_uuid = $1
       AND updated_at > now() - ($2 || ' minutes')::interval`,
    [eventUuid, String(GUIDE_LOC_MAX_AGE_MIN)],
  );
  return rows[0] ?? null;
}

/** Distancia en metros entre dos coordenadas (haversine). */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface ProximityResult {
  ok: boolean;
  // 'near' | 'no_guide_loc' (guía sin ubicación fresca → fail-open)
  // | 'no_coords' (pasajero no compartió GPS → fail-open) | 'too_far'
  reason: 'near' | 'no_guide_loc' | 'no_coords' | 'too_far';
  distance_m?: number;
}

/**
 * Valida la cercanía del pasajero al guía. Fail-open: si el guía todavía no
 * reportó ubicación fresca, o el pasajero no comparte GPS, deja pasar (no
 * trabamos a nadie por una señal faltante). Solo rechaza si hay ambas y está
 * lejos del radio.
 */
export async function checkProximity(params: {
  eventUuid: string;
  lat?: number | null;
  lng?: number | null;
  radiusM?: number;
}): Promise<ProximityResult> {
  const { eventUuid } = params;
  if (
    typeof params.lat !== 'number' ||
    typeof params.lng !== 'number' ||
    Number.isNaN(params.lat) ||
    Number.isNaN(params.lng)
  ) {
    return { ok: true, reason: 'no_coords' };
  }
  const guide = await getFreshGuideLocation(eventUuid);
  if (!guide) return { ok: true, reason: 'no_guide_loc' };
  const dist = distanceMeters(params.lat, params.lng, guide.lat, guide.lng);
  const radius = params.radiusM ?? DEFAULT_RADIUS_M;
  return dist <= radius
    ? { ok: true, reason: 'near', distance_m: Math.round(dist) }
    : { ok: false, reason: 'too_far', distance_m: Math.round(dist) };
}

// --- Punto 2: ticket + vigencia por día + revocación ---

/** Crea el ticket del evento en el Rust si el usuario no tiene uno. */
export async function ensureTicket(
  eventUuid: string,
  userUuid: string,
): Promise<void> {
  const has = await query(
    'SELECT 1 FROM public.tickets WHERE event_uuid = $1 AND tourist_uuid = $2 LIMIT 1',
    [eventUuid, userUuid],
  );
  if (has.length > 0) return;
  for (let i = 0; i < 6; i++) {
    const tcode = genCode(8);
    try {
      await query(
        `INSERT INTO public.tickets (uuid, event_uuid, tourist_uuid, code, shareable, shared)
         VALUES (gen_random_uuid(), $1, $2, $3, false, false)`,
        [eventUuid, userUuid, tcode],
      );
      return;
    } catch (e) {
      if (i === 5) throw e;
    }
  }
}

/** Registra/renueva el acceso guiado del usuario a un evento, vigente ese día. */
export async function grantGuidedAccess(params: {
  eventUuid: string;
  userUuid: string;
  validDate: string;
}): Promise<void> {
  await query(
    `INSERT INTO ext.guided_access (event_uuid, user_uuid, valid_date, granted_at, revoked_at)
     VALUES ($1, $2, $3, now(), NULL)
     ON CONFLICT (event_uuid, user_uuid) DO UPDATE SET
       valid_date = $3, granted_at = now(), revoked_at = NULL`,
    [params.eventUuid, params.userUuid, params.validDate],
  );
}

export interface AccessStatus {
  allowed: boolean;
  // 'ok' | 'none' (nunca se sumó) | 'revoked' (el guía cortó) | 'expired' (no es hoy)
  reason: 'ok' | 'none' | 'revoked' | 'expired';
}

/**
 * Estado del acceso guiado de un usuario a un evento: permitido solo si se sumó,
 * el guía no lo revocó y la vigencia (valid_date) es HOY en la zona del operador.
 */
export async function getGuidedAccessStatus(
  eventUuid: string,
  userUuid: string,
): Promise<AccessStatus> {
  const rows = await query<{ revoked: boolean; is_today: boolean }>(
    `SELECT (revoked_at IS NOT NULL) AS revoked,
            (valid_date = (now() AT TIME ZONE $3)::date) AS is_today
     FROM ext.guided_access
     WHERE event_uuid = $1 AND user_uuid = $2`,
    [eventUuid, userUuid, TOUR_TZ],
  );
  if (rows.length === 0) return { allowed: false, reason: 'none' };
  if (rows[0].revoked) return { allowed: false, reason: 'revoked' };
  if (!rows[0].is_today) return { allowed: false, reason: 'expired' };
  return { allowed: true, reason: 'ok' };
}

/** El guía corta TODOS los accesos activos del evento. Devuelve cuántos cortó. */
export async function revokeEventAccesses(eventUuid: string): Promise<number> {
  const rows = await query<{ event_uuid: string }>(
    `UPDATE ext.guided_access SET revoked_at = now()
     WHERE event_uuid = $1 AND revoked_at IS NULL
     RETURNING event_uuid`,
    [eventUuid],
  );
  return rows.length;
}

/** Verifica que el guía autenticado esté asignado a ese evento (en el Rust). */
export async function guideOwnsEvent(
  eventUuid: string,
  guideUuid: string,
): Promise<boolean> {
  const rows = await query(
    `SELECT 1 FROM public.event_tour_guides
     WHERE event_uuid = $1 AND tour_guide_uuid = $2 LIMIT 1`,
    [eventUuid, guideUuid],
  );
  return rows.length > 0;
}
