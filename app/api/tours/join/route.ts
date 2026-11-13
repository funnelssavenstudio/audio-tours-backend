import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth';
import {
  checkProximity,
  ensureTicket,
  grantGuidedAccess,
  resolveTodayEventForTour,
  tourUuidByCode,
} from '@/lib/guidedAccess';

export const runtime = 'nodejs';

// Punto 1+2+3: el pasajero escanea el QR PERMANENTE del tour y se suma a la
// excursión de HOY. Valida cercanía al guía (punto 3, fail-open) y registra el
// acceso con vigencia del día (punto 2). Body: { code, lat?, lng? }.
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
  const lat = typeof body.lat === 'number' ? body.lat : null;
  const lng = typeof body.lng === 'number' ? body.lng : null;

  const tourUuid = await tourUuidByCode(code);
  if (!tourUuid) {
    // No es un código de tour: que la app caiga al flujo viejo (evento/ticket).
    return NextResponse.json({ error: 'Codigo no encontrado.' }, { status: 404 });
  }

  const event = await resolveTodayEventForTour(tourUuid);
  if (!event) {
    return NextResponse.json(
      { error: 'Hoy no hay ninguna excursion programada para este tour.' },
      { status: 409 },
    );
  }

  // Punto 3: cercanía al guía (fail-open si falta señal).
  const prox = await checkProximity({ eventUuid: event.uuid, lat, lng });
  if (!prox.ok) {
    return NextResponse.json(
      {
        error: 'Acercate al guia para activar el acceso.',
        reason: prox.reason,
        distance_m: prox.distance_m,
      },
      { status: 403 },
    );
  }

  await ensureTicket(event.uuid, user.uuid);
  await grantGuidedAccess({
    eventUuid: event.uuid,
    userUuid: user.uuid,
    validDate: event.valid_date,
  });

  return NextResponse.json({
    event_uuid: event.uuid,
    tour_uuid: tourUuid,
    valid_date: event.valid_date,
    proximity: prox.reason,
  });
});
