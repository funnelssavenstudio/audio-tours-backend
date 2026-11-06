import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth';
import { joinEventByCode } from '@/lib/eventAccess';

export const runtime = 'nodejs';

// El pasajero escanea el QR del tour y se suma: con el codigo le creamos el
// acceso (ticket) si todavia no lo tiene. Devuelve el event_uuid.
export const POST = withAuth(async (request, user) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 });
  }
  const code = body.code;
  if (typeof code !== 'string' || code.trim().length === 0) {
    return NextResponse.json({ error: 'Falta el codigo.' }, { status: 400 });
  }
  const eventUuid = await joinEventByCode(code, user.uuid);
  if (!eventUuid) {
    return NextResponse.json(
      { error: 'Codigo no encontrado.' },
      { status: 404 },
    );
  }
  return NextResponse.json({ event_uuid: eventUuid });
});
