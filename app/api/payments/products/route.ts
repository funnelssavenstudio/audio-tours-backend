import { NextResponse } from 'next/server';

import { listPaidTours } from '@/lib/payments';

// Lista los tours de pago disponibles (publico). ?lang= define el idioma del
// titulo/descripcion (el que el usuario eligio en su perfil).
export async function GET(request: Request) {
  try {
    const lang = new URL(request.url).searchParams.get('lang') ?? undefined;
    const list = await listPaidTours(lang);
    return NextResponse.json({ list });
  } catch {
    return NextResponse.json(
      { error: 'No se pudieron obtener los tours de pago.' },
      { status: 500 },
    );
  }
}
