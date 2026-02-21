import type { Decimal } from "@prisma/client/runtime/client";
import { prisma } from "../prisma/client.js";

export async function getUserRatings(discordId: string, guildId: string) {
	return prisma.rating.findMany({
		where: {
			discordId,
			guildId,
		},
		include: {
			film: true,
		},
		orderBy: {
			watchedDate: "desc",
		},
	});
}

export async function getUserRatedFilms(discordId: string, guildId: string) {
	return prisma.rating.findMany({
		where: {
			discordId,
			guildId,
			rating: { not: null },
		},
		include: {
			film: true,
		},
	});
}

export async function getCommonFilms(
	user1DiscordId: string,
	user2DiscordId: string,
	guildId: string,
) {
	const [user1Ratings, user2Ratings] = await Promise.all([
		prisma.rating.findMany({
			where: {
				discordId: user1DiscordId,
				guildId,
				rating: { not: null },
			},
			include: { film: true },
		}),
		prisma.rating.findMany({
			where: {
				discordId: user2DiscordId,
				guildId,
				rating: { not: null },
			},
			include: { film: true },
		}),
	]);

	const user1Map = new Map(user1Ratings.map((r) => [r.letterboxdSlug, r]));
	const common: Array<{
		letterboxdSlug: string;
		title: string;
		user1Rating: Decimal;
		user2Rating: Decimal;
		difference: number;
	}> = [];

	for (const rating of user2Ratings) {
		const match = user1Map.get(rating.letterboxdSlug);
		if (match?.rating && rating.rating) {
			common.push({
				letterboxdSlug: rating.letterboxdSlug,
				title: rating.film.title,
				user1Rating: match.rating,
				user2Rating: rating.rating,
				difference: Math.abs(Number(match.rating) - Number(rating.rating)),
			});
		}
	}

	return common;
}

export async function getFilmsWatchedByBoth(
	user1DiscordId: string,
	user2DiscordId: string,
	guildId: string,
) {
	const [user1Ratings, user2Ratings] = await Promise.all([
		prisma.rating.findMany({
			where: {
				discordId: user1DiscordId,
				guildId,
				watched: true,
			},
			select: { letterboxdSlug: true },
		}),
		prisma.rating.findMany({
			where: {
				discordId: user2DiscordId,
				guildId,
				watched: true,
			},
			select: { letterboxdSlug: true },
		}),
	]);

	const user1Slugs = new Set(user1Ratings.map((r) => r.letterboxdSlug));
	const common = user2Ratings.filter((r) => user1Slugs.has(r.letterboxdSlug));

	return common.length;
}

export async function getRatingsByFilm(
	letterboxdSlug: string,
	guildId: string,
) {
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

export async function getFilmsByDirector(
	_discordId: string,
	_guildId: string,
	_directorName: string,
) {
	// This requires TMDB data - query films that have this director
	// For now, placeholder
	return [];
}

export async function getFilmsByCountry(
	_discordId: string,
	_guildId: string,
	_countryCode: string,
) {
	// This requires TMDB data
	return [];
}

export async function getFilmsByYear(
	discordId: string,
	guildId: string,
	year: number,
) {
	return prisma.rating.findMany({
		where: {
			discordId,
			guildId,
			film: {
				year,
			},
		},
		include: {
			film: true,
		},
		orderBy: {
			rating: "desc",
		},
	});
}
