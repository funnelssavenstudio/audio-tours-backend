-- Migracion 004: Chat grupal (nucleo: salas + mensajes + cache de traduccion).
-- La traduccion automatica y la entrega en tiempo real (socket) se suman despues;
-- estas tablas y el historial HTTP funcionan desde ya. Todo en schema `ext`.

CREATE SCHEMA IF NOT EXISTS ext;

-- Una sala de chat por evento del Rust.
CREATE TABLE IF NOT EXISTS ext.chat_room (
  uuid         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_uuid   uuid NOT NULL UNIQUE,
  status       text NOT NULL DEFAULT 'open',  -- open | closed
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Mensaje en su texto original.
CREATE TABLE IF NOT EXISTS ext.chat_message (
  uuid                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_uuid               uuid NOT NULL REFERENCES ext.chat_room(uuid) ON DELETE CASCADE,
  sender_user_uuid        uuid NOT NULL,
  sender_role             text NOT NULL DEFAULT 'tourist',  -- tourist | tour_guide
  original_text           text NOT NULL,
  original_language_code  text NOT NULL DEFAULT 'es',
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_message_room ON ext.chat_message (room_uuid, created_at);

-- Cache de traducciones por mensaje (se llena on-demand cuando se agregue el
-- servicio de traduccion; evita retraducir).
CREATE TABLE IF NOT EXISTS ext.chat_message_translation (
  uuid             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_uuid     uuid NOT NULL REFERENCES ext.chat_message(uuid) ON DELETE CASCADE,
  language_code    text NOT NULL,
  translated_text  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_uuid, language_code)
);
