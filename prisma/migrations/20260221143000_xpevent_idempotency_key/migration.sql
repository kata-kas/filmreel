-- Add idempotency key for XP events
ALTER TABLE "XpEvent"
ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT;

-- Backfill existing rows so NOT NULL + unique constraint can be applied safely.
-- Legacy rows get stable per-row keys; new rows are written by application logic.
UPDATE "XpEvent"
SET "idempotencyKey" = 'legacy-' || "id"::text
WHERE "idempotencyKey" IS NULL;

ALTER TABLE "XpEvent"
ALTER COLUMN "idempotencyKey" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "XpEvent_discordId_guildId_eventType_idempotencyKey_key"
ON "XpEvent" ("discordId", "guildId", "eventType", "idempotencyKey");
