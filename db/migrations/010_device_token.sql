-- Migracion 010: tokens de dispositivo para notificaciones push (APNs iOS).
-- Un usuario puede tener varios dispositivos. El token lo manda la app al
-- registrarse para notificaciones; el backend lo usa para mandar la push por
-- APNs. Si APNs responde que el token ya no sirve (410/BadDeviceToken), se borra.

CREATE TABLE IF NOT EXISTS ext.device_token (
  user_uuid   uuid NOT NULL,
  token       text NOT NULL,
  platform    text NOT NULL DEFAULT 'ios',  -- ios | android
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_uuid, token)
);
CREATE INDEX IF NOT EXISTS idx_device_token_user ON ext.device_token (user_uuid);
