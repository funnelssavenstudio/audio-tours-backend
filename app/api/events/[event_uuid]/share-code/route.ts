import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { getOrCreateShareCode } from '@/lib/eventAccess';

export const runtime = 'nodejs';

// Codigo compartido (QR) del tour. Lo usa el guia para mostrarlo en el punto de
// encuentro; todos los pasajeros escanean el mismo. Se crea si no existe.
export const GET = withRole('tour_guide', async (_request, _user, context) => {
  const { event_uuid: eventUuid } = await context.params;
  if (!eventUuid) {
    return NextResponse.json({ error: 'Falta el evento.' }, { status: 400 });
  }
  const code = await getOrCreateShareCode(eventUuid);
  return NextResponse.json({ event_uuid: eventUuid, code });
});
