import { NextResponse } from 'next/server';

import { getGuideProfile } from '@/lib/guide';

export const runtime = 'nodejs';

// Perfil publico del guia, para la pantalla previa del tour ("con quien voy").
// Solo se expone si el guia lo marco como visible.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ user_uuid: string }> },
) {
  const { user_uuid: userUuid } = await params;
  try {
    const profile = await getGuideProfile(userUuid);
    if (!profile || !profile.visible) {
      return NextResponse.json(
        { error: 'Perfil no encontrado.' },
        { status: 404 },
      );
    }
    // No exponemos `visible` al turista; es un flag interno del guia.
    return NextResponse.json({
      profile: {
        user_uuid: profile.user_uuid,
        bio: profile.bio,
        photo_media_uuid: profile.photo_media_uuid,
        languages: profile.languages,
      },
    });
  } catch {
    return NextResponse.json(
      { error: 'No se pudo obtener el perfil.' },
      { status: 500 },
    );
  }
}
