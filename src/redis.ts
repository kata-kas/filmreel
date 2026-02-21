import { Redis } from "ioredis";
import { config } from "./config/index.js";

let redisInstance: Redis | null = null;

/**
 * Shared Redis client singleton. Uses BullMQ-compatible options (maxRetriesPerRequest: null)
 * so the same connection works for both BullMQ queues and general usage (pagination, cache).
 */
export function getRedis(): Redis {
	if (!redisInstance) {
		redisInstance = new Redis(config.REDIS_URL, {
			maxRetriesPerRequest: null,
			db: config.REDIS_DB_INDEX,
		});
	}
	return redisInstance;
}
