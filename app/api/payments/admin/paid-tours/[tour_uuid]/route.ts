import { NextResponse } from 'next/server';

import { withRole } from '@/lib/auth';
import { updatePaidTour } from '@/lib/payments';

export const runtime = 'nodejs';

// Actualiza un tour de pago por su tour_uuid (admin). Body con los campos a
// cambiar: { title?, description?, price_cents?, currency?, active? }. Los
// montos van en centavos. 404 si no existe.
export const PUT = withRole(
  'administrator',
  async (request, _user, context) => {
    const { tour_uuid: tourUuid } = await context.params;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Body invalido.' }, { status: 400 });
    }

    const title =
      typeof body.title === 'string' ? body.title.trim() : undefined;
    const description =
      typeof body.description === 'string' ? body.description : undefined;
    const currency =
      typeof body.currency === 'string' ? body.currency : undefined;
    const active = typeof body.active === 'boolean' ? body.active : undefined;

    let priceCents: number | undefined;
    if (body.price_cents !== undefined) {
      if (
        typeof body.price_cents !== 'number' ||
        !Number.isFinite(body.price_cents) ||
        body.price_cents < 0
      ) {
        return NextResponse.json(
          { error: 'price_cents debe ser un numero mayor o igual a 0.' },
          { status: 400 },
        );
      }
      priceCents = body.price_cents;
    }

    const paidTour = await updatePaidTour(tourUuid, {
      title,
      description,
      priceCents,
      currency,
      active,
    });

    if (!paidTour) {
      return NextResponse.json(
        { error: 'Tour de pago no encontrado.' },
        { status: 404 },
      );
    }

    return NextResponse.json({ paid_tour: paidTour });
  },
);
