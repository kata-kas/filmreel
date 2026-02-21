-- Migration: Provider-agnostic film metadata
-- Decouples film metadata from TMDB and treats both TMDB and Letterboxd as interchangeable providers

-- 1. Create the FilmProvider table to track provider-specific resolution status
CREATE TABLE "FilmProvider" (
    "id" SERIAL NOT NULL,
    "letterboxdSlug" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "failedAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FilmProvider_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on letterboxdSlug + provider combination
CREATE UNIQUE INDEX "FilmProvider_letterboxdSlug_provider_key" ON "FilmProvider"("letterboxdSlug", "provider");

-- Create index for faster lookups
CREATE INDEX "FilmProvider_letterboxdSlug_idx" ON "FilmProvider"("letterboxdSlug");
CREATE INDEX "FilmProvider_provider_idx" ON "FilmProvider"("provider");

-- Add foreign key constraint to Film table
ALTER TABLE "FilmProvider" ADD CONSTRAINT "FilmProvider_letterboxdSlug_fkey" 
    FOREIGN KEY ("letterboxdSlug") REFERENCES "Film"("letterboxdSlug") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Add new canonical metadata columns to Film table
-- Using TEXT[] for array types in PostgreSQL
ALTER TABLE "Film" ADD COLUMN "director" TEXT[];
ALTER TABLE "Film" ADD COLUMN "country" TEXT[];
ALTER TABLE "Film" ADD COLUMN "genres" TEXT[];
ALTER TABLE "Film" ADD COLUMN "runtime" INTEGER;
ALTER TABLE "Film" ADD COLUMN "posterPath" TEXT;
ALTER TABLE "Film" ADD COLUMN "letterboxdRating" DOUBLE PRECISION;
ALTER TABLE "Film" ADD COLUMN "letterboxdVotes" INTEGER;

-- 3. Backfill: Create FilmProvider records for existing TMDB data
-- For any film with tmdbId, create a corresponding FilmProvider record
INSERT INTO "FilmProvider" ("letterboxdSlug", "provider", "providerId", "resolvedAt", "failed", "retryCount")
SELECT 
    "letterboxdSlug",
    'tmdb' as "provider",
    "tmdbId"::TEXT as "providerId",
    NOW() as "resolvedAt",
    false as "failed",
    0 as "retryCount"
FROM "Film"
WHERE "tmdbId" IS NOT NULL;

-- Also create records for films that were marked as failed resolution
INSERT INTO "FilmProvider" ("letterboxdSlug", "provider", "providerId", "resolvedAt", "failed", "failedAt", "retryCount")
SELECT 
    "letterboxdSlug",
    'tmdb' as "provider",
    NULL as "providerId",
    NULL as "resolvedAt",
    true as "failed",
    NOW() as "failedAt",
    1 as "retryCount"
FROM "Film"
WHERE "tmdbResolveFailed" = true 
    AND "tmdbId" IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM "FilmProvider" fp 
        WHERE fp."letterboxdSlug" = "Film"."letterboxdSlug" AND fp."provider" = 'tmdb'
    );

-- 4. Migrate data from old columns to new columns where applicable
-- Copy originCountry to country (they're both arrays of country codes/names)
UPDATE "Film" SET "country" = "originCountry" WHERE "originCountry" IS NOT NULL AND array_length("originCountry", 1) > 0;

-- 5. Drop old TMDB-specific columns and related indexes
-- First drop the unique index on tmdbId
DROP INDEX IF EXISTS "Film_tmdbId_key";

-- Then drop the columns
ALTER TABLE "Film" DROP COLUMN IF EXISTS "tmdbId";
ALTER TABLE "Film" DROP COLUMN IF EXISTS "tmdbResolved";
ALTER TABLE "Film" DROP COLUMN IF EXISTS "tmdbResolveFailed";
ALTER TABLE "Film" DROP COLUMN IF EXISTS "globalRating";
ALTER TABLE "Film" DROP COLUMN IF EXISTS "totalRatings";
ALTER TABLE "Film" DROP COLUMN IF EXISTS "originCountry";
