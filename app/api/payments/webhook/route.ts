import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';

import { grantAccess } from '@/lib/payments';
import { getStripe } from '@/lib/stripe';

// Stripe y pg necesitan el runtime Node (no Edge). Es el default en App Router,
// pero lo dejamos explicito para que Vercel no lo cambie.
export const runtime = 'nodejs';

// Webhook de Stripe. Al confirmarse el pago, otorga acceso al tour.
// Stripe lo llama directamente; se valida por firma, no por login.
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Webhook no configurado.' },
      { status: 500 },
    );
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Falta la firma.' }, { status: 400 });
  }

  // El body crudo es necesario para verificar la firma.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: 'Firma invalida.' }, { status: 400 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const userUuid = intent.metadata?.user_uuid;
    const tourUuid = intent.metadata?.tour_uuid;
    if (userUuid && tourUuid) {
      await grantAccess({
        userUuid,
        tourUuid,
        paymentIntentId: intent.id,
      });
    }
  }

  return NextResponse.json({ received: true });
}
