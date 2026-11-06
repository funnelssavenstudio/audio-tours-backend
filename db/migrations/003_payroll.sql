-- Migracion 003: Pagos a guias por quincena (liquidaciones).
-- Todo en el schema `ext`. Lee (solo lectura) public.events + public.event_tour_guides
-- del Rust para contar los tours efectivamente hechos por cada guia.

CREATE SCHEMA IF NOT EXISTS ext;

-- Tarifa del guia (monto por tour). `valid_from` permite historico de tarifas.
CREATE TABLE IF NOT EXISTS ext.guide_rate (
  uuid             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid        uuid NOT NULL,
  amount_per_tour  integer NOT NULL CHECK (amount_per_tour >= 0),
  currency         text NOT NULL DEFAULT 'usd',
  valid_from       date NOT NULL DEFAULT CURRENT_DATE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_uuid, valid_from)
);
CREATE INDEX IF NOT EXISTS idx_guide_rate_user ON ext.guide_rate (user_uuid);

-- Quincena (periodo de liquidacion).
CREATE TABLE IF NOT EXISTS ext.payroll_period (
  uuid         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  status       text NOT NULL DEFAULT 'open',  -- open | calculated | paid
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- Liquidacion de un guia en una quincena.
CREATE TABLE IF NOT EXISTS ext.payroll_item (
  uuid         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_uuid  uuid NOT NULL REFERENCES ext.payroll_period(uuid) ON DELETE CASCADE,
  user_uuid    uuid NOT NULL,
  tours_count  integer NOT NULL DEFAULT 0,
  amount       integer NOT NULL DEFAULT 0,   -- centavos
  currency     text NOT NULL DEFAULT 'usd',
  status       text NOT NULL DEFAULT 'pending',  -- pending | paid
  paid_at      timestamptz,
  detail       jsonb NOT NULL DEFAULT '[]',   -- lista de event_uuid contados
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_uuid, user_uuid)
);
CREATE INDEX IF NOT EXISTS idx_payroll_item_period ON ext.payroll_item (period_uuid);
CREATE INDEX IF NOT EXISTS idx_payroll_item_user ON ext.payroll_item (user_uuid);
