/**
 * Film metadata that can be provided by any metadata provider.
 * All fields are optional - providers can return partial data.
 */
export interface FilmMetadata {
	title?: string;
	year?: number;
	director?: string[];
	country?: string[];
	runtime?: number;
	genres?: string[];
	posterPath?: string;
	letterboxdRating?: number;
	letterboxdVotes?: number;
}

/**
 * Result returned by a provider resolution attempt.
 */
export interface ProviderResult {
	/** Whether the resolution was successful */
	success: boolean;
	/** The resolved metadata (partial or complete) */
	metadata?: FilmMetadata;
	/** The provider-specific ID for this film (e.g., TMDB movie ID) */
	providerId?: string;
	/** Error message if resolution failed */
	error?: string;
}

/**
 * Interface that all film metadata providers must implement.
 * This allows TMDB, Letterboxd, and future providers to be used interchangeably.
 */
export interface FilmMetadataProvider {
	/** Unique provider name (e.g., 'tmdb', 'letterboxd') */
	readonly name: string;

	/**
	 * Attempt to resolve metadata for a film.
	 * @param slug - The Letterboxd film slug (e.g., 'inception-2010')
	 * @param title - The film title
	 * @param year - Optional release year
	 * @returns ProviderResult with metadata on success, or error info on failure
	 */
	resolve(slug: string, title: string, year?: number): Promise<ProviderResult>;
}
