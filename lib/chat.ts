import { query } from '@/lib/db';
import { sendPushToUsers } from '@/lib/push';
import { translateMessage } from '@/lib/translate';

/**
 * UUIDs de los miembros del evento (guias + turistas con ticket o checkin).
 * Se usa para mandar la notificacion push del chat a todos menos el emisor.
 */
export async function getEventMemberUuids(eventUuid: string): Promise<string[]> {
  const rows = await query<{ uuid: string }>(
    `SELECT tour_guide_uuid AS uuid FROM public.event_tour_guides WHERE event_uuid = $1
     UNION
     SELECT tourist_uuid AS uuid FROM public.tickets WHERE event_uuid = $1
     UNION
     SELECT tourist_uuid AS uuid FROM public.event_checkins WHERE event_uuid = $1`,
    [eventUuid],
  );
  return rows.map((r) => r.uuid).filter(Boolean);
}

export interface ChatMessage {
  uuid: string;
  sender_user_uuid: string;
  sender_role: string;
  // Texto resuelto al idioma pedido (o el original si no hay traduccion).
  text: string;
  original_text: string;
  original_language_code: string;
  created_at: string;
  // Editado/borrado (estilo WhatsApp). `edited` es true si se modifico; `deleted`
  // true si el remitente (o un guia/admin) lo borro: el cliente muestra
  // "Mensaje eliminado" en vez del texto.
  edited: boolean;
  deleted: boolean;
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
               created_at,
               (edited_at IS NOT NULL) AS edited,
               (deleted_at IS NOT NULL) AS deleted`,
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
  await cacheMessageTranslations(msg.uuid, msg.text, msg.original_language_code);
  // Notificacion push a los demas miembros del evento (menos el emisor). Es
  // best-effort: no bloquea el envio ni lo hace fallar si push no esta activo.
  void notifyChatMessage(params.eventUuid, params.senderUserUuid, msg.text);
  return msg;
}

/** Manda la push del chat a los miembros del evento, menos el emisor. */
async function notifyChatMessage(
  eventUuid: string,
  senderUuid: string,
  text: string,
): Promise<void> {
  try {
    const members = await getEventMemberUuids(eventUuid);
    const targets = members.filter((u) => u !== senderUuid);
    if (targets.length === 0) return;
    const body = text.length > 140 ? text.slice(0, 137) + '...' : text;
    await sendPushToUsers(targets, {
      title: 'Nuevo mensaje en el chat',
      body,
      data: { type: 'chat', event_uuid: eventUuid },
    });
  } catch (e) {
    console.error('[notifyChatMessage] error:', e);
  }
}

/**
 * (Re)cachea las traducciones de un mensaje: borra las que hubiera (importante
 * al EDITAR, para no dejar traducciones viejas) y vuelve a traducir + guardar.
 * Si la traduccion falla, no rompe la operacion principal (el mensaje ya quedo
 * guardado); el historial caera al texto original hasta que se pueda traducir.
 */
async function cacheMessageTranslations(
  messageUuid: string,
  text: string,
  sourceLang: string,
): Promise<void> {
  try {
    await query(
      `DELETE FROM ext.chat_message_translation WHERE message_uuid = $1`,
      [messageUuid],
    );
    const map = await translateMessage(text, sourceLang);
    for (const [lang, txt] of Object.entries(map)) {
      if (lang === sourceLang) continue;
      await query(
        `INSERT INTO ext.chat_message_translation
           (message_uuid, language_code, translated_text)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_uuid, language_code) DO UPDATE
           SET translated_text = EXCLUDED.translated_text`,
        [messageUuid, lang, txt],
      );
    }
  } catch (e) {
    console.error('[cacheMessageTranslations] translate error:', e);
  }
}

/**
 * Edita un mensaje. Solo el autor puede editar su propio mensaje, y no se puede
 * editar uno ya borrado. Cambia el texto/idioma, marca edited_at y re-traduce.
 * Devuelve el mensaje actualizado (texto en su idioma original).
 */
export async function editMessage(params: {
  messageUuid: string;
  userUuid: string;
  text: string;
  languageCode: string;
}): Promise<ChatMessage> {
  const rows = await query<ChatMessage>(
    `UPDATE ext.chat_message
       SET original_text = $3,
           original_language_code = $4,
           edited_at = now()
     WHERE uuid = $1
       AND sender_user_uuid = $2
       AND deleted_at IS NULL
     RETURNING uuid, sender_user_uuid, sender_role,
               original_text AS text, original_text, original_language_code,
               created_at,
               (edited_at IS NOT NULL) AS edited,
               (deleted_at IS NOT NULL) AS deleted`,
    [params.messageUuid, params.userUuid, params.text, params.languageCode],
  );
  if (rows.length === 0) {
    throw new Error('No se puede editar este mensaje.');
  }
  const msg = rows[0];
  await cacheMessageTranslations(msg.uuid, msg.text, msg.original_language_code);
  return msg;
}

/**
 * Borra (soft-delete) un mensaje. Puede borrarlo el autor, o un guia/admin
 * (moderacion). El mensaje queda en la base con deleted_at y el cliente muestra
 * "Mensaje eliminado". Se limpian sus traducciones. Devuelve el uuid borrado.
 */
export async function deleteMessage(params: {
  messageUuid: string;
  userUuid: string;
  canModerate: boolean;
}): Promise<string> {
  const rows = await query<{ uuid: string }>(
    `UPDATE ext.chat_message
       SET deleted_at = now()
     WHERE uuid = $1
       AND deleted_at IS NULL
       AND ($3 = true OR sender_user_uuid = $2)
     RETURNING uuid`,
    [params.messageUuid, params.userUuid, params.canModerate],
  );
  if (rows.length === 0) {
    throw new Error('No se puede borrar este mensaje.');
  }
  await query(
    `DELETE FROM ext.chat_message_translation WHERE message_uuid = $1`,
    [params.messageUuid],
  );
  return rows[0].uuid;
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
            CASE WHEN m.deleted_at IS NOT NULL THEN ''
                 ELSE COALESCE(t.translated_text, m.original_text) END AS text,
            CASE WHEN m.deleted_at IS NOT NULL THEN '' ELSE m.original_text END
              AS original_text,
            m.original_language_code,
            m.created_at,
            (m.edited_at IS NOT NULL) AS edited,
            (m.deleted_at IS NOT NULL) AS deleted
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
