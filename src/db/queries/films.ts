import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client.js";
import { clampLimit } from "../validation.js";

export async function getFilm(letterboxdSlug: string) {
	return prisma.film.findUnique({
		where: { letterboxdSlug },
	});
}

export async function searchFilms(query: string, limit = 10) {
	return prisma.film.findMany({
		where: {
			title: {
				contains: query,
				mode: "insensitive",
			},
		},
		take: limit,
		orderBy: {
			title: "asc",
		},
	});
}

export async function getFilmsBySlugs(slugs: string[]) {
	return prisma.film.findMany({
		where: {
			letterboxdSlug: {
				in: slugs,
			},
		},
	});
}

export async function getFilmRatingStats(
	letterboxdSlug: string,
	guildId: string,
) {
	const result = await prisma.rating.aggregate({
		where: {
			letterboxdSlug,
			guildId,
			rating: { not: null },
		},
		_avg: {
			rating: true,
		},
		_count: {
			rating: true,
		},
	});

	return {
		average: result._avg.rating,
		count: result._count.rating,
	};
}

export async function getFilmRatings(letterboxdSlug: string, guildId: string) {
	return prisma.rating.findMany({
		where: {
			letterboxdSlug,
			guildId,
			rating: { not: null },
		},
		include: {
			user: {
				select: {
					nickname: true,
					letterboxdUsername: true,
				},
			},
		},
		orderBy: {
			rating: "desc",
		},
	});
}

export async function getUserFilmRating(
	discordId: string,
	guildId: string,
	letterboxdSlug: string,
) {
	return prisma.rating.findUnique({
		where: {
			discordId_guildId_letterboxdSlug: {
				discordId,
				guildId,
				letterboxdSlug,
			},
		},
	});
}

export async function getHighestRatedFilm(discordId: string, guildId: string) {
	return prisma.rating.findFirst({
		where: {
			discordId,
			guildId,
			rating: { not: null },
		},
		orderBy: {
			rating: "desc",
		},
		include: {
			film: true,
		},
	});
}

export async function getLowestRatedFilm(discordId: string, guildId: string) {
	return prisma.rating.findFirst({
		where: {
			discordId,
			guildId,
			rating: { not: null },
		},
		orderBy: {
			rating: "asc",
		},
		include: {
			film: true,
		},
	});
}

/**
 * Check if a film needs metadata resolution.
 * A film needs resolution if it has no provider records at all,
 * or if all provider records are marked as failed with no successful resolution.
 */
export async function filmNeedsResolution(
	letterboxdSlug: string,
): Promise<boolean> {
	const providers = await prisma.filmProvider.findMany({
		where: { letterboxdSlug },
	});

	// No providers attempted yet - needs resolution
	if (providers.length === 0) {
		return true;
	}

	// Check if any provider has a successful resolution
	const hasSuccessfulResolution = providers.some(
		(p) => p.resolvedAt !== null && !p.failed,
	);
	if (hasSuccessfulResolution) {
		return false;
	}

	// All providers have failed - check if we've hit max retries
	const allFailed = providers.every((p) => p.failed);
	if (allFailed) {
		const maxRetries = providers.reduce(
			(max, p) => Math.max(max, p.retryCount),
			0,
		);
		// If max retries reached, don't re-resolve
		return maxRetries < 3;
	}

	return true;
}

/**
 * Get films that have no metadata resolution attempts yet.
 * Limited to prevent overwhelming the queue.
 */
export async function getUnresolvedFilms(limit = 100) {
	return prisma.film.findMany({
		where: {
			providers: {
				none: {},
			},
		},
		take: limit,
	});
}

/**
 * Get films that have failed resolution but haven't hit max retries.
 */
export async function getFailedResolutions(limit = 100) {
	const safeLimit = clampLimit(limit, 100);
	const films = await prisma.$queryRaw<
		Array<{ letterboxdSlug: string; title: string; year: number | null }>
	>(
		Prisma.sql`
      SELECT f."letterboxdSlug", f.title, f.year
      FROM "Film" f
      JOIN "FilmProvider" fp ON f."letterboxdSlug" = fp."letterboxdSlug"
      WHERE fp.failed = true
      GROUP BY f."letterboxdSlug", f.title, f.year
      HAVING MAX(fp."retryCount") < 3
      LIMIT ${safeLimit}
    `,
	);
	return films;
}
