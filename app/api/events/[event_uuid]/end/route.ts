import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { guideOwnsEvent, revokeEventAccesses } from '@/lib/guidedAccess';

export const runtime = 'nodejs';

// Punto 2: el guía finaliza la excursión y corta TODOS los accesos activos del
// evento. Solo el guía asignado a ese evento puede hacerlo.
export const POST = withRole('tour_guide', async (_request, user, context) => {
  const { event_uuid: eventUuid } = await context.params;
  if (!eventUuid) {
    return NextResponse.json({ error: 'Falta el evento.' }, { status: 400 });
  }
  if (!(await guideOwnsEvent(eventUuid, user.uuid))) {
    return NextResponse.json(
      { error: 'No sos el guia de esta excursion.' },
      { status: 403 },
    );
  }
  const revoked = await revokeEventAccesses(eventUuid);
  return NextResponse.json({ event_uuid: eventUuid, revoked });
});
