import { NextResponse } from 'next/server';

import { userHasRole, withAuth } from '@/lib/auth';
import { deleteMessage, editMessage } from '@/lib/chat';

export const runtime = 'nodejs';

// Edita un mensaje del chat. Solo el autor puede editar su propio mensaje
// (editMessage valida sender_user_uuid). Re-traduce el texto nuevo.
export const PATCH = withAuth(async (request, user, context) => {
  const { message_uuid: messageUuid } = await context.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 });
  }

  const text = body.text;
  if (typeof text !== 'string' || text.trim().length === 0) {
    return NextResponse.json({ error: 'Falta el texto.' }, { status: 400 });
  }
  const languageCode =
    typeof body.language_code === 'string' ? body.language_code : 'es';

  try {
    const message = await editMessage({
      messageUuid,
      userUuid: user.uuid,
      text: text.trim(),
      languageCode,
    });
    return NextResponse.json({ message });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo editar.' },
      { status: 400 },
    );
  }
});

// Borra (soft-delete) un mensaje. Lo puede borrar el autor, o un guia/admin
// (moderacion).
export const DELETE = withAuth(async (_request, user, context) => {
  const { message_uuid: messageUuid } = await context.params;

  const canModerate =
    userHasRole(user, 'administrator') || userHasRole(user, 'tour_guide');

  try {
    const uuid = await deleteMessage({
      messageUuid,
      userUuid: user.uuid,
      canModerate,
    });
    return NextResponse.json({ deleted: uuid });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo borrar.' },
      { status: 400 },
    );
  }
});
