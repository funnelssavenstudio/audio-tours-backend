-- Migracion 011: Alertas con IA sobre el chat (SEM08).
-- Un clasificador liviano lee los mensajes de los turistas y, si detecta una
-- QUEJA o un turista PERDIDO/separado, guarda una alerta aca y se la notifica al
-- guia (push + socket). Todo en schema `ext`.

CREATE TABLE IF NOT EXISTS ext.chat_alert (
  uuid              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_uuid        uuid NOT NULL,
  room_uuid         uuid,
  message_uuid      uuid,
  sender_user_uuid  uuid,
  type              text NOT NULL,                 -- 'queja' | 'perdido'
  severity          text NOT NULL DEFAULT 'med',   -- 'low' | 'med' | 'high'
  summary           text NOT NULL,
  acknowledged      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  acknowledged_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_alert_event
  ON ext.chat_alert (event_uuid, created_at DESC);
