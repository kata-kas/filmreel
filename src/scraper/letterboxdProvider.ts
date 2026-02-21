import * as cheerio from "cheerio";
import { logger } from "../logger.js";
import type {
	FilmMetadata,
	FilmMetadataProvider,
	ProviderResult,
} from "../types/provider.js";
import { scrapePage } from "./browser.js";
import { FILM_DETAIL_SELECTORS } from "./selectors.js";

const log = logger.child({ module: "LetterboxdProvider" });
const BASE_URL = "https://letterboxd.com";

/**
 * Extract year from Letterboxd slug (e.g., "inception-2010" -> 2010)
 */
function extractYearFromSlug(slug: string): number | undefined {
	const match = slug.match(/-([0-9]{4})$/);
	if (match) {
		const year = parseInt(match[1], 10);
		if (!Number.isNaN(year) && year >= 1890 && year <= 2100) {
			return year;
		}
	}
	return undefined;
}

/**
 * Parse runtime text like "148 mins" or "2h 28m" to minutes
 */
function parseRuntime(runtimeText: string): number | undefined {
	// Try "148 mins" format
	const minsMatch = runtimeText.match(/(\d+)\s*mins?/i);
	if (minsMatch) {
		const runtime = parseInt(minsMatch[1], 10);
		if (!Number.isNaN(runtime)) {
			return runtime;
		}
	}

	// Try "2h 28m" format
	const hoursMatch = runtimeText.match(/(\d+)h\s*(\d+)m/i);
	if (hoursMatch) {
		const hours = parseInt(hoursMatch[1], 10);
		const minutes = parseInt(hoursMatch[2], 10);
		if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
			return hours * 60 + minutes;
		}
	}

	return undefined;
}

export class LetterboxdProvider implements FilmMetadataProvider {
	readonly name = "letterboxd";

	async resolve(
		slug: string,
		_title: string,
		_year?: number,
	): Promise<ProviderResult> {
		try {
			const url = `${BASE_URL}/film/${slug}/`;
			log.info({ slug, url }, "Navigating to film");

			const html = await scrapePage(url);
			const $ = cheerio.load(html);

			const metadata: FilmMetadata = {};

			// Extract title
			const titleText = $(FILM_DETAIL_SELECTORS.TITLE).first().text().trim();
			if (titleText) {
				metadata.title = titleText;
			}

			// Extract year from page
			const yearText = $(FILM_DETAIL_SELECTORS.YEAR).first().text().trim();
			if (yearText) {
				const year = parseInt(yearText, 10);
				if (!Number.isNaN(year)) {
					metadata.year = year;
				}
			}

			// Fallback: extract year from slug
			if (metadata.year === undefined) {
				const yearFromSlug = extractYearFromSlug(slug);
				if (yearFromSlug) {
					metadata.year = yearFromSlug;
				}
			}

			// Extract director(s)
			const directors: string[] = [];
			$(FILM_DETAIL_SELECTORS.DIRECTOR).each((_, elem) => {
				const director = $(elem).text().trim();
				if (director && !directors.includes(director)) {
					directors.push(director);
				}
			});
			if (directors.length > 0) {
				metadata.director = directors;
			}

			// Extract country/countries
			const countries: string[] = [];
			$(FILM_DETAIL_SELECTORS.COUNTRY).each((_, elem) => {
				const country = $(elem).text().trim();
				if (country && !countries.includes(country)) {
					countries.push(country);
				}
			});
			if (countries.length > 0) {
				metadata.country = countries;
			}

			// Extract genres
			const genres: string[] = [];
			$(FILM_DETAIL_SELECTORS.GENRES).each((_, elem) => {
				const genre = $(elem).text().trim();
				if (genre && !genres.includes(genre)) {
					genres.push(genre);
				}
			});
			if (genres.length > 0) {
				metadata.genres = genres;
			}

			// Extract runtime
			const runtimeText = $(FILM_DETAIL_SELECTORS.RUNTIME)
				.first()
				.text()
				.trim();
			if (runtimeText) {
				const runtime = parseRuntime(runtimeText);
				if (runtime !== undefined) {
					metadata.runtime = runtime;
				}
			}

			// Extract average rating from meta tag
			const ratingMeta = $(FILM_DETAIL_SELECTORS.AVG_RATING_META).attr(
				"content",
			);
			if (ratingMeta) {
				const ratingMatch = ratingMeta.match(/([\d.]+)/);
				if (ratingMatch) {
					const rating = parseFloat(ratingMatch[1]);
					if (!Number.isNaN(rating) && rating > 0 && rating <= 5) {
						metadata.letterboxdRating = rating;
					}
				}
			}

			// Fallback: extract from display
			if (metadata.letterboxdRating === undefined) {
				const ratingText = $(FILM_DETAIL_SELECTORS.AVG_RATING_DISPLAY)
					.first()
					.text()
					.trim();
				if (ratingText) {
					const rating = parseFloat(ratingText);
					if (!Number.isNaN(rating) && rating > 0 && rating <= 5) {
						metadata.letterboxdRating = rating;
					}
				}
			}

			// Extract total ratings count from meta tag
			const ratingsMeta = $(FILM_DETAIL_SELECTORS.TOTAL_RATINGS_META).attr(
				"content",
			);
			if (ratingsMeta) {
				const ratingsMatch = ratingsMeta.match(/([\d,]+)/);
				if (ratingsMatch) {
					const votes = parseInt(ratingsMatch[1].replace(/,/g, ""), 10);
					if (!Number.isNaN(votes)) {
						metadata.letterboxdVotes = votes;
					}
				}
			}

			// Extract poster URL
			const posterMeta = $(FILM_DETAIL_SELECTORS.POSTER_META).attr("content");
			if (posterMeta) {
				metadata.posterPath = posterMeta;
			} else {
				const posterImg = $(FILM_DETAIL_SELECTORS.POSTER_IMG)
					.first()
					.attr("src");
				if (posterImg) {
					metadata.posterPath = posterImg;
				}
			}

			// Log what we extracted
			const extractedFields = Object.keys(metadata);
			if (extractedFields.length > 0) {
				log.info({ slug, extractedFields }, "Extracted metadata");
			} else {
				log.info({ slug }, "Page loaded but no metadata found");
			}

			// Always return success if we loaded the page
			// This prevents films from getting stuck in retry loops
			return {
				success: true,
				metadata,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			log.error({ slug, error }, "Error resolving film");
			return {
				success: false,
				error: errorMessage,
			};
		}
	}
}
