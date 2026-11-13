import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { guideOwnsEvent, upsertGuideLocation } from '@/lib/guidedAccess';

export const runtime = 'nodejs';

// Punto 3: el guía reporta su ubicación actual para el evento. La usamos para
// validar que el pasajero esté cerca al activar. Body: { lat, lng }.
export const POST = withRole('tour_guide', async (request, user, context) => {
  const { event_uuid: eventUuid } = await context.params;
  if (!eventUuid) {
    return NextResponse.json({ error: 'Falta el evento.' }, { status: 400 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 });
  }
  const lat = body.lat;
  const lng = body.lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json(
      { error: 'Faltan coordenadas validas (lat, lng).' },
      { status: 400 },
    );
  }
  if (!(await guideOwnsEvent(eventUuid, user.uuid))) {
    return NextResponse.json(
      { error: 'No sos el guia de esta excursion.' },
      { status: 403 },
    );
  }
  await upsertGuideLocation({ eventUuid, guideUuid: user.uuid, lat, lng });
  return NextResponse.json({ ok: true });
});
