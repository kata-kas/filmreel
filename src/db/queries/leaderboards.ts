import { Prisma } from "@prisma/client";
import { displayToStorage } from "../../constants/scales.js";
import type { LeaderboardEntry } from "../../types/index.js";
import { prisma } from "../prisma/client.js";
import {
	clampLimit,
	clampListId,
	clampMinRatings,
	clampOffset,
} from "../validation.js";

export async function getFilmsByAverageRating(
	guildId: string,
	options: {
		minRatings?: number;
		maxRatings?: number;
		limit?: number;
		offset?: number;
		listId?: number;
	} = {},
): Promise<
	Array<{
		letterboxdSlug: string;
		title: string;
		year: number | null;
		avgRating: number;
		ratingCount: number;
	}>
> {
	const minRatings = clampMinRatings(options.minRatings, 10);
	const maxRatings =
		options.maxRatings != null
			? clampMinRatings(options.maxRatings, 10000)
			: undefined;
	const limit = clampLimit(options.limit, 10);
	const offset = clampOffset(options.offset, 0);
	const listId = clampListId(options.listId);

	const result = await prisma.$queryRaw<
		Array<{
			letterboxd_slug: string;
			title: string;
			year: number | null;
			avg_rating: number;
			rating_count: number;
		}>
	>(
		Prisma.sql`
      SELECT 
        f."letterboxdSlug" as letterboxd_slug,
        f.title,
        f.year,
        AVG(r.rating)::float as avg_rating,
        COUNT(r.rating)::int as rating_count
      FROM "Film" f
      JOIN "Rating" r ON f."letterboxdSlug" = r."letterboxdSlug"
      WHERE r."guildId" = ${guildId}
        AND r.rating IS NOT NULL
        ${listId != null ? Prisma.sql`AND f."letterboxdSlug" IN (SELECT "letterboxdSlug" FROM "ListFilm" WHERE "listId" = ${listId})` : Prisma.empty}
      GROUP BY f."letterboxdSlug", f.title, f.year
      HAVING COUNT(r.rating) >= ${minRatings}
      ${maxRatings != null ? Prisma.sql`AND COUNT(r.rating) <= ${maxRatings}` : Prisma.empty}
      ORDER BY avg_rating DESC, rating_count DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
	);

	return result.map((row) => ({
		letterboxdSlug: row.letterboxd_slug,
		title: row.title,
		year: row.year,
		avgRating: row.avg_rating,
		ratingCount: row.rating_count,
	}));
}

export async function getFilmsByPopularity(
	guildId: string,
	options: {
		limit?: number;
		offset?: number;
		listId?: number;
	} = {},
): Promise<
	Array<{
		letterboxdSlug: string;
		title: string;
		year: number | null;
		ratingCount: number;
		avgRating: number;
	}>
> {
	const limit = clampLimit(options.limit, 10);
	const offset = clampOffset(options.offset, 0);
	const listId = clampListId(options.listId);

	const result = await prisma.$queryRaw<
		Array<{
			letterboxd_slug: string;
			title: string;
			year: number | null;
			rating_count: number;
			avg_rating: number;
		}>
	>(
		Prisma.sql`
      SELECT 
        f."letterboxdSlug" as letterboxd_slug,
        f.title,
        f.year,
        COUNT(r.rating)::int as rating_count,
        AVG(r.rating)::float as avg_rating
      FROM "Film" f
      JOIN "Rating" r ON f."letterboxdSlug" = r."letterboxdSlug"
      WHERE r."guildId" = ${guildId}
        AND r.rating IS NOT NULL
        ${listId != null ? Prisma.sql`AND f."letterboxdSlug" IN (SELECT "letterboxdSlug" FROM "ListFilm" WHERE "listId" = ${listId})` : Prisma.empty}
      GROUP BY f."letterboxdSlug", f.title, f.year
      ORDER BY rating_count DESC, avg_rating DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
	);

	return result.map((row) => ({
		letterboxdSlug: row.letterboxd_slug,
		title: row.title,
		year: row.year,
		ratingCount: row.rating_count,
		avgRating: row.avg_rating,
	}));
}

export async function getMostActiveRaters(
	guildId: string,
	options: {
		limit?: number;
		offset?: number;
	} = {},
): Promise<LeaderboardEntry[]> {
	const limit = clampLimit(options.limit, 10);
	const offset = clampOffset(options.offset, 0);

	const result = await prisma.$queryRaw<
		Array<{
			discord_id: string;
			nickname: string | null;
			rating_count: number;
		}>
	>(
		Prisma.sql`
      SELECT 
        u."discordId" as discord_id,
        u.nickname,
        COUNT(r.rating)::int as rating_count
      FROM "User" u
      JOIN "Rating" r ON u."discordId" = r."discordId" AND u."guildId" = r."guildId"
      WHERE u."guildId" = ${guildId}
        AND u."deletedAt" IS NULL
        AND r.rating IS NOT NULL
      GROUP BY u."discordId", u.nickname
      ORDER BY rating_count DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
	);

	return result.map((row, index) => ({
		rank: offset + index + 1,
		discordId: row.discord_id,
		nickname: row.nickname,
		value: row.rating_count,
	}));
}

export async function getHighestPercentageOfRating(
	guildId: string,
	displayRating: number,
	options: {
		listId?: number;
		minRatings?: number;
		limit?: number;
		offset?: number;
	} = {},
): Promise<LeaderboardEntry[]> {
	const listId = clampListId(options.listId);
	const minRatings = clampMinRatings(options.minRatings, 10);
	const limit = clampLimit(options.limit, 10);
	const offset = clampOffset(options.offset, 0);
	const storageRating = displayToStorage(displayRating);

	const result = await prisma.$queryRaw<
		Array<{
			discord_id: string;
			nickname: string | null;
			target_count: number;
			rating_count: number;
			percentage: number;
		}>
	>(
		Prisma.sql`
      SELECT
        u."discordId" as discord_id,
        u.nickname,
        COUNT(*) FILTER (WHERE r.rating = ${storageRating})::int as target_count,
        COUNT(r.rating)::int as rating_count,
        (
          (COUNT(*) FILTER (WHERE r.rating = ${storageRating})::float * 100.0)
          / NULLIF(COUNT(r.rating), 0)::float
        )::float as percentage
      FROM "User" u
      JOIN "Rating" r ON u."discordId" = r."discordId" AND u."guildId" = r."guildId"
      ${listId != null ? Prisma.sql`JOIN "ListFilm" lf ON r."letterboxdSlug" = lf."letterboxdSlug" AND lf."listId" = ${listId}` : Prisma.empty}
      WHERE u."guildId" = ${guildId}
        AND u."deletedAt" IS NULL
        AND r.rating IS NOT NULL
      GROUP BY u."discordId", u.nickname
      HAVING COUNT(r.rating) >= ${minRatings}
      ORDER BY percentage DESC, target_count DESC, rating_count DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
	);

	return result.map((row, index) => ({
		rank: offset + index + 1,
		discordId: row.discord_id,
		nickname: row.nickname,
		value: row.percentage,
		secondaryValue: row.rating_count,
	}));
}

export async function getMostFilmsSeen(
	guildId: string,
	options: {
		limit?: number;
		offset?: number;
		listId?: number;
	} = {},
): Promise<LeaderboardEntry[]> {
	const limit = clampLimit(options.limit, 10);
	const offset = clampOffset(options.offset, 0);
	const listId = clampListId(options.listId);

	const result = await prisma.$queryRaw<
		Array<{
			discord_id: string;
			nickname: string | null;
			seen_count: number;
		}>
	>(
		listId != null
			? Prisma.sql`
          SELECT 
            u."discordId" as discord_id,
            u.nickname,
            COUNT(r."letterboxdSlug")::int as seen_count
          FROM "User" u
          JOIN "Rating" r ON u."discordId" = r."discordId" AND u."guildId" = r."guildId"
          JOIN "ListFilm" lf ON r."letterboxdSlug" = lf."letterboxdSlug" AND lf."listId" = ${listId}
          WHERE u."guildId" = ${guildId}
            AND u."deletedAt" IS NULL
            AND r.watched = true
          GROUP BY u."discordId", u.nickname
          ORDER BY seen_count DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `
			: Prisma.sql`
          SELECT 
            u."discordId" as discord_id,
            u.nickname,
            COUNT(r."letterboxdSlug")::int as seen_count
          FROM "User" u
          JOIN "Rating" r ON u."discordId" = r."discordId" AND u."guildId" = r."guildId"
          WHERE u."guildId" = ${guildId}
            AND u."deletedAt" IS NULL
            AND r.watched = true
          GROUP BY u."discordId", u.nickname
          ORDER BY seen_count DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `,
	);

	return result.map((row, index) => ({
		rank: offset + index + 1,
		discordId: row.discord_id,
		nickname: row.nickname,
		value: row.seen_count,
	}));
}

export async function getDivisiveFilms(
	guildId: string,
	options: {
		minRatings?: number;
		limit?: number;
		offset?: number;
	} = {},
): Promise<
	Array<{
		letterboxdSlug: string;
		title: string;
		year: number | null;
		stdDev: number;
		ratingCount: number;
		avgRating: number;
	}>
> {
	const minRatings = clampMinRatings(options.minRatings, 5);
	const limit = clampLimit(options.limit, 10);
	const offset = clampOffset(options.offset, 0);

	const result = await prisma.$queryRaw<
		Array<{
			letterboxd_slug: string;
			title: string;
			year: number | null;
			std_dev: number;
			rating_count: number;
			avg_rating: number;
		}>
	>(
		Prisma.sql`
      SELECT 
        f."letterboxdSlug" as letterboxd_slug,
        f.title,
        f.year,
        STDDEV(r.rating)::float as std_dev,
        COUNT(r.rating)::int as rating_count,
        AVG(r.rating)::float as avg_rating
      FROM "Film" f
      JOIN "Rating" r ON f."letterboxdSlug" = r."letterboxdSlug"
      WHERE r."guildId" = ${guildId}
        AND r.rating IS NOT NULL
      GROUP BY f."letterboxdSlug", f.title, f.year
      HAVING COUNT(r.rating) >= ${minRatings}
      ORDER BY std_dev DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
	);

	return result.map((row) => ({
		letterboxdSlug: row.letterboxd_slug,
		title: row.title,
		year: row.year,
		stdDev: row.std_dev,
		ratingCount: row.rating_count,
		avgRating: row.avg_rating,
	}));
}

export async function getSheepScores(
	guildId: string,
	options: {
		minRatings?: number;
		limit?: number;
		offset?: number;
	} = {},
): Promise<LeaderboardEntry[]> {
	const minRatings = clampMinRatings(options.minRatings, 20);
	const limit = clampLimit(options.limit, 10);
	const offset = clampOffset(options.offset, 0);

	const guildAverages = await prisma.$queryRaw<
		Array<{
			letterboxd_slug: string;
			avg_rating: number;
		}>
	>(
		Prisma.sql`
      SELECT 
        "letterboxdSlug" as letterboxd_slug,
        AVG(rating)::float as avg_rating
      FROM "Rating"
      WHERE "guildId" = ${guildId} AND rating IS NOT NULL
      GROUP BY "letterboxdSlug"
      HAVING COUNT(rating) >= 5
    `,
	);

	void new Map(guildAverages.map((r) => [r.letterboxd_slug, r.avg_rating]));

	const result = await prisma.$queryRaw<
		Array<{
			discord_id: string;
			nickname: string | null;
			rating_count: number;
			avg_diff: number;
		}>
	>(
		Prisma.sql`
      SELECT 
        u."discordId" as discord_id,
        u.nickname,
        COUNT(r.rating)::int as rating_count,
        AVG(ABS(r.rating - guild_avg.avg_rating))::float as avg_diff
      FROM "User" u
      JOIN "Rating" r ON u."discordId" = r."discordId" AND u."guildId" = r."guildId"
      JOIN (
        SELECT "letterboxdSlug", AVG(rating) as avg_rating
        FROM "Rating"
        WHERE "guildId" = ${guildId} AND rating IS NOT NULL
        GROUP BY "letterboxdSlug"
      ) guild_avg ON r."letterboxdSlug" = guild_avg."letterboxdSlug"
      WHERE u."guildId" = ${guildId}
        AND u."deletedAt" IS NULL
        AND r.rating IS NOT NULL
      GROUP BY u."discordId", u.nickname
      HAVING COUNT(r.rating) >= ${minRatings}
      ORDER BY avg_diff ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
	);

	return result.map((row, index) => ({
		rank: offset + index + 1,
		discordId: row.discord_id,
		nickname: row.nickname,
		value: row.avg_diff,
		secondaryValue: row.rating_count,
	}));
}

export async function getOnTheBubble(
	guildId: string,
	ratingCount: number = 9,
	limit: number = 10,
): Promise<
	Array<{
		letterboxdSlug: string;
		title: string;
		year: number | null;
		ratingCount: number;
		avgRating: number;
	}>
> {
	const safeRatingCount = clampMinRatings(ratingCount, 9);
	const safeLimit = clampLimit(limit, 10);

	const result = await prisma.$queryRaw<
		Array<{
			letterboxd_slug: string;
			title: string;
			year: number | null;
			rating_count: number;
			avg_rating: number;
		}>
	>(
		Prisma.sql`
      SELECT 
        f."letterboxdSlug" as letterboxd_slug,
        f.title,
        f.year,
        COUNT(r.rating)::int as rating_count,
        AVG(r.rating)::float as avg_rating
      FROM "Film" f
      JOIN "Rating" r ON f."letterboxdSlug" = r."letterboxdSlug"
      WHERE r."guildId" = ${guildId}
        AND r.rating IS NOT NULL
      GROUP BY f."letterboxdSlug", f.title, f.year
      HAVING COUNT(r.rating) = ${safeRatingCount}
      ORDER BY avg_rating DESC
      LIMIT ${safeLimit}
    `,
	);

	return result.map((row) => ({
		letterboxdSlug: row.letterboxd_slug,
		title: row.title,
		year: row.year,
		ratingCount: row.rating_count,
		avgRating: row.avg_rating,
	}));
}
