import { config } from "../config/index.js";
import { logger } from "../logger.js";
import type {
	TMDBCompany,
	TMDBGenre,
	TMDBMovie,
	TMDBMovieDetails,
	TMDBPerson,
} from "../types/index.js";

const log = logger.child({ module: "TMDB" });
const BASE_URL = "https://api.themoviedb.org/3";

interface TokenBucket {
	tokens: number;
	lastRefill: number;
}

class TMDBClient {
	private apiKey: string;
	private bucket: TokenBucket;
	private readonly maxTokens: number;
	private readonly refillInterval: number;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
		this.maxTokens = config.TMDB_RATE_LIMIT_MAX_TOKENS;
		this.refillInterval = config.TMDB_RATE_LIMIT_REFILL_MS;
		this.bucket = {
			tokens: this.maxTokens,
			lastRefill: Date.now(),
		};
	}

	private async waitForToken(): Promise<void> {
		this.refillTokens();

		if (this.bucket.tokens >= 1) {
			this.bucket.tokens--;
			return;
		}

		// Wait until next refill
		const timeUntilRefill =
			this.refillInterval - (Date.now() - this.bucket.lastRefill);
		await new Promise((resolve) => setTimeout(resolve, timeUntilRefill));

		this.refillTokens();
		this.bucket.tokens--;
	}

	private refillTokens(): void {
		const now = Date.now();
		const timePassed = now - this.bucket.lastRefill;
		const tokensToAdd =
			Math.floor(timePassed / this.refillInterval) * this.maxTokens;

		if (tokensToAdd > 0) {
			this.bucket.tokens = Math.min(
				this.maxTokens,
				this.bucket.tokens + tokensToAdd,
			);
			this.bucket.lastRefill = now;
		}
	}

	private async fetch<T>(
		endpoint: string,
		params: Record<string, string> = {},
	): Promise<T> {
		await this.waitForToken();

		const url = new URL(`${BASE_URL}${endpoint}`);
		url.searchParams.append("api_key", this.apiKey);

		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null) {
				url.searchParams.append(key, value);
			}
		}

		log.info(
			{ url: url.toString().replace(this.apiKey, "***") },
			"Calling TMDB API",
		);

		const response = await fetch(url.toString());

		if (!response.ok) {
			const errorText = await response.text().catch(() => "Unknown error");
			log.error(
				{ status: response.status, statusText: response.statusText, errorText },
				"TMDB API error",
			);
			if (response.status === 429) {
				// Rate limited - wait and retry once
				await new Promise((resolve) =>
					setTimeout(resolve, config.TMDB_RATE_LIMIT_RETRY_DELAY_MS),
				);
				return this.fetch(endpoint, params);
			}
			throw new Error(
				`TMDB API error: ${response.status} ${response.statusText} - ${errorText}`,
			);
		}

		return response.json() as Promise<T>;
	}

	async searchMovie(title: string, year?: number): Promise<TMDBMovie | null> {
		interface SearchResponse {
			results: Array<{
				id: number;
				title: string;
				release_date?: string;
			}>;
		}

		const params: Record<string, string> = {
			query: title,
			include_adult: "false",
		};

		if (year) {
			params.year = year.toString();
		}

		log.info({ title, year }, "Searching movie");

		try {
			const data = await this.fetch<SearchResponse>("/search/movie", params);
			log.info(
				{ title, year, resultCount: data.results.length },
				"Found results",
			);

			if (data.results.length === 0) {
				return null;
			}

			// Log first 3 results for debugging
			data.results.slice(0, 3).forEach((r, i) => {
				log.info(
					{ rank: i + 1, title: r.title, releaseDate: r.release_date },
					"Candidate result",
				);
			});

			const movie = data.results[0];
			log.info(
				{
					title: movie.title,
					releaseDate: movie.release_date,
					tmdbId: movie.id,
				},
				"Selected result",
			);
			return {
				id: movie.id,
				title: movie.title,
				release_date: movie.release_date,
				year: movie.release_date
					? parseInt(movie.release_date.split("-")[0], 10)
					: undefined,
			};
		} catch (error) {
			log.error({ title, year, error }, "TMDB movie search failed");
			throw error;
		}
	}

	async getMovieDetails(tmdbId: number): Promise<TMDBMovieDetails> {
		const data = await this.fetch<{
			id: number;
			title: string;
			release_date?: string;
			runtime?: number;
			poster_path?: string;
			overview?: string;
			genres?: { id: number; name: string }[];
			production_companies?: { id: number; name: string }[];
			origin_country?: string[];
		}>(`/movie/${tmdbId}`);

		return {
			id: data.id,
			title: data.title,
			release_date: data.release_date,
			year: data.release_date
				? parseInt(data.release_date.split("-")[0], 10)
				: undefined,
			runtime: data.runtime,
			poster_path: data.poster_path,
			overview: data.overview,
			genres: data.genres,
			production_companies: data.production_companies,
			origin_country: data.origin_country,
		};
	}

	async searchPerson(name: string): Promise<TMDBPerson | null> {
		interface SearchResponse {
			results: Array<{
				id: number;
				name: string;
				known_for_department?: string;
			}>;
		}

		const data = await this.fetch<SearchResponse>("/search/person", {
			query: name,
			include_adult: "false",
		});

		if (data.results.length === 0) {
			return null;
		}

		const person = data.results[0];
		return {
			id: person.id,
			name: person.name,
			known_for_department: person.known_for_department,
		};
	}

	async getGenres(): Promise<TMDBGenre[]> {
		interface GenresResponse {
			genres: TMDBGenre[];
		}

		const data = await this.fetch<GenresResponse>("/genre/movie/list");
		return data.genres;
	}

	async searchCompany(name: string): Promise<TMDBCompany | null> {
		interface SearchResponse {
			results: Array<{
				id: number;
				name: string;
			}>;
		}

		const data = await this.fetch<SearchResponse>("/search/company", {
			query: name,
		});

		if (data.results.length === 0) {
			return null;
		}

		const company = data.results[0];
		return {
			id: company.id,
			name: company.name,
		};
	}

	async getMovieCredits(tmdbId: number): Promise<{
		cast: Array<{
			id: number;
			name: string;
			character?: string;
			order: number;
		}>;
		crew: Array<{ id: number; name: string; job: string; department: string }>;
	}> {
		return this.fetch(`/movie/${tmdbId}/credits`);
	}
}

export function createTMDBClient(apiKey: string): TMDBClient {
	return new TMDBClient(apiKey);
}
