-- Migracion 001: Pagos.
-- Todo lo nuevo vive en el schema `ext`, en la MISMA base del backend Rust.
-- NO se tocan los objetos del Rust. No usamos foreign keys fisicas hacia su
-- schema (solo referencias logicas por uuid).

CREATE SCHEMA IF NOT EXISTS ext;

-- Tours de pago: define que tours se compran y a que precio.
-- `tour_uuid` referencia logicamente a un tour del backend Rust.
CREATE TABLE IF NOT EXISTS ext.paid_tours (
  uuid         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_uuid    uuid NOT NULL UNIQUE,
  title        text NOT NULL,
  description  text,
  price_cents  integer NOT NULL CHECK (price_cents >= 0),
  currency     text NOT NULL DEFAULT 'usd',
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Acceso a un tour, otorgado al concretarse una compra (o manualmente).
CREATE TABLE IF NOT EXISTS ext.tour_access (
  uuid                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid                  uuid NOT NULL,
  tour_uuid                  uuid NOT NULL,
  source                     text NOT NULL DEFAULT 'purchase',
  stripe_payment_intent_id   text,
  granted_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_uuid, tour_uuid)
);

CREATE INDEX IF NOT EXISTS idx_tour_access_user ON ext.tour_access (user_uuid);
CREATE INDEX IF NOT EXISTS idx_tour_access_tour ON ext.tour_access (tour_uuid);
