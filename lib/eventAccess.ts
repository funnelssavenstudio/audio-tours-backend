import { randomBytes } from 'crypto';

import { query } from '@/lib/db';

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode(len: number): string {
  const b = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return s;
}

/**
 * Devuelve el codigo compartido (QR) del evento, creandolo si no existe. Un
 * unico codigo por tour que todos los pasajeros escanean para sumarse.
 */
export async function getOrCreateShareCode(eventUuid: string): Promise<string> {
  const existing = await query<{ code: string }>(
    'SELECT code FROM ext.event_share_code WHERE event_uuid = $1',
    [eventUuid],
  );
  if (existing[0]) return existing[0].code;

  for (let i = 0; i < 6; i++) {
    const code = genCode(8);
    try {
      const rows = await query<{ code: string }>(
        'INSERT INTO ext.event_share_code (event_uuid, code) VALUES ($1, $2) RETURNING code',
        [eventUuid, code],
      );
      return rows[0].code;
    } catch {
      // Puede ser colision de code (reintentar) o que otro request ya creo el
      // del evento (race): si ya existe, devolvemos ese.
      const again = await query<{ code: string }>(
        'SELECT code FROM ext.event_share_code WHERE event_uuid = $1',
        [eventUuid],
      );
      if (again[0]) return again[0].code;
    }
  }
  throw new Error('No se pudo generar el codigo del tour.');
}

/**
 * Suma al usuario al evento identificado por el codigo compartido: le crea un
 * ticket si todavia no tiene (eso le da acceso al tour en la app). Devuelve el
 * event_uuid, o null si el codigo no existe.
 */
export async function joinEventByCode(
  code: string,
  userUuid: string,
): Promise<string | null> {
  const ev = await query<{ event_uuid: string }>(
    'SELECT event_uuid FROM ext.event_share_code WHERE code = $1',
    [code.trim().toUpperCase()],
  );
  if (!ev[0]) return null;
  const eventUuid = ev[0].event_uuid;

  const has = await query(
    'SELECT 1 FROM public.tickets WHERE event_uuid = $1 AND tourist_uuid = $2 LIMIT 1',
    [eventUuid, userUuid],
  );
  if (has.length === 0) {
    for (let i = 0; i < 6; i++) {
      const tcode = genCode(8);
      try {
        await query(
          `INSERT INTO public.tickets (uuid, event_uuid, tourist_uuid, code, shareable, shared)
           VALUES (gen_random_uuid(), $1, $2, $3, false, false)`,
          [eventUuid, userUuid, tcode],
        );
        break;
      } catch (e) {
        if (i === 5) throw e; // se agoto el reintento por colision de code
      }
    }
  }
  return eventUuid;
}
