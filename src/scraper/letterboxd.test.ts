import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./browser.js", () => ({
	scrapePage: vi.fn(),
}));

import { scrapePage } from "./browser.js";
import {
	extractLetterboxdUsername,
	scrapeList,
	scrapeUserFilms,
} from "./letterboxd.js";

const USER_PAGE_1 = `
<ul>
  <li class="griditem">
    <div class="poster film-poster">
      <div data-film-id="1" data-item-slug="dune-part-two" data-film-name="Dune: Part Two"></div>
      <img alt="Poster for Dune: Part Two (2024)" />
    </div>
    <span class="rating rated-8"></span>
    <span class="date">2024-03-01</span>
  </li>
  <li class="griditem">
    <div class="poster film-poster">
      <div data-film-id="2" data-item-slug="inception"></div>
      <img alt="Poster for Inception (2010)" />
    </div>
    <span class="rating rated-9"></span>
    <span class="date">2024-03-02</span>
  </li>
</ul>
<ul class="pagination">
  <li class="paginate-page"><a>1</a></li>
  <li class="paginate-page"><a>2</a></li>
</ul>
`;

const USER_PAGE_2 = `
<ul>
  <li class="griditem">
    <div class="poster film-poster">
      <div data-film-id="3" data-item-slug="parasite" data-film-name="Parasite"></div>
      <img alt="Poster for Parasite (2019)" />
    </div>
    <span class="rating rated-10"></span>
    <span class="date">2024-03-03</span>
  </li>
</ul>
`;

const LIST_PAGE_1 = `
<ul>
  <li class="poster-container">
    <div class="film-poster" data-film-slug="heat" data-film-name="Heat">
      <img alt="Poster for Heat (1995)" />
    </div>
  </li>
  <li class="poster-container">
    <div class="film-poster" data-item-slug="memories-of-murder">
      <img alt="Poster for Memories of Murder (2003)" />
    </div>
  </li>
</ul>
<div class="pagination"><span class="next disabled">Next</span></div>
`;

describe("Letterboxd Scraper (unit)", () => {
	const scrapePageMock = vi.mocked(scrapePage);

	beforeEach(() => {
		scrapePageMock.mockReset();
	});

	describe("scrapeUserFilms", () => {
		it("parses films from mocked user pages", async () => {
			scrapePageMock.mockImplementation(async (url: string) => {
				if (url.endsWith("/films/page/1/")) return USER_PAGE_1;
				if (url.endsWith("/films/page/2/")) return USER_PAGE_2;
				return "<ul></ul>";
			});

			const films = await scrapeUserFilms("katantango", { full: false });

			expect(films).toHaveLength(3);
			expect(films[0].letterboxdSlug).toBe("dune-part-two");
			expect(films[0].title).toBe("Dune: Part Two");
			expect(Number(films[0].rating)).toBe(4);
			expect(films[1].title).toBe("Inception");
			expect(films[2].letterboxdSlug).toBe("parasite");
			expect(films[2].viewCount).toBe(1);
		});

		it("skips existing slugs when full is false", async () => {
			scrapePageMock.mockImplementation(async (url: string) => {
				if (url.endsWith("/films/page/1/")) return USER_PAGE_1;
				if (url.endsWith("/films/page/2/")) return USER_PAGE_2;
				return "<ul></ul>";
			});

			const films = await scrapeUserFilms("katantango", {
				full: false,
				existingSlugs: new Set(["inception", "parasite"]),
			});

			expect(films).toHaveLength(1);
			expect(films[0].letterboxdSlug).toBe("dune-part-two");
		});
	});

	describe("scrapeList", () => {
		it("parses films from mocked list page", async () => {
			scrapePageMock.mockResolvedValue(LIST_PAGE_1);

			const films = await scrapeList(
				"https://letterboxd.com/katantango/list/watchlist/",
			);

			expect(films).toHaveLength(2);
			expect(films[0]).toEqual({
				slug: "heat",
				title: "Heat",
				position: 1,
			});
			expect(films[1]).toEqual({
				slug: "memories-of-murder",
				title: "Memories of Murder",
				position: 2,
			});
		});
	});

	describe("extractLetterboxdUsername", () => {
		it("extracts username from profile URL", () => {
			expect(
				extractLetterboxdUsername("https://letterboxd.com/katantango/"),
			).toBe("katantango");
			expect(extractLetterboxdUsername("letterboxd.com/katantango/")).toBe(
				"katantango",
			);
		});

		it("returns null for invalid URLs", () => {
			expect(extractLetterboxdUsername("not-a-url")).toBeNull();
			expect(extractLetterboxdUsername("")).toBeNull();
			expect(extractLetterboxdUsername("https://google.com/")).toBeNull();
		});
	});
});
