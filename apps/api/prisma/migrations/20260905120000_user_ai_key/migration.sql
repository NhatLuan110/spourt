-- D-052 — the learner's own AI key.
--
-- Three nullable columns, so every existing row keeps working with no default
-- and no backfill: a null key simply means "use the shared server key".
--
-- The key itself is stored encrypted (AES-256-GCM) and never leaves the server.
-- `aiApiKeyHint` holds only the last four characters so the settings screen can
-- show which key is configured without being able to reveal it.
ALTER TABLE "UserSettings" ADD COLUMN "aiApiKeyEncrypted" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "aiApiKeyHint" TEXT;
ALTER TABLE "UserSettings" ADD COLUMN "aiProvider" TEXT;
