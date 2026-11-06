-- Migracion 005: Foto del perfil del guia (bytes crudos en la base).
-- Guardamos la imagen directamente en ext.guide_photo (una fila por guia). El
-- perfil (ext.guide_profile) ya existe; aca solo agregamos el almacenamiento de
-- la foto, independiente del campo photo_media_uuid del perfil.
-- Todo en schema `ext`. NO se tocan los objetos del Rust (public).

CREATE SCHEMA IF NOT EXISTS ext;

-- Una foto por guia. `user_uuid` referencia logicamente a un usuario del Rust
-- con rol `tour_guide` (sin foreign key fisica hacia su schema).
CREATE TABLE IF NOT EXISTS ext.guide_photo (
  user_uuid     uuid PRIMARY KEY,
  content_type  text NOT NULL,         -- image/jpeg | image/png
  bytes         bytea NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
