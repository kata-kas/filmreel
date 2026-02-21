import { prisma } from "../prisma/client.js";

export async function createSeason(data: {
	guildId: string;
	name: string;
	listId: number;
	startDate: Date;
	endDate: Date;
}) {
	return prisma.season.create({
		data,
	});
}

export async function getSeason(seasonId: number) {
	return prisma.season.findUnique({
		where: { id: seasonId },
		include: {
			list: {
				include: {
					listFilms: {
						include: {
							film: true,
						},
					},
				},
			},
		},
	});
}

export async function getGuildSeasons(guildId: string) {
	return prisma.season.findMany({
		where: { guildId },
		orderBy: {
			startDate: "desc",
		},
	});
}

export async function getActiveSeason(guildId: string) {
	const now = new Date();

	return prisma.season.findFirst({
		where: {
			guildId,
			startDate: {
				lte: now,
			},
			endDate: {
				gte: now,
			},
		},
		include: {
			list: {
				include: {
					listFilms: {
						include: {
							film: true,
						},
					},
				},
			},
		},
	});
}

export async function getMostRecentSeason(guildId: string) {
	return prisma.season.findFirst({
		where: { guildId },
		orderBy: {
			endDate: "desc",
		},
		include: {
			list: {
				include: {
					listFilms: {
						include: {
							film: true,
						},
					},
				},
			},
		},
	});
}

export async function getSeasonOrDefault(guildId: string, seasonId?: number) {
	if (seasonId) {
		return getSeason(seasonId);
	}

	// Try active season first
	const active = await getActiveSeason(guildId);
	if (active) return active;

	// Fall back to most recent
	return getMostRecentSeason(guildId);
}

export async function getSeasonRatings(seasonId: number, guildId: string) {
	const season = await getSeason(seasonId);
	if (!season) return [];

	const filmSlugs = season.list.listFilms.map((lf) => lf.letterboxdSlug);

	return prisma.rating.findMany({
		where: {
			guildId,
			letterboxdSlug: {
				in: filmSlugs,
			},
			watchedDate: {
				gte: season.startDate,
				lte: season.endDate,
			},
		},
		include: {
			film: true,
			user: {
				select: {
					nickname: true,
				},
			},
		},
	});
}

export async function getSeasonStats(seasonId: number, guildId: string) {
	const ratings = await getSeasonRatings(seasonId, guildId);

	const userStats = new Map<
		string,
		{
			filmsWatched: number;
			totalRating: number;
			ratingCount: number;
		}
	>();

	const filmStats = new Map<
		string,
		{
			title: string;
			watchedCount: number;
			totalRating: number;
			ratingCount: number;
		}
	>();

	for (const rating of ratings) {
		// User stats
		const userStat = userStats.get(rating.discordId) || {
			filmsWatched: 0,
			totalRating: 0,
			ratingCount: 0,
		};
		userStat.filmsWatched++;
		if (rating.rating) {
			userStat.totalRating += Number(rating.rating);
			userStat.ratingCount++;
		}
		userStats.set(rating.discordId, userStat);

		// Film stats
		const filmStat = filmStats.get(rating.letterboxdSlug) || {
			title: rating.film.title,
			watchedCount: 0,
			totalRating: 0,
			ratingCount: 0,
		};
		filmStat.watchedCount++;
		if (rating.rating) {
			filmStat.totalRating += Number(rating.rating);
			filmStat.ratingCount++;
		}
		filmStats.set(rating.letterboxdSlug, filmStat);
	}

	return {
		totalRatings: ratings.length,
		userStats: Array.from(userStats.entries()).map(([discordId, stats]) => ({
			discordId,
			filmsWatched: stats.filmsWatched,
			avgRating:
				stats.ratingCount > 0 ? stats.totalRating / stats.ratingCount : null,
		})),
		filmStats: Array.from(filmStats.entries()).map(([slug, stats]) => ({
			letterboxdSlug: slug,
			title: stats.title,
			watchedCount: stats.watchedCount,
			avgRating:
				stats.ratingCount > 0 ? stats.totalRating / stats.ratingCount : null,
		})),
	};
}

export async function getSeasonDirectorStats(
	_seasonId: number,
	_guildId: string,
) {
	// This would require TMDB director data
	// Placeholder for structure
	return [];
}

export async function getSeasonYearStats(seasonId: number, guildId: string) {
	const ratings = await getSeasonRatings(seasonId, guildId);

	const yearStats = new Map<number, number>();

	for (const rating of ratings) {
		const year = rating.film.year;
		if (year) {
			yearStats.set(year, (yearStats.get(year) || 0) + 1);
		}
	}

	return Array.from(yearStats.entries())
		.map(([year, count]) => ({ year, count }))
		.sort((a, b) => b.count - a.count);
}
