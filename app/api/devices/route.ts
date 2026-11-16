import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

// Registra (o refresca) el token de notificaciones push del dispositivo del
// usuario. La app lo llama al obtener el token de APNs (tras dar permiso).
export const POST = withAuth(async (request, user) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 });
  }
  const token = body.token;
  if (typeof token !== 'string' || token.trim().length === 0) {
    return NextResponse.json({ error: 'Falta el token.' }, { status: 400 });
  }
  const platform =
    typeof body.platform === 'string' ? body.platform : 'ios';
  try {
    await query(
      `INSERT INTO ext.device_token (user_uuid, token, platform)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_uuid, token)
       DO UPDATE SET platform = EXCLUDED.platform, updated_at = now()`,
      [user.uuid, token.trim(), platform],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo registrar.' },
      { status: 400 },
    );
  }
});

// Baja el token (al cerrar sesion o desactivar notificaciones).
export const DELETE = withAuth(async (request, user) => {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Falta el token.' }, { status: 400 });
  }
  try {
    await query(
      `DELETE FROM ext.device_token WHERE user_uuid = $1 AND token = $2`,
      [user.uuid, token],
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo borrar.' },
      { status: 400 },
    );
  }
});
