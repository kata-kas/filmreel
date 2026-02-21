import { beforeAll, describe, expect, it } from "vitest";
import { config } from "../config/index.js";
import {
	extractLetterboxdUsername,
	scrapeList,
	scrapeUserFilms,
} from "./letterboxd.js";

const runLive = config.LIVE_SCRAPER_TESTS ?? false;
const TEST_USERNAME = config.LETTERBOXD_TEST_USERNAME;
const TEST_LIST_URL =
	config.LETTERBOXD_TEST_LIST_URL ||
	`https://letterboxd.com/${TEST_USERNAME}/lists/`;

describe.runIf(runLive)("Letterboxd Scraper (live)", () => {
	let cachedFilms: Awaited<ReturnType<typeof scrapeUserFilms>> = [];

	beforeAll(async () => {
		cachedFilms = await scrapeUserFilms(TEST_USERNAME, {
			full: false,
			maxPages: 3,
		});
	}, 180000);

	describe("scrapeUserFilms", () => {
		it("returns films with expected shape", async () => {
			const films = cachedFilms;

			expect(Array.isArray(films)).toBe(true);

			if (films.length > 0) {
				const film = films[0];
				expect(typeof film.letterboxdSlug).toBe("string");
				expect(film.letterboxdSlug.length).toBeGreaterThan(0);
				expect(typeof film.title).toBe("string");
				expect(film.title.length).toBeGreaterThan(0);
				expect(typeof film.viewCount).toBe("number");
				expect(film.viewCount).toBeGreaterThanOrEqual(1);
			}
		}, 180000);

		it("extracts valid film slugs", () => {
			const films = cachedFilms;

			for (const film of films) {
				expect(film.letterboxdSlug).toMatch(/^[a-z0-9_-]+$/);
			}
		}, 180000);
	});

	describe("scrapeList", () => {
		it("returns films from a public list URL", async () => {
			const films = await scrapeList(TEST_LIST_URL);
			expect(Array.isArray(films)).toBe(true);
		}, 120000);
	});

	describe("extractLetterboxdUsername", () => {
		it("extracts username from profile URL", () => {
			expect(
				extractLetterboxdUsername(`https://letterboxd.com/${TEST_USERNAME}/`),
			).toBe(TEST_USERNAME);
		});
	});
});
