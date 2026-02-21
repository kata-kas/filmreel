import type { Job } from "bullmq";
import { prisma } from "../../db/prisma/client.js";
import { filmNeedsResolution } from "../../db/queries/films.js";
import { logger } from "../../logger.js";
import type { UserScrapeJob } from "../../queue/definitions.js";
import {
	enqueueFilmResolution,
	enqueueProcessXp,
} from "../../queue/enqueue.js";
import { scrapeList, scrapeUserFilms } from "../../scraper/letterboxd.js";

const log = logger.child({ module: "Worker" });

export async function processUserScrape(
	job: Job<UserScrapeJob>,
): Promise<{ filmsScraped: number; ratingsUpdated: number }> {
	log.info(
		{ jobId: job.id, discordId: job.data.discordId, guildId: job.data.guildId },
		"Processing scrape job",
	);
	const { discordId, guildId, full } = job.data;

	// Get user
	const user = await prisma.user.findUnique({
		where: {
			discordId_guildId: { discordId, guildId },
		},
	});

	if (!user) {
		throw new Error(`User not found: ${discordId} in guild ${guildId}`);
	}

	if (user.deletedAt) {
		throw new Error(`User is deleted: ${discordId}`);
	}

	const watchlistUrl = `https://letterboxd.com/${user.letterboxdUsername}/watchlist`;

	// Get existing film slugs for incremental mode
	const existingSlugs = full
		? new Set<string>()
		: new Set(
				(
					await prisma.rating.findMany({
						where: { discordId, guildId, watched: true },
						select: { letterboxdSlug: true },
					})
				).map((r) => r.letterboxdSlug),
			);

	log.info(
		{ username: user.letterboxdUsername },
		"Scraping films and watchlist",
	);
	const [films, watchlist] = await Promise.all([
		scrapeUserFilms(user.letterboxdUsername, {
			full,
			existingSlugs,
		}),
		scrapeList(watchlistUrl),
	]);
	log.info(
		{ filmsCount: films.length, watchlistCount: watchlist.length },
		"Scraped films and watchlist",
	);

	// Atomic transaction: all film/rating upserts + user update
	const ratingsUpdated = await prisma.$transaction(async (tx) => {
		let count = 0;
		const watchlistSlugs = watchlist.map((film) => film.slug);
		for (const film of films) {
			await tx.film.upsert({
				where: { letterboxdSlug: film.letterboxdSlug },
				update: { title: film.title },
				create: {
					letterboxdSlug: film.letterboxdSlug,
					title: film.title,
				},
			});

			await tx.rating.upsert({
				where: {
					discordId_guildId_letterboxdSlug: {
						discordId,
						guildId,
						letterboxdSlug: film.letterboxdSlug,
					},
				},
				update: {
					rating: film.rating,
					watched: true,
					watchedDate: film.watchedDate,
					viewCount: film.viewCount,
				},
				create: {
					discordId,
					guildId,
					letterboxdSlug: film.letterboxdSlug,
					rating: film.rating,
					watched: true,
					watchedDate: film.watchedDate,
					viewCount: film.viewCount,
				},
			});
			count++;
		}

		for (const watchlistFilm of watchlist) {
			await tx.film.upsert({
				where: { letterboxdSlug: watchlistFilm.slug },
				update: { title: watchlistFilm.title },
				create: {
					letterboxdSlug: watchlistFilm.slug,
					title: watchlistFilm.title,
				},
			});

			const existingRating = await tx.rating.findUnique({
				where: {
					discordId_guildId_letterboxdSlug: {
						discordId,
						guildId,
						letterboxdSlug: watchlistFilm.slug,
					},
				},
				select: { watched: true },
			});

			if (!existingRating) {
				await tx.rating.create({
					data: {
						discordId,
						guildId,
						letterboxdSlug: watchlistFilm.slug,
						rating: null,
						watched: false,
						watchedDate: null,
						viewCount: 0,
					},
				});
			}
		}

		// Exact watchlist sync: remove stale watchlist-only placeholders no longer present
		// in the latest watchlist snapshot.
		if (watchlistSlugs.length === 0) {
			await tx.rating.deleteMany({
				where: {
					discordId,
					guildId,
					watched: false,
					rating: null,
					viewCount: 0,
				},
			});
		} else {
			await tx.rating.deleteMany({
				where: {
					discordId,
					guildId,
					watched: false,
					rating: null,
					viewCount: 0,
					letterboxdSlug: { notIn: watchlistSlugs },
				},
			});
		}

		await tx.user.update({
			where: { discordId_guildId: { discordId, guildId } },
			data: { lastScraped: new Date() },
		});

		return count;
	});

	// Enqueue side effects after transaction (outside DB boundary)
	const resolutionCandidates = new Map(
		films.map((film) => [film.letterboxdSlug, film.title]),
	);
	for (const watchlistFilm of watchlist) {
		if (!resolutionCandidates.has(watchlistFilm.slug)) {
			resolutionCandidates.set(watchlistFilm.slug, watchlistFilm.title);
		}
	}

	for (const [letterboxdSlug, title] of resolutionCandidates) {
		const needsResolution = await filmNeedsResolution(letterboxdSlug);
		if (needsResolution) {
			const yearMatch = letterboxdSlug.match(/-([0-9]{4})$/);
			const yearFromSlug = yearMatch ? parseInt(yearMatch[1], 10) : undefined;
			await enqueueFilmResolution({
				letterboxdSlug,
				title,
				year: yearFromSlug,
			});
		}
	}

	for (const film of films) {
		if (film.viewCount > 1) {
			await enqueueProcessXp({
				discordId,
				guildId,
				eventType: "rewatch",
				metadata: {
					letterboxdSlug: film.letterboxdSlug,
					viewCount: film.viewCount,
				},
			});
		}
	}

	// Process XP for ratings (sourceJobId for deterministic deduplication)
	if (ratingsUpdated > 0) {
		await enqueueProcessXp({
			discordId,
			guildId,
			eventType: "rating",
			metadata: { count: ratingsUpdated },
			sourceJobId: job.id ? String(job.id) : undefined,
		});
	}

	log.info(
		{ filmsScraped: films.length, ratingsUpdated },
		"Completed user scrape job",
	);
	return {
		filmsScraped: films.length,
		ratingsUpdated,
	};
}
