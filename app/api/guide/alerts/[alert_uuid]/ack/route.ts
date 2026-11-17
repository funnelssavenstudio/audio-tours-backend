import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { ackAlert } from '@/lib/alerts';

export const runtime = 'nodejs';

// Marca una alerta como resuelta ("Resuelto" en el panel del guia). Solo el
// guia dueno del evento de la alerta.
export const POST = withRole('tour_guide', async (_request, user, context) => {
  const { alert_uuid: alertUuid } = await context.params;
  const ok = await ackAlert(alertUuid, user.uuid);
  if (!ok) {
    return NextResponse.json({ error: 'No encontrada.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
});
