import { NextResponse } from 'next/server';

import { withAuth } from '@/lib/auth';
import { getPaidTour, hasAccess } from '@/lib/payments';
import { getStripe } from '@/lib/stripe';

// Crea una intencion de pago (PaymentIntent) para comprar un tour de pago.
// La app usa el client_secret devuelto para abrir la hoja de pago de Stripe.
export const POST = withAuth(async (request, user) => {
  let body: { tour_uuid?: string };
  try {
    body = (await request.json()) as { tour_uuid?: string };
  } catch {
    return NextResponse.json({ error: 'Cuerpo invalido.' }, { status: 400 });
  }

  const tourUuid = body.tour_uuid;
  if (!tourUuid) {
    return NextResponse.json({ error: 'Falta tour_uuid.' }, { status: 400 });
  }

  const tour = await getPaidTour(tourUuid);
  if (!tour) {
    return NextResponse.json(
      { error: 'Tour de pago no encontrado.' },
      { status: 404 },
    );
  }

  if (await hasAccess(user.uuid, tourUuid)) {
    return NextResponse.json(
      { error: 'Ya tenes acceso a este tour.' },
      { status: 409 },
    );
  }

  const intent = await getStripe().paymentIntents.create({
    amount: tour.price_cents,
    currency: tour.currency,
    automatic_payment_methods: { enabled: true },
    metadata: {
      user_uuid: user.uuid,
      tour_uuid: tourUuid,
    },
  });

  return NextResponse.json({
    client_secret: intent.client_secret,
    publishable_key: process.env.STRIPE_PUBLISHABLE_KEY ?? '',
    amount: tour.price_cents,
    currency: tour.currency,
    title: tour.title,
  });
});
