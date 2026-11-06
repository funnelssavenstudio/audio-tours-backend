import { query } from '@/lib/db';

export interface PaidTour {
  uuid: string;
  tour_uuid: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  active: boolean;
  // Punto de inicio del tour (de public.tours del Rust), para el reproductor
  // autoguiado. Puede ser null si el tour no existe en el Rust.
  pickup_lat: number | null;
  pickup_lng: number | null;
  // Imagen de portada del tour (media uuid de tipo imagen en public.tour_media).
  // La app la baja con /media/{uuid}/download. Null si el tour no tiene imagen.
  image_uuid: string | null;
}

// SELECT comun: suma la ubicacion de inicio (lat/lng) del tour del Rust.
const PAID_TOUR_SELECT = `
  SELECT p.uuid, p.tour_uuid, p.title, p.description, p.price_cents,
         p.currency, p.active,
         ST_Y(t.pickup_location::geometry) AS pickup_lat,
         ST_X(t.pickup_location::geometry) AS pickup_lng,
         img.image_uuid
  FROM ext.paid_tours p
  LEFT JOIN public.tours t ON t.uuid = p.tour_uuid
  LEFT JOIN LATERAL (
    SELECT m.uuid AS image_uuid
    FROM public.tour_media tm
    JOIN public.media m ON m.uuid = tm.media_uuid
    WHERE tm.tour_uuid = p.tour_uuid
      AND m.filetype = 'image'
      AND m.active = true
    ORDER BY m.created_at
    LIMIT 1
  ) img ON true`;

/** Lista los tours de pago activos. */
export async function listPaidTours(): Promise<PaidTour[]> {
  return query<PaidTour>(
    `${PAID_TOUR_SELECT} WHERE p.active = true ORDER BY p.title`,
  );
}

/** Devuelve un tour de pago activo por su tour_uuid, o null. */
export async function getPaidTour(tourUuid: string): Promise<PaidTour | null> {
  const rows = await query<PaidTour>(
    `${PAID_TOUR_SELECT} WHERE p.tour_uuid = $1 AND p.active = true`,
    [tourUuid],
  );
  return rows[0] ?? null;
}

// --- Administracion de tours de pago ---

/**
 * Lista TODOS los tours de pago (activos e inactivos) para el panel de admin.
 * Ordenados por titulo.
 */
export async function adminListPaidTours(): Promise<PaidTour[]> {
  return query<PaidTour>(`${PAID_TOUR_SELECT} ORDER BY p.title`);
}

/**
 * Crea un tour de pago en ext.paid_tours. La moneda por defecto es 'usd' y
 * active por defecto true. Si ya existe un tour de pago para ese tour_uuid,
 * no inserta nada y devuelve null (para avisar del duplicado). Devuelve el
 * PaidTour creado en caso de exito.
 */
export async function createPaidTour(params: {
  tourUuid: string;
  title: string;
  description?: string | null;
  priceCents: number;
  currency?: string;
  active?: boolean;
}): Promise<PaidTour | null> {
  const inserted = await query<{ uuid: string }>(
    `INSERT INTO ext.paid_tours
       (tour_uuid, title, description, price_cents, currency, active)
     VALUES ($1, $2, $3, $4, COALESCE($5, 'usd'), COALESCE($6, true))
     ON CONFLICT (tour_uuid) DO NOTHING
     RETURNING uuid`,
    [
      params.tourUuid,
      params.title,
      params.description ?? null,
      params.priceCents,
      params.currency ?? null,
      params.active ?? null,
    ],
  );
  // Sin fila devuelta: ya existia un tour de pago para ese tour_uuid.
  if (inserted.length === 0) return null;

  const rows = await query<PaidTour>(
    `${PAID_TOUR_SELECT} WHERE p.tour_uuid = $1`,
    [params.tourUuid],
  );
  return rows[0] ?? null;
}

/**
 * Actualiza un tour de pago por su tour_uuid. Solo cambia los campos que
 * lleguen (COALESCE conserva el valor actual). Devuelve el PaidTour
 * actualizado, o null si no existe.
 */
export async function updatePaidTour(
  tourUuid: string,
  params: {
    title?: string;
    description?: string | null;
    priceCents?: number;
    currency?: string;
    active?: boolean;
  },
): Promise<PaidTour | null> {
  const updated = await query<{ uuid: string }>(
    `UPDATE ext.paid_tours SET
       title = COALESCE($2, title),
       description = COALESCE($3, description),
       price_cents = COALESCE($4, price_cents),
       currency = COALESCE($5, currency),
       active = COALESCE($6, active)
     WHERE tour_uuid = $1
     RETURNING uuid`,
    [
      tourUuid,
      params.title ?? null,
      params.description ?? null,
      params.priceCents ?? null,
      params.currency ?? null,
      params.active ?? null,
    ],
  );
  if (updated.length === 0) return null;

  const rows = await query<PaidTour>(
    `${PAID_TOUR_SELECT} WHERE p.tour_uuid = $1`,
    [tourUuid],
  );
  return rows[0] ?? null;
}

/** Indica si el usuario ya tiene acceso a un tour. */
export async function hasAccess(
  userUuid: string,
  tourUuid: string,
): Promise<boolean> {
  const rows = await query(
    `SELECT 1 FROM ext.tour_access
     WHERE user_uuid = $1 AND tour_uuid = $2
     LIMIT 1`,
    [userUuid, tourUuid],
  );
  return rows.length > 0;
}

/** Otorga acceso a un tour (idempotente). */
export async function grantAccess(params: {
  userUuid: string;
  tourUuid: string;
  paymentIntentId?: string;
  source?: string;
}): Promise<void> {
  await query(
    `INSERT INTO ext.tour_access
       (user_uuid, tour_uuid, source, stripe_payment_intent_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_uuid, tour_uuid) DO NOTHING`,
    [
      params.userUuid,
      params.tourUuid,
      params.source ?? 'purchase',
      params.paymentIntentId ?? null,
    ],
  );
}

/** Lista los tour_uuid a los que el usuario tiene acceso. */
export async function listUserAccess(userUuid: string): Promise<string[]> {
  const rows = await query<{ tour_uuid: string }>(
    'SELECT tour_uuid FROM ext.tour_access WHERE user_uuid = $1',
    [userUuid],
  );
  return rows.map((row) => row.tour_uuid);
}
