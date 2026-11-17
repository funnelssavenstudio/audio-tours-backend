import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { listEventAlerts } from '@/lib/alerts';

export const runtime = 'nodejs';

// Alertas con IA del chat de un evento, para el panel del guia. Solo rol
// tour_guide y solo de eventos que tiene asignados.
export const GET = withRole('tour_guide', async (_request, user, context) => {
  const { event_uuid: eventUuid } = await context.params;
  const alerts = await listEventAlerts(eventUuid, user.uuid);
  if (alerts === null) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }
  return NextResponse.json({ list: alerts });
});
