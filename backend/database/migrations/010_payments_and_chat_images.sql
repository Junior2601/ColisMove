-- =========================================================
--  Migration 010 : paiements (billets d'avion et kilos) et photos dans la messagerie
--  - numéros de paiement envoyés au client (bouton « Envoyer le numéro de paiement ») :
--    ceux de MoveColis (billets, voyages MoveColis) ou ceux du voyageur (ses clients le paient directement)
--  - kilos : « Paiement reçu », indépendant des étapes du colis
--  - photos dans les conversations (capture du paiement par le client)
--    appliquée automatiquement au déploiement (npm run db:migrate)
-- =========================================================

-- Numéros de paiement (Orange Money, Wave…), texte libre : ceux de MoveColis…
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS payment_info TEXT NOT NULL DEFAULT '' CHECK (char_length(payment_info) <= 1000);
-- … et ceux de chaque voyageur (page Profil)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS payment_info TEXT NOT NULL DEFAULT '' CHECK (char_length(payment_info) <= 1000);

-- Dernier envoi des numéros de paiement au client
ALTER TABLE flight_orders ADD COLUMN IF NOT EXISTS payment_info_sent_at TIMESTAMPTZ;
ALTER TABLE reservations  ADD COLUMN IF NOT EXISTS payment_info_sent_at TIMESTAMPTZ;
-- Kilos : paiement reçu par le propriétaire du voyage (un billet, lui, passe au statut « Payée »)
ALTER TABLE reservations  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Photo jointe à un message (une au plus), lue uniquement par les participants de la conversation
CREATE TABLE IF NOT EXISTS message_attachments (
  id            BIGSERIAL PRIMARY KEY,
  message_id    BIGINT       NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  content_type  VARCHAR(20)  NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes    INT          NOT NULL CHECK (size_bytes BETWEEN 1 AND 2097152),  -- 2 Mo au plus
  width         SMALLINT     CHECK (width > 0),                                   -- pour réserver la place à l'affichage
  height        SMALLINT     CHECK (height > 0),
  data          BYTEA        NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_message_attachments_message UNIQUE (message_id)
);
