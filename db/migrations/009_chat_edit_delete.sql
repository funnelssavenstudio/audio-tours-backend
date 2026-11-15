-- Migracion 009: editar / borrar mensajes del chat (estilo WhatsApp).
-- Columnas aditivas y nullables -> compatible hacia atras (un mensaje sin
-- editar/borrar tiene ambas en NULL). Al editar se re-traduce (se limpian las
-- traducciones viejas y se vuelven a cachear). Al borrar, el mensaje queda
-- (soft-delete) y el cliente muestra "Mensaje eliminado".

ALTER TABLE ext.chat_message
  ADD COLUMN IF NOT EXISTS edited_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
