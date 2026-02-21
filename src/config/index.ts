import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const configSchema = z.object({
	// Required
	DISCORD_TOKEN: z.string().min(1),
	DISCORD_CLIENT_ID: z.string().min(1),
	DATABASE_URL: z.string().min(1),
	REDIS_URL: z.string().optional(),
	UPSTASH_REDIS_REST_URL: z.string().optional(),
	REDIS_DB_INDEX: z.coerce.number().int().min(1).max(15).default(1),
	TMDB_API_KEY: z.string().min(1),
	GUILD_IDS: z.string().transform((s) => s.split(",").map((id) => id.trim())),

	// Environment
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	AUTO_MIGRATE: z
		.string()
		.optional()
		.transform((s) => (s ?? "1") === "1"),
	LOG_LEVEL: z
		.enum(["trace", "debug", "info", "warn", "error", "fatal"])
		.default("info"),

	// Optional - webhook (empty string treated as unset)
	ADMIN_WEBHOOK_URL: z
		.string()
		.optional()
		.transform((s) => (s?.trim() ? s : undefined)),

	// Optional - browser/Playwright
	PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: z
		.string()
		.optional()
		.transform((s) => (s?.trim() ? s : undefined)),

	// Optional - Bull Board
	BULL_BOARD_PORT: z.coerce.number().min(1).max(65535).default(3001),

	// Scraping
	SCRAPE_CONCURRENCY: z.coerce.number().min(1).max(100).default(3),
	SCRAPE_COOLDOWN_MINUTES: z.coerce.number().min(1).max(10080).default(60),
	SCRAPER_DEBUG: z
		.string()
		.optional()
		.transform((s) => (s ?? "0") === "1"),
	SCRAPE_NAV_TIMEOUT_MS: z.coerce.number().min(1000).max(300000).default(30000),
	SCRAPE_SELECTOR_TIMEOUT_MS: z.coerce
		.number()
		.min(1000)
		.max(60000)
		.default(10000),
	SCRAPE_MAX_NAV_RETRIES: z.coerce.number().min(1).max(20).default(3),
	SCRAPE_RETRY_BASE_DELAY_MS: z.coerce
		.number()
		.min(100)
		.max(60000)
		.default(1000),
	SCRAPE_RETRY_MAX_DELAY_MS: z.coerce
		.number()
		.min(1000)
		.max(120000)
		.default(10000),

	// Workers
	FILM_RESOLUTION_CONCURRENCY: z.coerce.number().min(1).max(100).default(5),
	XP_WORKER_CONCURRENCY: z.coerce.number().min(1).max(100).default(10),

	// Scheduler
	HEALTH_CHECK_DELAY_MS: z.coerce.number().min(1000).max(300000).default(60000),
	SCHEDULER_LOCK_TTL_MS: z.coerce
		.number()
		.min(1000)
		.max(24 * 60 * 60 * 1000)
		.default(2 * 60 * 60 * 1000),

	// Queue job options (film resolution)
	FILM_RESOLUTION_ATTEMPTS: z.coerce.number().min(1).max(20).default(3),
	FILM_RESOLUTION_BACKOFF_MS: z.coerce
		.number()
		.min(1000)
		.max(604800000)
		.default(86400000),

	// TMDB
	TMDB_CACHE_TTL_DAYS: z.coerce.number().min(1).max(365).default(14),
	TMDB_RATE_LIMIT_MAX_TOKENS: z.coerce.number().min(1).max(1000).default(40),
	TMDB_RATE_LIMIT_REFILL_MS: z.coerce
		.number()
		.min(100)
		.max(60000)
		.default(10000),
	TMDB_RATE_LIMIT_RETRY_DELAY_MS: z.coerce
		.number()
		.min(100)
		.max(30000)
		.default(1000),
	TMDB_FUZZY_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),

	// Bot pagination
	PAGINATION_DEFAULT_PAGE_SIZE: z.coerce.number().min(1).max(100).default(10),

	// Integration test (optional)
	LIVE_SCRAPER_TESTS: z
		.string()
		.optional()
		.transform((s) => s === "1"),
	LETTERBOXD_TEST_USERNAME: z.string().default("katantango"),
	LETTERBOXD_TEST_LIST_URL: z.string().optional(),
});

const parsedConfig = configSchema.parse(process.env);
const resolvedRedisUrl =
	parsedConfig.UPSTASH_REDIS_REST_URL?.trim() || parsedConfig.REDIS_URL?.trim();

if (!resolvedRedisUrl) {
	throw new Error("Either REDIS_URL or UPSTASH_REDIS_REST_URL must be set");
}

export const config = {
	...parsedConfig,
	REDIS_URL: resolvedRedisUrl,
};

export type Config = typeof config;

export const isDev = config.NODE_ENV === "development";
