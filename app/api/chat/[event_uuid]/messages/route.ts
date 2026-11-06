import { NextResponse } from 'next/server';

import { userHasRole, withAuth } from '@/lib/auth';
import { listMessages, postMessage } from '@/lib/chat';

export const runtime = 'nodejs';

// Historial del chat del evento, resuelto al idioma ?lang (default es).
// Lo usa la app al entrar y el panel admin para auditar.
export const GET = withAuth(async (request, _user, context) => {
  const { event_uuid: eventUuid } = await context.params;
  const lang = new URL(request.url).searchParams.get('lang') ?? 'es';
  const messages = await listMessages(eventUuid, lang);
  return NextResponse.json({ list: messages });
});

// Envia un mensaje al chat del evento. La traduccion y la entrega en vivo
// (socket) se suman despues; aca se persiste el mensaje.
export const POST = withAuth(async (request, user, context) => {
  const { event_uuid: eventUuid } = await context.params;

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

  // Resolucion del rol del remitente. El panel admin tambien postea por este
  // mismo endpoint (withAuth), asi que contemplamos al administrador: si el
  // usuario es administrator lo marcamos como 'admin'; si es guia, 'tour_guide';
  // en cualquier otro caso, 'tourist'. postMessage ya hace ensureRoom, de modo
  // que un admin puede responder aunque la sala todavia no exista. No se toca
  // el caso guia/turista existente.
  const senderRole = userHasRole(user, 'administrator')
    ? 'admin'
    : userHasRole(user, 'tour_guide')
      ? 'tour_guide'
      : 'tourist';

  try {
    const message = await postMessage({
      eventUuid,
      senderUserUuid: user.uuid,
      senderRole,
      text: text.trim(),
      languageCode,
    });
    return NextResponse.json({ message });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'No se pudo enviar.' },
      { status: 400 },
    );
  }
});
