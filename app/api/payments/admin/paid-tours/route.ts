import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { adminListPaidTours, createPaidTour } from '@/lib/payments';

export const runtime = 'nodejs';

// Lista todos los tours de pago (activos e inactivos), ordenados por titulo
// (admin).
export const GET = withRole('administrator', async () => {
  const list = await adminListPaidTours();
  return NextResponse.json({ list });
});

// Crea un tour de pago (admin). Body: { tour_uuid, title, price_cents,
// description?, currency?, active? }. Los montos van en centavos.
export const POST = withRole('administrator', async (request) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 });
  }

  const tourUuid = body.tour_uuid;
  const title = body.title;
  const priceCents = body.price_cents;

  if (typeof tourUuid !== 'string' || tourUuid.length === 0) {
    return NextResponse.json(
      { error: 'Falta tour_uuid.' },
      { status: 400 },
    );
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'Falta title.' }, { status: 400 });
  }
  if (typeof priceCents !== 'number' || !Number.isFinite(priceCents) || priceCents < 0) {
    return NextResponse.json(
      { error: 'price_cents debe ser un numero mayor o igual a 0.' },
      { status: 400 },
    );
  }

  const description =
    typeof body.description === 'string' ? body.description : undefined;
  const currency =
    typeof body.currency === 'string' ? body.currency : undefined;
  const active = typeof body.active === 'boolean' ? body.active : undefined;

  const paidTour = await createPaidTour({
    tourUuid,
    title: title.trim(),
    description,
    priceCents,
    currency,
    active,
  });

  // null = ya existe un tour de pago para ese tour_uuid (duplicado).
  if (!paidTour) {
    return NextResponse.json(
      { error: 'Ya existe un tour de pago para ese tour.' },
      { status: 409 },
    );
  }

  return NextResponse.json({ paid_tour: paidTour });
});
