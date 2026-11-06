import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { setGuidePhoto } from '@/lib/guide';

export const runtime = 'nodejs';

// Limite razonable para una foto de perfil. Si se supera, devolvemos 413.
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png']);

// El guia autenticado sube (o reemplaza) su foto de perfil. Solo rol
// `tour_guide`. El body es la imagen cruda; el tipo viene en el Content-Type.
// El user_uuid lo toma del token, no del body (no se puede editar a otro).
export const PUT = withRole('tour_guide', async (request, user) => {
  const contentType = (request.headers.get('content-type') ?? '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json(
      { error: 'Formato no permitido. Usa una imagen JPEG o PNG.' },
      { status: 400 },
    );
  }

  const arrayBuffer = await request.arrayBuffer();

  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json(
      { error: 'La imagen esta vacia.' },
      { status: 400 },
    );
  }
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: 'La imagen supera el limite de 5 MB.' },
      { status: 413 },
    );
  }

  try {
    await setGuidePhoto(user.uuid, contentType, Buffer.from(arrayBuffer));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'No se pudo guardar la foto.' },
      { status: 500 },
    );
  }
});
