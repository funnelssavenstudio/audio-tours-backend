-- Datos de ejemplo para desarrollo/pruebas (NO correr en produccion).
-- Un tour de pago de muestra para probar el modulo de Pagos.

INSERT INTO ext.paid_tours (tour_uuid, title, description, price_cents, currency)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Walking Tour Lower Manhattan',
  'Recorrido autoguiado por el bajo Manhattan. Tour de prueba.',
  1500,
  'usd'
)
ON CONFLICT (tour_uuid) DO NOTHING;
