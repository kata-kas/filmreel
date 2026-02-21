import { config } from "../config/index.js";
import type { LookupResult, TMDBGenre } from "../types/index.js";
import { getTMDBCache } from "./cache.js";
import { createTMDBClient } from "./client.js";

// ISO 3166-1 alpha-2 country codes with common names
const COUNTRIES: Record<string, string[]> = {
	US: ["United States", "USA", "United States of America"],
	GB: ["United Kingdom", "UK", "Great Britain", "England"],
	CA: ["Canada"],
	AU: ["Australia"],
	FR: ["France"],
	DE: ["Germany"],
	JP: ["Japan"],
	IN: ["India"],
	IT: ["Italy"],
	ES: ["Spain"],
	MX: ["Mexico"],
	KR: ["South Korea", "Korea"],
	BR: ["Brazil"],
	RU: ["Russia", "Russian Federation"],
	CN: ["China"],
	SE: ["Sweden"],
	DK: ["Denmark"],
	NO: ["Norway"],
	FI: ["Finland"],
	NL: ["Netherlands", "Holland"],
	BE: ["Belgium"],
	CH: ["Switzerland"],
	AT: ["Austria"],
	PL: ["Poland"],
	IE: ["Ireland"],
	NZ: ["New Zealand"],
	ZA: ["South Africa"],
	AR: ["Argentina"],
	CL: ["Chile"],
	CO: ["Colombia"],
	PT: ["Portugal"],
	GR: ["Greece"],
	TR: ["Turkey"],
	IR: ["Iran"],
	IL: ["Israel"],
	EG: ["Egypt"],
	NG: ["Nigeria"],
	TH: ["Thailand"],
	ID: ["Indonesia"],
	MY: ["Malaysia"],
	PH: ["Philippines"],
	VN: ["Vietnam"],
	TW: ["Taiwan"],
	HK: ["Hong Kong"],
};

export class TMDBResolver {
	private client;
	private cache;
	private genres: TMDBGenre[] | null = null;

	constructor() {
		this.client = createTMDBClient(config.TMDB_API_KEY);
		this.cache = getTMDBCache();
	}

	async resolve(lookup: string): Promise<LookupResult> {
		const normalized = lookup.toLowerCase().trim();

		// 1. Try person search
		const personResult = await this.tryPersonSearch(normalized);
		if (personResult) return personResult;

		// 2. Try genre match
		const genreResult = await this.tryGenreMatch(normalized);
		if (genreResult) return genreResult;

		// 3. Try country match
		const countryResult = this.tryCountryMatch(normalized);
		if (countryResult) return countryResult;

		// 4. Try company search
		const companyResult = await this.tryCompanySearch(normalized);
		if (companyResult) return companyResult;

		throw new Error(`Could not resolve "${lookup}" to any known entity`);
	}

	private async tryPersonSearch(
		normalized: string,
	): Promise<LookupResult | null> {
		const cacheKey = `person:${normalized}`;

		// Check cache
		const cached = await this.cache.get<LookupResult>("search", cacheKey);
		if (cached) return cached;

		// Search TMDB
		const person = await this.client.searchPerson(normalized);

		if (person) {
			const result: LookupResult = {
				type: "person",
				tmdbId: person.id,
				canonicalName: person.name,
			};
			await this.cache.set("search", cacheKey, result);
			return result;
		}

		return null;
	}

	private async tryGenreMatch(
		normalized: string,
	): Promise<LookupResult | null> {
		// Load genres if not cached
		if (!this.genres) {
			const cacheKey = "all_genres";
			const cached = await this.cache.get<TMDBGenre[]>("genre", cacheKey);

			if (cached) {
				this.genres = cached;
			} else {
				this.genres = await this.client.getGenres();
				await this.cache.set("genre", cacheKey, this.genres);
			}
		}

		// Find matching genre
		const genre = this.genres.find(
			(g) =>
				g.name.toLowerCase() === normalized ||
				g.name.toLowerCase().includes(normalized),
		);

		if (genre) {
			return {
				type: "genre",
				tmdbId: genre.id,
				canonicalName: genre.name,
			};
		}

		return null;
	}

	private tryCountryMatch(normalized: string): LookupResult | null {
		// Direct ISO code match
		if (COUNTRIES[normalized.toUpperCase()]) {
			return {
				type: "country",
				isoCode: normalized.toUpperCase(),
				canonicalName: COUNTRIES[normalized.toUpperCase()][0],
			};
		}

		// Name match
		for (const [isoCode, names] of Object.entries(COUNTRIES)) {
			if (
				names.some(
					(name) =>
						name.toLowerCase() === normalized ||
						name.toLowerCase().includes(normalized),
				)
			) {
				return {
					type: "country",
					isoCode,
					canonicalName: names[0],
				};
			}
		}

		return null;
	}

	private async tryCompanySearch(
		normalized: string,
	): Promise<LookupResult | null> {
		const cacheKey = `company:${normalized}`;

		// Check cache
		const cached = await this.cache.get<LookupResult>("search", cacheKey);
		if (cached) return cached;

		// Search TMDB
		const company = await this.client.searchCompany(normalized);

		if (company) {
			const result: LookupResult = {
				type: "company",
				tmdbId: company.id,
				canonicalName: company.name,
			};
			await this.cache.set("search", cacheKey, result);
			return result;
		}

		return null;
	}

	async getCachedMovie(tmdbId: number) {
		const cached = await this.cache.get("movie", tmdbId);
		if (cached) return cached;

		const details = await this.client.getMovieDetails(tmdbId);
		await this.cache.set("movie", tmdbId, details);
		return details;
	}

	async searchAndCacheMovie(title: string, year?: number) {
		const cacheKey = `${title}:${year ?? "no-year"}`;

		const cached = await this.cache.get("movie_search", cacheKey);
		if (cached) return cached;

		const movie = await this.client.searchMovie(title, year);
		if (movie) {
			await this.cache.set("movie_search", cacheKey, movie);
		}
		return movie;
	}
}

export function createResolver(): TMDBResolver {
	return new TMDBResolver();
}
