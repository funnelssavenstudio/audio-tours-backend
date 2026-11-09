import { query } from '@/lib/db';
import { translateMessage } from '@/lib/translate';

export interface ChatMessage {
  uuid: string;
  sender_user_uuid: string;
  sender_role: string;
  // Texto resuelto al idioma pedido (o el original si no hay traduccion).
  text: string;
  original_text: string;
  original_language_code: string;
  created_at: string;
}

/**
 * Resumen de una sala de chat para el listado del panel admin. Una sala por
 * evento. El titulo del tour es best-effort (puede venir null). El ultimo
 * mensaje viene null si la sala todavia no tiene mensajes.
 */
export interface ChatRoomSummary {
  event_uuid: string;
  status: string;
  // Titulo del tour del evento (best-effort via public.events + tour_translations).
  tour_title: string | null;
  // Cantidad de mensajes en la sala.
  message_count: number;
  // Fecha y texto del ultimo mensaje (null si no hay mensajes).
  last_message_at: string | null;
  last_message_text: string | null;
}

/** Asegura (crea si no existe) la sala del evento y devuelve su uuid y estado. */
export async function ensureRoom(
  eventUuid: string,
): Promise<{ uuid: string; status: string }> {
  const rows = await query<{ uuid: string; status: string }>(
    `INSERT INTO ext.chat_room (event_uuid) VALUES ($1)
     ON CONFLICT (event_uuid) DO UPDATE SET updated_at = now()
     RETURNING uuid, status`,
    [eventUuid],
  );
  return rows[0];
}

/** Marca la sala del evento como cerrada (al terminar el tour). */
export async function closeRoom(eventUuid: string): Promise<void> {
  await query(
    `UPDATE ext.chat_room SET status = 'closed', updated_at = now()
     WHERE event_uuid = $1`,
    [eventUuid],
  );
}

/**
 * Persiste un mensaje en la sala del evento. Crea la sala si no existe.
 * Rechaza si la sala esta cerrada. La traduccion/entrega en vivo es aparte.
 */
export async function postMessage(params: {
  eventUuid: string;
  senderUserUuid: string;
  senderRole: string;
  text: string;
  languageCode: string;
}): Promise<ChatMessage> {
  const room = await ensureRoom(params.eventUuid);
  if (room.status === 'closed') {
    throw new Error('La sala de chat esta cerrada.');
  }

  const rows = await query<ChatMessage>(
    `INSERT INTO ext.chat_message
       (room_uuid, sender_user_uuid, sender_role, original_text, original_language_code)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING uuid, sender_user_uuid, sender_role,
               original_text AS text, original_text, original_language_code,
               created_at`,
    [
      room.uuid,
      params.senderUserUuid,
      params.senderRole,
      params.text,
      params.languageCode,
    ],
  );
  const msg = rows[0];
  // Traduce el mensaje a los idiomas destino y cachea (para que el historial
  // le llegue a cada turista en su idioma). Si falla, el post igual se guarda.
  try {
    const map = await translateMessage(msg.text, msg.original_language_code);
    for (const [lang, txt] of Object.entries(map)) {
      if (lang === msg.original_language_code) continue;
      await query(
        `INSERT INTO ext.chat_message_translation
           (message_uuid, language_code, translated_text)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_uuid, language_code) DO NOTHING`,
        [msg.uuid, lang, txt],
      );
    }
  } catch (e) {
    console.error('[postMessage] translate error:', e);
  }
  return msg;
}

/**
 * Historial de la sala del evento, cada mensaje resuelto al idioma `lang`
 * (usa la traduccion cacheada si existe; si no, el texto original). Mientras no
 * haya servicio de traduccion, siempre devuelve el original.
 */
export async function listMessages(
  eventUuid: string,
  lang: string,
): Promise<ChatMessage[]> {
  return query<ChatMessage>(
    `SELECT m.uuid,
            m.sender_user_uuid,
            m.sender_role,
            COALESCE(t.translated_text, m.original_text) AS text,
            m.original_text,
            m.original_language_code,
            m.created_at
     FROM ext.chat_message m
     JOIN ext.chat_room r ON r.uuid = m.room_uuid
     LEFT JOIN ext.chat_message_translation t
       ON t.message_uuid = m.uuid AND t.language_code = $2
     WHERE r.event_uuid = $1
     ORDER BY m.created_at ASC`,
    [eventUuid, lang],
  );
}

/**
 * Hilo de mensajes de la sala del evento para el panel admin. Reusa
 * listMessages (que ya resuelve texto, sender_role y created_at); para el panel
 * alcanza con el texto original + su idioma, que listMessages ya devuelve en
 * original_text/original_language_code. No duplicamos logica.
 */
export async function getRoomMessages(
  eventUuid: string,
  lang = 'es',
): Promise<ChatMessage[]> {
  return listMessages(eventUuid, lang);
}

/**
 * Lista todas las salas de chat (una por evento) para el panel admin, con el
 * conteo de mensajes, la fecha y el texto del ultimo mensaje, y el titulo del
 * tour del evento (best-effort, idioma 'es' preferido con fallback a cualquier
 * traduccion disponible). Ordena por el ultimo mensaje mas reciente primero;
 * las salas sin mensajes quedan al final con last_message null.
 */
export async function listRooms(): Promise<ChatRoomSummary[]> {
  // Subqueries escalares simples (mismo patron probado que listGuideEvents en
  // lib/guide.ts). El titulo del tour se toma de cualquier traduccion (ordenada
  // por created_at); no se filtra por idioma para no depender de columnas no
  // confirmadas del schema del Rust.
  return query<ChatRoomSummary>(
    `SELECT r.event_uuid,
            r.status,
            (SELECT COUNT(*)::int FROM ext.chat_message m
              WHERE m.room_uuid = r.uuid) AS message_count,
            (SELECT MAX(m.created_at) FROM ext.chat_message m
              WHERE m.room_uuid = r.uuid) AS last_message_at,
            (SELECT m.original_text FROM ext.chat_message m
              WHERE m.room_uuid = r.uuid
              ORDER BY m.created_at DESC LIMIT 1) AS last_message_text,
            (SELECT tt.title FROM public.events e
              JOIN public.tour_translations tt ON tt.tour_uuid = e.tour_uuid
              WHERE e.uuid = r.event_uuid
              ORDER BY tt.created_at LIMIT 1) AS tour_title
     FROM ext.chat_room r
     ORDER BY last_message_at DESC NULLS LAST, r.created_at DESC`,
  );
}
