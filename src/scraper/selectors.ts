// All CSS selectors for Letterboxd scraping
// Based on working implementation from letterboxd-compare

export const USER_FILMS_SELECTORS = {
	FILM_POSTER: "li.griditem",
	FILM_ANCHOR: "div[data-film-id]",
	FILM_SLUG: "data-item-slug",
	FILM_TITLE: "data-film-name",
	FILM_TITLE_FALLBACK: "alt",
	POSTER_IMG: "div.poster.film-poster img",
	RATING: "span.rating",
	WATCHED_DATE: "span.date",
} as const;

export const USER_DIARY_SELECTORS = {
	DIARY_ENTRY: "tr.diary-entry-row",
	FILM_ANCHOR: "td.film-poster a",
	FILM_TITLE: "h3.headline-3 a",
	FILM_SLUG: "href",
	RATING: "span.rating",
	DATE_DAY: "td.td-day a",
	DATE_MONTH: "td.td-month a",
	DATE_YEAR: "td.td-year a",
} as const;

export const LIST_SELECTORS = {
	LIST_FILM: "li.poster-container",
	FILM_ANCHOR: "div.film-poster",
	FILM_SLUG: "data-film-slug",
	FILM_TITLE: "data-film-name",
	FILM_POSITION: "data-film-slug",
} as const;

export const FILM_PAGE_SELECTORS = {
	TITLE: "h1.headline-1",
	YEAR: "div.release-year a",
	TMDB_LINK: 'a[href*="themoviedb.org"]',
	POSTER: "div.poster img",
	OVERVIEW: "div.truncate p",
	GLOBAL_RATING: "span.average-rating",
	TOTAL_RATINGS: "section.ratings-histogram-chart",
} as const;

export const RATING_SELECTORS = {
	STAR_ELEMENT: "span.rating",
	STAR_CLASS_PATTERN: /rated-(\d+)/,
} as const;

// Selectors for film detail page metadata extraction
// These selectors target the public film page at letterboxd.com/film/{slug}/
export const FILM_DETAIL_SELECTORS = {
	/**
	 * Film title - main headline on the page
	 * Example: <h1 class="headline-1">Inception</h1>
	 */
	TITLE: "h1.headline-1",

	/**
	 * Release year - usually a link near the title
	 * Example: <div class="release-year"><a>2010</a></div>
	 */
	YEAR: "div.release-year a",

	/**
	 * Director(s) - links in the film metadata section
	 * The director links start with /director/
	 * Example: <a href="/director/christopher-nolan/">Christopher Nolan</a>
	 */
	DIRECTOR: '#featured-film-header ~ section a[href^="/director/"]',

	/**
	 * Country/Countries - links in the film metadata section
	 * Country links start with /films/country/
	 * Example: <a href="/films/country/usa/">USA</a>
	 */
	COUNTRY: '#featured-film-header ~ section a[href^="/films/country/"]',

	/**
	 * Genre(s) - links in the film metadata section
	 * Genre links start with /films/genre/
	 * Example: <a href="/films/genre/science-fiction/">Science Fiction</a>
	 */
	GENRES: '#featured-film-header ~ section a[href^="/films/genre/"]',

	/**
	 * Runtime in minutes - displayed in film stats
	 * Example text: "148 mins" or "2h 28m"
	 * Selector targets the runtime text element
	 */
	RUNTIME: '[data-track-action="Runtime"]',

	/**
	 * Average rating - from meta tag or rating display
	 * Meta tag: <meta name="twitter:data2" content="4.28">
	 * Display: <span class="average-rating">4.28</span>
	 */
	AVG_RATING_META: 'meta[name="twitter:data2"]',
	AVG_RATING_DISPLAY: "span.average-rating",

	/**
	 * Total ratings count - from meta tag or ratings link
	 * Meta tag: <meta name="twitter:label2" content="3,456,789 ratings">
	 * Link: <a data-track-action="Ratings">3.5M ratings</a>
	 */
	TOTAL_RATINGS_META: 'meta[name="twitter:label2"]',
	TOTAL_RATINGS_LINK: 'a[href$="/ratings/"]',

	/**
	 * Poster image URL
	 * From meta tag: <meta property="og:image" content="https://...">
	 * From img tag: <div class="poster"><img src="https://..."></div>
	 */
	POSTER_META: 'meta[property="og:image"]',
	POSTER_IMG: "div.poster img",
} as const;
