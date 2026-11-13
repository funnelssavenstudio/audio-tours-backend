import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth';
import { getGuidedAccessStatus } from '@/lib/guidedAccess';

export const runtime = 'nodejs';

// Punto 2: la app consulta esto antes de reproducir un tour guiado. Permite solo
// si el usuario se sumó, el guía no revocó y la vigencia es HOY.
export const GET = withAuth(async (_request, user, context) => {
  const { event_uuid: eventUuid } = await context.params;
  if (!eventUuid) {
    return NextResponse.json({ error: 'Falta el evento.' }, { status: 400 });
  }
  const status = await getGuidedAccessStatus(eventUuid, user.uuid);
  return NextResponse.json(status);
});
