import type { Decimal } from "@prisma/client/runtime/client";

export interface ScrapedFilm {
	letterboxdSlug: string;
	title: string;
	rating: Decimal | null;
	watchedDate: Date | null;
	viewCount: number;
}

export interface TMDBMovie {
	id: number;
	title: string;
	release_date?: string;
	year?: number;
}

export interface TMDBMovieDetails extends TMDBMovie {
	runtime?: number;
	poster_path?: string;
	overview?: string;
	genres?: { id: number; name: string }[];
	production_companies?: { id: number; name: string }[];
	origin_country?: string[];
}

export interface TMDBPerson {
	id: number;
	name: string;
	known_for_department?: string;
}

export interface TMDBGenre {
	id: number;
	name: string;
}

export interface TMDBCompany {
	id: number;
	name: string;
}

export interface LookupResult {
	type: "person" | "genre" | "country" | "company";
	tmdbId?: number;
	isoCode?: string;
	canonicalName: string;
}

export interface PaginatedData<T> {
	data: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

export interface LeaderboardEntry {
	rank: number;
	discordId: string;
	nickname?: string | null;
	value: number;
	secondaryValue?: number;
}

export interface FilmWithRating {
	letterboxdSlug: string;
	title: string;
	year: number | null;
	rating: Decimal | null;
	watchedDate: Date | null;
	viewCount: number;
}

export interface ComparisonResult {
	commonFilms: number;
	avgDifference: number;
	mostAgreed: FilmComparison[];
	mostDisagreed: FilmComparison[];
}

export interface FilmComparison {
	letterboxdSlug: string;
	title: string;
	user1Rating: Decimal;
	user2Rating: Decimal;
	difference: number;
}

export interface XpWeights {
	rating: number;
	rewatch: number;
	list_complete: number;
	season_participation: number;
	streak: number;
}

export interface SeasonStats {
	filmsWatched: number;
	totalRuntime: number;
	avgRatingTo: number;
	avgRatingFrom: number;
}

// Re-export provider types for convenience
export type {
	FilmMetadata,
	FilmMetadataProvider,
	ProviderResult,
} from "./provider.js";
