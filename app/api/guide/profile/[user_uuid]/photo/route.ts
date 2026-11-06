import { NextResponse } from 'next/server';

import { getGuidePhoto, getGuideProfile } from '@/lib/guide';

export const runtime = 'nodejs';

// Foto publica del guia, para la pantalla previa del tour ("con quien voy").
// Respeta el mismo gating que el perfil publico: si el guia no se marco como
// visible (o no tiene perfil), devolvemos 404. 404 tambien si no hay foto.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ user_uuid: string }> },
) {
  const { user_uuid: userUuid } = await params;
  try {
    const profile = await getGuideProfile(userUuid);
    if (!profile || !profile.visible) {
      return NextResponse.json(
        { error: 'Foto no encontrada.' },
        { status: 404 },
      );
    }

    const photo = await getGuidePhoto(userUuid);
    if (!photo) {
      return NextResponse.json(
        { error: 'Foto no encontrada.' },
        { status: 404 },
      );
    }

    // Buffer -> Uint8Array para que calce con el tipo de body de NextResponse.
    return new NextResponse(new Uint8Array(photo.bytes), {
      status: 200,
      headers: {
        'Content-Type': photo.content_type,
        'Cache-Control': 'no-cache',
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'No se pudo obtener la foto.' },
      { status: 500 },
    );
  }
}
