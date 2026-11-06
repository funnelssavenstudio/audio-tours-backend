import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { listRates, upsertRate } from '@/lib/payroll';

export const runtime = 'nodejs';

// Lista las tarifas de los guias (admin).
export const GET = withRole('administrator', async () => {
  const rates = await listRates();
  return NextResponse.json({ list: rates });
});

// Crea o actualiza la tarifa de un guia (admin).
export const POST = withRole('administrator', async (request) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 });
  }

  const userUuid = body.user_uuid;
  const amountPerTour = body.amount_per_tour;
  if (typeof userUuid !== 'string' || !userUuid) {
    return NextResponse.json({ error: 'Falta user_uuid.' }, { status: 400 });
  }
  if (typeof amountPerTour !== 'number' || amountPerTour < 0) {
    return NextResponse.json(
      { error: 'amount_per_tour debe ser un numero >= 0 (centavos).' },
      { status: 400 },
    );
  }

  const rate = await upsertRate({
    userUuid,
    amountPerTour: Math.round(amountPerTour),
    currency: typeof body.currency === 'string' ? body.currency : undefined,
    validFrom: typeof body.valid_from === 'string' ? body.valid_from : undefined,
  });
  return NextResponse.json({ rate });
});
