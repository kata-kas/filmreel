-- CreateTable
CREATE TABLE "User" (
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "letterboxdUsername" TEXT NOT NULL,
    "nickname" TEXT,
    "lastFmUsername" TEXT,
    "aniListUsername" TEXT,
    "lastScraped" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("discordId","guildId")
);

-- CreateTable
CREATE TABLE "Film" (
    "letterboxdSlug" TEXT NOT NULL,
    "tmdbId" INTEGER,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "tmdbResolved" BOOLEAN NOT NULL DEFAULT false,
    "tmdbResolveFailed" BOOLEAN NOT NULL DEFAULT false,
    "globalRating" DECIMAL(3,1),
    "totalRatings" INTEGER,
    "originCountry" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Film_pkey" PRIMARY KEY ("letterboxdSlug")
);

-- CreateTable
CREATE TABLE "Rating" (
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "letterboxdSlug" TEXT NOT NULL,
    "rating" DECIMAL(3,1),
    "watched" BOOLEAN NOT NULL DEFAULT true,
    "watchedDate" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("discordId","guildId","letterboxdSlug")
);

-- CreateTable
CREATE TABLE "GuildList" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "letterboxdUrl" TEXT NOT NULL,
    "listName" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "lastSynced" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "deadlineLabel" TEXT,

    CONSTRAINT "GuildList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListFilm" (
    "listId" INTEGER NOT NULL,
    "letterboxdSlug" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ListFilm_pkey" PRIMARY KEY ("listId","letterboxdSlug")
);

-- CreateTable
CREATE TABLE "UserFavorite" (
    "id" SERIAL NOT NULL,
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "lookupType" TEXT NOT NULL,
    "tmdbId" INTEGER,
    "isoCode" TEXT,
    "canonicalName" TEXT NOT NULL,

    CONSTRAINT "UserFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpEvent" (
    "id" SERIAL NOT NULL,
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "xpAwarded" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelThreshold" (
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "xpRequired" INTEGER NOT NULL,
    "roleId" TEXT,

    CONSTRAINT "LevelThreshold_pkey" PRIMARY KEY ("guildId","level")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "listId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildXpConfig" (
    "guildId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "xpAmount" INTEGER NOT NULL,

    CONSTRAINT "GuildXpConfig_pkey" PRIMARY KEY ("guildId","eventType")
);

-- CreateIndex
CREATE UNIQUE INDEX "Film_tmdbId_key" ON "Film"("tmdbId");

-- CreateIndex
CREATE INDEX "Rating_letterboxdSlug_idx" ON "Rating"("letterboxdSlug");

-- CreateIndex
CREATE INDEX "Rating_discordId_guildId_idx" ON "Rating"("discordId", "guildId");

-- CreateIndex
CREATE INDEX "Rating_guildId_watchedDate_idx" ON "Rating"("guildId", "watchedDate");

-- CreateIndex
CREATE UNIQUE INDEX "UserFavorite_discordId_guildId_lookupType_tmdbId_isoCode_key" ON "UserFavorite"("discordId", "guildId", "lookupType", "tmdbId", "isoCode");

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_discordId_guildId_fkey" FOREIGN KEY ("discordId", "guildId") REFERENCES "User"("discordId", "guildId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_letterboxdSlug_fkey" FOREIGN KEY ("letterboxdSlug") REFERENCES "Film"("letterboxdSlug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListFilm" ADD CONSTRAINT "ListFilm_listId_fkey" FOREIGN KEY ("listId") REFERENCES "GuildList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListFilm" ADD CONSTRAINT "ListFilm_letterboxdSlug_fkey" FOREIGN KEY ("letterboxdSlug") REFERENCES "Film"("letterboxdSlug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserFavorite" ADD CONSTRAINT "UserFavorite_discordId_guildId_fkey" FOREIGN KEY ("discordId", "guildId") REFERENCES "User"("discordId", "guildId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpEvent" ADD CONSTRAINT "XpEvent_discordId_guildId_fkey" FOREIGN KEY ("discordId", "guildId") REFERENCES "User"("discordId", "guildId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_listId_fkey" FOREIGN KEY ("listId") REFERENCES "GuildList"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
