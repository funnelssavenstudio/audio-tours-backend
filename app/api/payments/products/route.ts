import { NextResponse } from 'next/server';

import { listPaidTours } from '@/lib/payments';

// Lista los tours de pago disponibles (publico).
export async function GET() {
  try {
    const list = await listPaidTours();
    return NextResponse.json({ list });
  } catch {
    return NextResponse.json(
      { error: 'No se pudieron obtener los tours de pago.' },
      { status: 500 },
    );
  }
}
