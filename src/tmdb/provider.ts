import { config } from "../config/index.js";
import { logger } from "../logger.js";
import type { TMDBMovie, TMDBMovieDetails } from "../types/index.js";
import type {
	FilmMetadata,
	FilmMetadataProvider,
	ProviderResult,
} from "../types/provider.js";
import type { TMDBCache } from "./cache.js";
import type { createTMDBClient } from "./client.js";

const log = logger.child({ module: "TMDBProvider" });

function levenshteinDistance(str1: string, str2: string): number {
	const rows = str2.length + 1;
	const cols = str1.length + 1;

	const matrix: number[][] = Array.from({ length: rows }, (_, i) =>
		Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
	);

	for (let i = 1; i < rows; i++) {
		for (let j = 1; j < cols; j++) {
			const row = matrix[i];
			const prevRow = matrix[i - 1];

			if (row === undefined || prevRow === undefined) continue;

			const charStr2 = str2[i - 1];
			const charStr1 = str1[j - 1];

			if (charStr2 === charStr1) {
				row[j] = prevRow[j - 1] ?? 0;
			} else {
				row[j] = Math.min(
					(prevRow[j - 1] ?? 0) + 1,
					(row[j - 1] ?? 0) + 1,
					(prevRow[j] ?? 0) + 1,
				);
			}
		}
	}

	const lastRow = matrix[str2.length];
	return lastRow?.[str1.length] ?? 0;
}

function similarity(str1: string, str2: string): number {
	const s1 = str1.toLowerCase().replace(/[^a-z0-9]/g, "");
	const s2 = str2.toLowerCase().replace(/[^a-z0-9]/g, "");

	if (s1 === s2) return 1;
	if (s1.length === 0 && s2.length === 0) return 1;

	const longer = s1.length >= s2.length ? s1 : s2;
	const shorter = s1.length >= s2.length ? s2 : s1;

	const distance = levenshteinDistance(longer, shorter);
	return (longer.length - distance) / longer.length;
}

export class TMDBProvider implements FilmMetadataProvider {
	readonly name = "tmdb";
	private client: ReturnType<typeof createTMDBClient>;
	private cache: TMDBCache;

	constructor(client: ReturnType<typeof createTMDBClient>, cache: TMDBCache) {
		this.client = client;
		this.cache = cache;
	}

	async resolve(
		_slug: string,
		title: string,
		year?: number,
	): Promise<ProviderResult> {
		try {
			// Step 1: Try exact match with year
			let movie = await this.resolveWithYear(title, year);

			// Step 2: Fuzzy fallback without year
			if (!movie && year) {
				movie = await this.resolveWithFuzzyFallback(title);
			}

			if (!movie) {
				return {
					success: false,
					error: "No matching movie found on TMDB",
				};
			}

			// Fetch full details to get complete metadata
			const details = await this.fetchAndCacheDetails(movie.id);

			const metadata: FilmMetadata = {
				title: details?.title ?? movie.title,
				year: details?.year ?? movie.year ?? year,
				runtime: details?.runtime,
				posterPath: details?.poster_path ?? undefined,
				genres: details?.genres?.map((g) => g.name),
				country: details?.origin_country,
			};

			return {
				success: true,
				metadata,
				providerId: movie.id.toString(),
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			log.error({ title, year, error: errorMessage }, "Error resolving movie");
			return {
				success: false,
				error: errorMessage,
			};
		}
	}

	private async resolveWithYear(
		title: string,
		year: number | undefined,
	): Promise<TMDBMovie | null> {
		const cacheKey = `${title}:${year ?? "no-year"}`;
		const cached = await this.cache.get<TMDBMovie>("movie_search", cacheKey);
		if (cached) return cached;

		const movie = await this.client.searchMovie(title, year);
		if (movie) {
			await this.cache.set("movie_search", cacheKey, movie);
		}

		return movie;
	}

	private async resolveWithFuzzyFallback(
		title: string,
	): Promise<TMDBMovie | null> {
		const cacheKey = `${title}:no-year`;
		const cached = await this.cache.get<TMDBMovie>("movie_search", cacheKey);
		if (cached) return cached;

		const movie = await this.client.searchMovie(title);
		if (!movie) return null;

		const sim = similarity(title, movie.title);
		if (sim <= config.TMDB_FUZZY_SIMILARITY_THRESHOLD) return null;

		await this.cache.set("movie_search", cacheKey, movie);
		return movie;
	}

	private async fetchAndCacheDetails(
		tmdbId: number,
	): Promise<TMDBMovieDetails | null> {
		const cached = await this.cache.get<TMDBMovieDetails>("movie", tmdbId);
		if (cached) return cached;

		try {
			const details = await this.client.getMovieDetails(tmdbId);
			await this.cache.set("movie", tmdbId, details);
			return details;
		} catch (error) {
			log.warn({ tmdbId, error }, "Failed to fetch TMDB details");
			return null;
		}
	}
}
