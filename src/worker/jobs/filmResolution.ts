import type { Job } from "bullmq";
import { config } from "../../config/index.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import type { ResolveFilmJob } from "../../queue/definitions.js";
import { enqueueDelayedFilmResolution } from "../../queue/enqueue.js";
import { LetterboxdProvider } from "../../scraper/letterboxdProvider.js";
import { getTMDBCache } from "../../tmdb/cache.js";
import { createTMDBClient } from "../../tmdb/client.js";
import { TMDBProvider } from "../../tmdb/provider.js";
import type { FilmMetadata } from "../../types/provider.js";

const log = logger.child({ module: "FilmResolution" });

function cleanTitle(title: string): string {
	// Strip "Poster for " prefix and " (YYYY)" suffix from alt text
	return title
		.replace(/^Poster for /, "")
		.replace(/\s*\(\d{4}\)$/, "")
		.trim();
}

/**
 * Merge metadata from multiple providers.
 * First provider to supply a field wins (earlier providers are preferred).
 */
function mergeMetadata(
	results: Array<{ provider: string; metadata: FilmMetadata }>,
): FilmMetadata {
	const merged: FilmMetadata = {};

	for (const result of results) {
		const metadata = result.metadata;
		for (const key of Object.keys(metadata) as Array<keyof FilmMetadata>) {
			const value = metadata[key];
			if (value !== undefined && merged[key] === undefined) {
				// Type-safe assignment - we know the key exists in FilmMetadata
				(merged as Record<keyof FilmMetadata, unknown>)[key] = value;
			}
		}
	}

	return merged;
}

export async function processFilmResolution(job: Job<ResolveFilmJob>): Promise<{
	success: boolean;
	providerIds: Record<string, string | undefined>;
}> {
	let { letterboxdSlug, title, year } = job.data;

	// Clean title if it was scraped from alt text (e.g., "Poster for Film Name (2020)")
	const cleanedTitle = cleanTitle(title);
	if (cleanedTitle !== title) {
		log.info({ title, cleanedTitle }, "Cleaned title");
		title = cleanedTitle;
	}

	log.info({ title, year, letterboxdSlug }, "Resolving film");

	// Verify the film row exists before doing any work
	const existingFilm = await prisma.film.findUnique({
		where: { letterboxdSlug },
		select: { letterboxdSlug: true },
	});

	if (!existingFilm) {
		// Non-retryable — the film row doesn't exist
		log.error({ letterboxdSlug }, "Film row not found");
		return { success: false, providerIds: {} };
	}

	// Initialize providers
	const client = createTMDBClient(config.TMDB_API_KEY);
	const cache = getTMDBCache();

	const tmdbProvider = new TMDBProvider(client, cache);
	const letterboxdProvider = new LetterboxdProvider();

	const providerResults: Array<{
		provider: string;
		metadata: FilmMetadata;
		providerId?: string;
	}> = [];
	const providerStatuses: Array<{
		provider: string;
		success: boolean;
		providerId?: string;
		error?: string;
	}> = [];

	// Step 1: Try TMDB first
	log.info({ title, year, letterboxdSlug }, "Trying TMDB");
	try {
		const tmdbResult = await tmdbProvider.resolve(
			letterboxdSlug,
			cleanedTitle,
			year,
		);

		if (tmdbResult.success && tmdbResult.metadata) {
			providerResults.push({
				provider: tmdbProvider.name,
				metadata: tmdbResult.metadata,
				providerId: tmdbResult.providerId,
			});
			providerStatuses.push({
				provider: tmdbProvider.name,
				success: true,
				providerId: tmdbResult.providerId,
			});
			log.info({ title, letterboxdSlug }, "TMDB succeeded");
		} else {
			providerStatuses.push({
				provider: tmdbProvider.name,
				success: false,
				error: tmdbResult.error,
			});
			log.info({ title, error: tmdbResult.error }, "TMDB failed");
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		providerStatuses.push({
			provider: tmdbProvider.name,
			success: false,
			error: errorMessage,
		});
		log.error(
			{ title, letterboxdSlug, error: errorMessage },
			"TMDB threw error",
		);
	}

	// Step 2: Only try Letterboxd if TMDB failed
	const tmdbFailed = !providerStatuses.find((s) => s.provider === "tmdb")
		?.success;

	if (tmdbFailed) {
		log.info({ title, year, letterboxdSlug }, "TMDB failed, trying Letterboxd");
		try {
			const letterboxdResult = await letterboxdProvider.resolve(
				letterboxdSlug,
				cleanedTitle,
				year,
			);

			if (letterboxdResult.success && letterboxdResult.metadata) {
				providerResults.push({
					provider: letterboxdProvider.name,
					metadata: letterboxdResult.metadata,
					providerId: letterboxdResult.providerId,
				});
				providerStatuses.push({
					provider: letterboxdProvider.name,
					success: true,
					providerId: letterboxdResult.providerId,
				});
				log.info({ title }, "Letterboxd succeeded");
			} else {
				providerStatuses.push({
					provider: letterboxdProvider.name,
					success: false,
					error: letterboxdResult.error,
				});
				log.info(
					{ title, letterboxdSlug, error: letterboxdResult.error },
					"Letterboxd failed",
				);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			providerStatuses.push({
				provider: letterboxdProvider.name,
				success: false,
				error: errorMessage,
			});
			log.error({ title, error: errorMessage }, "Letterboxd threw error");
		}
	}

	// Merge metadata from all successful providers
	const mergedMetadata = mergeMetadata(providerResults);

	// Build update data for Film table
	const filmUpdateData: {
		title?: string;
		year?: number;
		director?: string[];
		country?: string[];
		runtime?: number;
		genres?: string[];
		posterPath?: string;
		letterboxdRating?: number;
		letterboxdVotes?: number;
	} = {};

	// Only update title if we cleaned it
	if (cleanedTitle !== job.data.title) {
		filmUpdateData.title = cleanedTitle;
	}

	// Map merged metadata to Film fields
	if (mergedMetadata.year !== undefined) {
		filmUpdateData.year = mergedMetadata.year;
	}
	if (mergedMetadata.director !== undefined) {
		filmUpdateData.director = mergedMetadata.director;
	}
	if (mergedMetadata.country !== undefined) {
		filmUpdateData.country = mergedMetadata.country;
	}
	if (mergedMetadata.runtime !== undefined) {
		filmUpdateData.runtime = mergedMetadata.runtime;
	}
	if (mergedMetadata.genres !== undefined) {
		filmUpdateData.genres = mergedMetadata.genres;
	}
	if (mergedMetadata.posterPath !== undefined) {
		filmUpdateData.posterPath = mergedMetadata.posterPath;
	}
	if (mergedMetadata.letterboxdRating !== undefined) {
		filmUpdateData.letterboxdRating = mergedMetadata.letterboxdRating;
	}
	if (mergedMetadata.letterboxdVotes !== undefined) {
		filmUpdateData.letterboxdVotes = mergedMetadata.letterboxdVotes;
	}

	// Atomic transaction: film update + all FilmProvider writes (+ retry increment if all failed)
	const allFailed = providerStatuses.every((s) => !s.success);

	let shouldEnqueueRetry = false;
	let newRetryCount = 0;

	await prisma.$transaction(async (tx) => {
		await tx.film.update({
			where: { letterboxdSlug },
			data: filmUpdateData,
		});

		for (const status of providerStatuses) {
			const existingProvider = await tx.filmProvider.findUnique({
				where: {
					letterboxdSlug_provider: {
						letterboxdSlug,
						provider: status.provider,
					},
				},
			});

			if (existingProvider) {
				await tx.filmProvider.update({
					where: { id: existingProvider.id },
					data: {
						providerId: status.providerId ?? existingProvider.providerId,
						resolvedAt: status.success
							? new Date()
							: existingProvider.resolvedAt,
						failed: !status.success,
						failedAt: !status.success ? new Date() : existingProvider.failedAt,
					},
				});
			} else {
				await tx.filmProvider.create({
					data: {
						letterboxdSlug,
						provider: status.provider,
						providerId: status.providerId ?? null,
						resolvedAt: status.success ? new Date() : null,
						failed: !status.success,
						failedAt: !status.success ? new Date() : null,
						retryCount: 0,
					},
				});
			}
		}

		if (allFailed) {
			// Atomic increment only when under limit; enqueue decision based on whether we actually incremented
			const result = await tx.$queryRaw<
				Array<{ retryCount: number }>
			>`UPDATE "FilmProvider" SET "retryCount" = "retryCount" + 1
			  WHERE "letterboxdSlug" = ${letterboxdSlug}
			    AND "retryCount" < ${config.FILM_RESOLUTION_ATTEMPTS}
			  RETURNING "retryCount"`;
			shouldEnqueueRetry = Array.isArray(result) && result.length > 0;
			if (shouldEnqueueRetry && result.length > 0) {
				newRetryCount = Math.max(...result.map((r) => r.retryCount)) ?? 0;
			}
		}
	});

	if (allFailed) {
		log.info({ title }, "All providers failed");

		if (shouldEnqueueRetry) {
			await enqueueDelayedFilmResolution(
				{ letterboxdSlug, title: cleanedTitle, year },
				config.FILM_RESOLUTION_BACKOFF_MS,
			);
			log.info({ title, retryCount: newRetryCount }, "Scheduled retry");
		} else {
			log.info(
				{ title, retryCount: config.FILM_RESOLUTION_ATTEMPTS },
				"Max retries reached",
			);
		}

		return { success: false, providerIds: {} };
	}

	// Build provider IDs result
	const providerIds: Record<string, string | undefined> = {};
	for (const status of providerStatuses) {
		if (status.success && status.providerId) {
			providerIds[status.provider] = status.providerId;
		}
	}

	log.info(
		{ title, providerCount: providerResults.length },
		"Successfully resolved",
	);
	return { success: true, providerIds };
}
