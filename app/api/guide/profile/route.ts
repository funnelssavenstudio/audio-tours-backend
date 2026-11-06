import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { getGuideProfile, upsertGuideProfile } from '@/lib/guide';
import type { GuideProfileInput } from '@/lib/guide';

export const runtime = 'nodejs';

// El guia autenticado consulta su propio perfil (incluye el flag `visible`).
export const GET = withRole('tour_guide', async (_request, user) => {
  const profile = await getGuideProfile(user.uuid);
  return NextResponse.json({ profile });
});

// El guia autenticado crea o edita su propio perfil. Solo rol `tour_guide`.
// El user_uuid lo toma del token, no del body (no se puede editar a otro).
export const PUT = withRole('tour_guide', async (request, user) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 });
  }

  const input: GuideProfileInput = {};

  if ('bio' in body) {
    input.bio = typeof body.bio === 'string' ? body.bio : null;
  }
  if ('photo_media_uuid' in body) {
    input.photo_media_uuid =
      typeof body.photo_media_uuid === 'string' ? body.photo_media_uuid : null;
  }
  if ('visible' in body) {
    if (typeof body.visible !== 'boolean') {
      return NextResponse.json(
        { error: '`visible` debe ser booleano.' },
        { status: 400 },
      );
    }
    input.visible = body.visible;
  }
  if ('languages' in body) {
    if (
      !Array.isArray(body.languages) ||
      !body.languages.every((item) => typeof item === 'string')
    ) {
      return NextResponse.json(
        { error: '`languages` debe ser una lista de codigos de idioma.' },
        { status: 400 },
      );
    }
    input.languages = body.languages as string[];
  }

  try {
    const profile = await upsertGuideProfile(user.uuid, input);
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json(
      { error: 'No se pudo guardar el perfil.' },
      { status: 500 },
    );
  }
});
