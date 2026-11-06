import Stripe from 'stripe';

let client: Stripe | undefined;

/** Cliente de Stripe. Usa STRIPE_SECRET_KEY (de test en desarrollo). */
export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('Falta la variable de entorno STRIPE_SECRET_KEY.');
    }
    client = new Stripe(key);
  }
  return client;
}
