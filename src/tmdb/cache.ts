import { Redis } from "ioredis";
import { config } from "../config/index.js";
import { logger } from "../logger.js";
import { getRedis } from "../redis.js";

const CACHE_TTL_SECONDS = config.TMDB_CACHE_TTL_DAYS * 24 * 60 * 60;
const log = logger.child({ component: "tmdb-cache" });

export class TMDBCache {
	private redis: Redis;
	private prefix = "tmdb";
	private ownsConnection: boolean;

	constructor(redisOrUrl: Redis | string) {
		if (typeof redisOrUrl === "string") {
			this.redis = new Redis(redisOrUrl, {
				db: config.REDIS_DB_INDEX,
			});
			this.ownsConnection = true;
		} else {
			this.redis = redisOrUrl;
			this.ownsConnection = false;
		}
	}

	private key(endpoint: string, idOrQuery: string | number): string {
		return `${this.prefix}:${endpoint}:${idOrQuery}`;
	}

	async get<T>(
		endpoint: string,
		idOrQuery: string | number,
	): Promise<T | null> {
		const key = this.key(endpoint, idOrQuery);
		const cached = await this.redis.get(key);

		if (!cached) {
			return null;
		}

		try {
			return JSON.parse(cached) as T;
		} catch (err) {
			log.warn({ err, key }, "TMDB cache parse error, removing corrupted key");
			await this.redis.del(key);
			return null;
		}
	}

	async set<T>(
		endpoint: string,
		idOrQuery: string | number,
		value: T,
	): Promise<void> {
		// Don't cache null or failed responses
		if (value === null || value === undefined) {
			return;
		}

		const key = this.key(endpoint, idOrQuery);
		await this.redis.setex(key, CACHE_TTL_SECONDS, JSON.stringify(value));
	}

	async invalidate(
		endpoint: string,
		idOrQuery: string | number,
	): Promise<void> {
		const key = this.key(endpoint, idOrQuery);
		await this.redis.del(key);
	}

	async clear(): Promise<void> {
		const pattern = `${this.prefix}:*`;
		let cursor = "0";
		do {
			const [nextCursor, keys] = await this.redis.scan(
				cursor,
				"MATCH",
				pattern,
				"COUNT",
				100,
			);
			cursor = nextCursor;
			if (keys.length > 0) {
				await this.redis.del(...keys);
			}
		} while (cursor !== "0");
	}

	async disconnect(): Promise<void> {
		if (this.ownsConnection) {
			await this.redis.quit();
		}
	}
}

// Singleton instance
let cacheInstance: TMDBCache | null = null;

export function getTMDBCache(redisUrl?: string): TMDBCache {
	if (!cacheInstance) {
		cacheInstance = redisUrl
			? new TMDBCache(redisUrl)
			: new TMDBCache(getRedis());
	}
	return cacheInstance;
}
