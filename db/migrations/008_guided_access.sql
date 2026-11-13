-- Rediseño de acceso guiado (pedido de Luisa, puntos 1-3). Todo en schema ext;
-- el schema del Rust no se toca. Convive con 007_event_share_code (por evento):
-- estas tablas son para el QR PERMANENTE por tour + vigencia por día + GPS.

-- Punto 1: un único QR PERMANENTE por tour (no por evento/fecha). El guía lo
-- imprime/lamina una vez y lo usa siempre. Al escanear, el backend resuelve el
-- evento de HOY de ese tour.
CREATE TABLE IF NOT EXISTS ext.tour_share_code (
  tour_uuid  uuid PRIMARY KEY,
  code       varchar(16) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Punto 2: acceso guiado con vigencia por día + revocable por el guía. Como no
-- podemos vencer los tickets del Rust, esta tabla es la capa de validez que la
-- app consulta antes de reproducir un tour guiado.
--   valid_date : fecha (zona del tour) para la que vale el acceso.
--   revoked_at : si el guía cortó el acceso (NULL = activo).
CREATE TABLE IF NOT EXISTS ext.guided_access (
  event_uuid uuid NOT NULL,
  user_uuid  uuid NOT NULL,
  valid_date date NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (event_uuid, user_uuid)
);
CREATE INDEX IF NOT EXISTS guided_access_user_idx
  ON ext.guided_access (user_uuid);

-- Punto 3: última ubicación conocida del guía por evento, para validar que el
-- pasajero esté cerca al activar (anti "te paso la foto del QR"). Una fila por
-- evento (el guía la va actualizando mientras reporta ubicación).
CREATE TABLE IF NOT EXISTS ext.guide_location (
  event_uuid      uuid PRIMARY KEY,
  tour_guide_uuid uuid NOT NULL,
  lat             double precision NOT NULL,
  lng             double precision NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
