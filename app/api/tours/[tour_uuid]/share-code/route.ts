import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { getOrCreateTourShareCode } from '@/lib/guidedAccess';

export const runtime = 'nodejs';

// Punto 1: QR PERMANENTE por tour. El guía lo muestra/imprime una vez y lo usa
// en todas las excursiones; todos los pasajeros escanean el mismo. Se crea si no
// existe.
export const GET = withRole('tour_guide', async (_request, _user, context) => {
  const { tour_uuid: tourUuid } = await context.params;
  if (!tourUuid) {
    return NextResponse.json({ error: 'Falta el tour.' }, { status: 400 });
  }
  const code = await getOrCreateTourShareCode(tourUuid);
  return NextResponse.json({ tour_uuid: tourUuid, code });
});
