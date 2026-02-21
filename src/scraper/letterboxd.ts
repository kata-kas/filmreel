import { Decimal } from "@prisma/client/runtime/client";
import * as cheerio from "cheerio";
import { config } from "../config/index.js";
import { logger } from "../logger.js";
import type { ScrapedFilm } from "../types/index.js";
import { scrapePage } from "./browser.js";
import { RATING_SELECTORS, USER_FILMS_SELECTORS } from "./selectors.js";

const log = logger.child({ module: "Scraper" });
const BASE_URL = "https://letterboxd.com";

function debugLog(message: string, context?: Record<string, unknown>): void {
	if (config.SCRAPER_DEBUG) {
		log.info(context ?? {}, message);
	}
}

function parseRatingFromClass(classString: string): Decimal | null {
	if (!classString) return null;

	const match = classString.match(RATING_SELECTORS.STAR_CLASS_PATTERN);
	if (match) {
		const value = parseInt(match[1], 10) / 2;
		return new Decimal(value);
	}

	return null;
}

function normalizeSlug(raw: string): string {
	const value = raw.trim();
	if (!value) return "";

	if (value.startsWith("/film/")) {
		const match = value.match(/^\/film\/([^/?#]+)\//);
		return match ? match[1] : "";
	}

	return value.replace(/^film:/, "");
}

export async function scrapeUserFilms(
	username: string,
	options: {
		full?: boolean;
		existingSlugs?: Set<string>;
		maxPages?: number;
	} = {},
): Promise<ScrapedFilm[]> {
	debugLog("Starting scrape for user", { username });
	const { full = false, existingSlugs = new Set(), maxPages } = options;
	const films: ScrapedFilm[] = [];

	// Get first page to determine total pages
	const firstPageUrl = `${BASE_URL}/${username}/films/page/1/`;
	debugLog("Scrape URL", { url: firstPageUrl });

	let totalPages = 1;
	try {
		debugLog("Making request...");
		const html = await scrapePage(firstPageUrl);
		debugLog("Page scraped successfully");
		const $ = cheerio.load(html);

		// Parse films from first page
		const posters = $(USER_FILMS_SELECTORS.FILM_POSTER);
		posters.each((_, elem) => {
			const $elem = $(elem);
			const $dataEl = $elem.find(USER_FILMS_SELECTORS.FILM_ANCHOR);
			const $posterImg = $elem.find(USER_FILMS_SELECTORS.POSTER_IMG);

			const slug = normalizeSlug(
				$dataEl.attr(USER_FILMS_SELECTORS.FILM_SLUG) || "",
			);

			// Try to get title from data-film-name attribute first, then fall back to alt text
			let title = $dataEl.attr(USER_FILMS_SELECTORS.FILM_TITLE) || "";
			if (!title && $posterImg.length) {
				const altText =
					$posterImg.attr(USER_FILMS_SELECTORS.FILM_TITLE_FALLBACK) || "";
				// Strip "Poster for " prefix and " (YYYY)" suffix from alt text
				title = altText
					.replace(/^Poster for /, "")
					.replace(/\s*\(\d{4}\)$/, "");
			}

			const ratingEl = $elem.find(USER_FILMS_SELECTORS.RATING);
			const ratingClass = ratingEl.attr("class") || "";
			const rating = parseRatingFromClass(ratingClass);

			const dateEl = $elem.find(USER_FILMS_SELECTORS.WATCHED_DATE);
			const dateText = dateEl.text().trim();
			const watchedDate = dateText ? new Date(dateText) : null;

			if (!full && existingSlugs.has(slug)) {
				return;
			}

			films.push({
				letterboxdSlug: slug,
				title,
				rating,
				watchedDate:
					watchedDate && !Number.isNaN(watchedDate.getTime())
						? watchedDate
						: null,
				viewCount: 1,
			});
		});

		// Get total pages from pagination
		const lastPageLink = $(".pagination .paginate-page:last-child a");
		if (lastPageLink.length) {
			totalPages = parseInt(lastPageLink.text(), 10) || 1;
		}

		debugLog("Parsed first page", {
			totalPages,
			firstPageFilmCount: posters.length,
		});
	} catch (error) {
		log.error({ username, error }, "Error scraping first page for user");
		throw error;
	}

	debugLog("Total films scraped after first page", {
		username,
		filmCount: films.length,
	});

	// Fetch remaining pages
	let consecutiveExistingPages = 0;

	const pageLimit =
		typeof maxPages === "number" && maxPages > 0
			? Math.min(totalPages, Math.floor(maxPages))
			: totalPages;

	for (let page = 2; page <= pageLimit; page++) {
		const url = `${BASE_URL}/${username}/films/page/${page}/`;

		try {
			const html = await scrapePage(url);
			const $ = cheerio.load(html);

			const posters = $(USER_FILMS_SELECTORS.FILM_POSTER);

			if (posters.length === 0) {
				break;
			}

			let allFilmsExistOnPage = true;

			posters.each((_, elem) => {
				const $elem = $(elem);
				const $dataEl = $elem.find(USER_FILMS_SELECTORS.FILM_ANCHOR);
				const $posterImg = $elem.find(USER_FILMS_SELECTORS.POSTER_IMG);

				const slug = normalizeSlug(
					$dataEl.attr(USER_FILMS_SELECTORS.FILM_SLUG) || "",
				);

				// Try to get title from data-film-name attribute first, then fall back to alt text
				let title = $dataEl.attr(USER_FILMS_SELECTORS.FILM_TITLE) || "";
				if (!title && $posterImg.length) {
					const altText =
						$posterImg.attr(USER_FILMS_SELECTORS.FILM_TITLE_FALLBACK) || "";
					// Strip "Poster for " prefix and " (YYYY)" suffix from alt text
					title = altText
						.replace(/^Poster for /, "")
						.replace(/\s*\(\d{4}\)$/, "");
				}

				const ratingEl = $elem.find(USER_FILMS_SELECTORS.RATING);
				const ratingClass = ratingEl.attr("class") || "";
				const rating = parseRatingFromClass(ratingClass);

				const dateEl = $elem.find(USER_FILMS_SELECTORS.WATCHED_DATE);
				const dateText = dateEl.text().trim();
				const watchedDate = dateText ? new Date(dateText) : null;

				if (!full && existingSlugs.has(slug)) {
					return;
				}

				allFilmsExistOnPage = false;

				films.push({
					letterboxdSlug: slug,
					title,
					rating,
					watchedDate:
						watchedDate && !Number.isNaN(watchedDate.getTime())
							? watchedDate
							: null,
					viewCount: 1,
				});
			});

			if (allFilmsExistOnPage && !full) {
				consecutiveExistingPages++;
				if (consecutiveExistingPages >= 3) {
					debugLog("Stopping early, all films already exist", {
						username,
						page,
					});
					break;
				}
			} else {
				consecutiveExistingPages = 0;
			}
		} catch (error) {
			log.error({ username, page, error }, "Error on page");
			// Continue with next page instead of failing entirely
		}
	}

	debugLog("Finished scrape for user", { username, filmCount: films.length });
	return films;
}

export async function scrapeList(
	listUrl: string,
): Promise<{ slug: string; title: string; position: number }[]> {
	const films: { slug: string; title: string; position: number }[] = [];

	// Extract list path from URL
	const urlMatch = listUrl.match(/letterboxd\.com\/(.+\/list\/[^/]+)/);
	const listPath = urlMatch
		? urlMatch[1]
		: listUrl.replace(/^https:\/\/letterboxd\.com\//, "");

	let page = 1;
	let hasMorePages = true;

	while (hasMorePages && page <= 100) {
		const url = `${BASE_URL}/${listPath}/page/${page}/`;

		try {
			const html = await scrapePage(url);
			const $ = cheerio.load(html);

			const listFilms = $("li.poster-container");

			if (listFilms.length === 0) {
				hasMorePages = false;
				break;
			}

			listFilms.each((index, elem) => {
				const $elem = $(elem);
				const $anchor = $elem.find("div.film-poster");
				const $posterImg = $elem.find("div.film-poster img");

				const slug = normalizeSlug(
					$anchor.attr("data-film-slug") ||
						$anchor.attr("data-item-slug") ||
						"",
				);

				// Try data-film-name first, fall back to cleaned alt text
				let title = $anchor.attr("data-film-name") || "";
				if (!title && $posterImg.length) {
					const altText = $posterImg.attr("alt") || "";
					title = altText
						.replace(/^Poster for /, "")
						.replace(/\s*\(\d{4}\)$/, "");
				}

				const position = (page - 1) * 100 + index + 1;

				films.push({ slug, title, position });
			});

			const hasNextPage =
				$(".pagination .next").length > 0 &&
				!$(".pagination .next").hasClass("disabled");
			if (!hasNextPage) {
				hasMorePages = false;
			} else {
				page++;
			}
		} catch (error) {
			log.error({ page, listUrl, error }, "Error scraping list page");
			hasMorePages = false;
		}
	}

	return films;
}

export function extractLetterboxdUsername(url: string): string | null {
	const match = url.match(/letterboxd\.com\/([^/]+)/);
	return match ? match[1] : null;
}

export function extractListInfo(
	url: string,
): { username: string; listSlug: string } | null {
	const match = url.match(/letterboxd\.com\/([^/]+)\/list\/([^/]+)/);
	if (!match) return null;
	return { username: match[1], listSlug: match[2] };
}
