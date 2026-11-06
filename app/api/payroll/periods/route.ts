import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { createPeriod, listPeriods } from '@/lib/payroll';

export const runtime = 'nodejs';

// Lista las quincenas (periodos de liquidacion), mas recientes primero (admin).
export const GET = withRole('administrator', async () => {
  const periods = await listPeriods();
  return NextResponse.json({ list: periods });
});

// Crea una quincena (periodo de liquidacion) (admin).
export const POST = withRole('administrator', async (request) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 });
  }

  const startDate = body.start_date;
  const endDate = body.end_date;
  if (typeof startDate !== 'string' || typeof endDate !== 'string') {
    return NextResponse.json(
      { error: 'Faltan start_date y end_date (YYYY-MM-DD).' },
      { status: 400 },
    );
  }

  try {
    const period = await createPeriod(startDate, endDate);
    return NextResponse.json({ period });
  } catch {
    return NextResponse.json(
      { error: 'No se pudo crear el periodo (revisa las fechas).' },
      { status: 400 },
    );
  }
});
