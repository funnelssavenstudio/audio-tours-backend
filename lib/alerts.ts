import { query } from '@/lib/db';

// Alertas con IA sobre el chat (SEM08). La deteccion y la escritura las hace el
// realtime (src/alerts.ts); aca el backend solo LEE para el panel del guia y
// permite marcarlas como resueltas. Seguridad: el guia solo ve/toca alertas de
// eventos que tiene asignados (public.event_tour_guides).

export interface ChatAlert {
  uuid: string;
  event_uuid: string;
  type: string; // 'queja' | 'perdido'
  severity: string; // 'low' | 'med' | 'high'
  summary: string;
  acknowledged: boolean;
  created_at: string;
}

async function guideOwnsEvent(eventUuid: string, userUuid: string): Promise<boolean> {
  const rows = await query<{ x: number }>(
    `SELECT 1 AS x FROM public.event_tour_guides
     WHERE event_uuid = $1 AND tour_guide_uuid = $2 LIMIT 1`,
    [eventUuid, userUuid],
  );
  return rows.length > 0;
}

/**
 * Alertas de un evento para el panel del guia. Devuelve null si el guia no es
 * dueno del evento (para responder 403). Primero las no resueltas, mas nuevas
 * arriba.
 */
export async function listEventAlerts(
  eventUuid: string,
  userUuid: string,
): Promise<ChatAlert[] | null> {
  if (!(await guideOwnsEvent(eventUuid, userUuid))) return null;
  return query<ChatAlert>(
    `SELECT uuid, event_uuid, type, severity, summary, acknowledged, created_at
     FROM ext.chat_alert
     WHERE event_uuid = $1
     ORDER BY acknowledged ASC, created_at DESC
     LIMIT 100`,
    [eventUuid],
  );
}

/**
 * Marca una alerta como resuelta (acknowledged). Solo si pertenece a un evento
 * del guia. Devuelve true si la actualizo.
 */
export async function ackAlert(alertUuid: string, userUuid: string): Promise<boolean> {
  const rows = await query<{ x: number }>(
    `UPDATE ext.chat_alert a
       SET acknowledged = true, acknowledged_at = now()
     FROM public.event_tour_guides g
     WHERE a.uuid = $1
       AND g.event_uuid = a.event_uuid
       AND g.tour_guide_uuid = $2
     RETURNING 1 AS x`,
    [alertUuid, userUuid],
  );
  return rows.length > 0;
}
