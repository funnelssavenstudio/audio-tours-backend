-- Codigo compartido por evento (tour): un unico QR por tour que todos los
-- pasajeros escanean para sumarse, en vez de un QR individual por reserva.
CREATE TABLE IF NOT EXISTS ext.event_share_code (
  event_uuid uuid PRIMARY KEY,
  code       varchar(16) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
