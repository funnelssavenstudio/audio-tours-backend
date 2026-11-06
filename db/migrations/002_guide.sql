-- Migracion 002: Panel / Rol del Guia (perfil profesional).
-- Todo lo nuevo vive en el schema `ext`, en la MISMA base del backend Rust.
-- NO se tocan los objetos del Rust. Sin foreign keys fisicas hacia su schema
-- (solo referencia logica por uuid). El avatar y el idioma base del usuario ya
-- viven en el Rust; aca guardamos solo el perfil extendido del guia.

CREATE SCHEMA IF NOT EXISTS ext;

-- Perfil profesional del guia. `user_uuid` referencia logicamente a un usuario
-- del Rust con rol `tour_guide`.
CREATE TABLE IF NOT EXISTS ext.guide_profile (
  uuid               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_uuid          uuid NOT NULL UNIQUE,
  bio                text,
  photo_media_uuid   text,
  languages          text[] NOT NULL DEFAULT '{}',
  visible            boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guide_profile_user ON ext.guide_profile (user_uuid);
