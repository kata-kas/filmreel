import { randomUUID } from "node:crypto";
import cron from "node-cron";
import { config } from "../config/index.js";
import { ensurePrismaConnected, prisma } from "../db/prisma/client.js";
import { runMigrationsOnStartup } from "../db/prisma/migrate.js";
import { logger } from "../logger.js";
import { enqueueListScrape, enqueueUserScrape } from "../queue/enqueue.js";
import { getRedis } from "../redis.js";
import { checkScrapeHealth, formatHealthAlert } from "../scraper/health.js";
import { postAdminAlert } from "../utils/webhook.js";

const log = logger.child({ module: "Scheduler" });
let isRunning = false;
const SCHEDULER_LOCK_KEY = "scheduler:daily-scrape:lock";

async function acquireDistributedLock(): Promise<string | null> {
	const token = randomUUID();
	const acquired = await getRedis().set(
		SCHEDULER_LOCK_KEY,
		token,
		"PX",
		config.SCHEDULER_LOCK_TTL_MS,
		"NX",
	);
	return acquired === "OK" ? token : null;
}

async function releaseDistributedLock(token: string): Promise<void> {
	await getRedis().eval(
		`if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end`,
		1,
		SCHEDULER_LOCK_KEY,
		token,
	);
}

export async function runDailyScrape(): Promise<void> {
	if (isRunning) {
		log.info(
			{ skipReason: "already_in_progress" },
			"Daily scrape already in progress, skipping",
		);
		return;
	}

	isRunning = true;
	const lockToken = await acquireDistributedLock();
	if (!lockToken) {
		isRunning = false;
		log.info(
			{ lockKey: SCHEDULER_LOCK_KEY },
			"Daily scrape lock is held by another instance, skipping",
		);
		return;
	}

	await runMigrationsOnStartup("scheduler");
	await ensurePrismaConnected("scheduler");
	log.info({ startedAt: new Date().toISOString() }, "Starting daily scrape");

	try {
		// Get all registered users across all guilds
		const users = await prisma.user.findMany({
			where: {
				deletedAt: null,
			},
			select: {
				discordId: true,
				guildId: true,
				letterboxdUsername: true,
			},
		});

		log.info({ userCount: users.length }, "Enqueuing users for daily scrape");

		// Enqueue incremental scrape for each user
		for (const user of users) {
			try {
				await enqueueUserScrape({
					discordId: user.discordId,
					guildId: user.guildId,
					full: false,
				});
			} catch (error) {
				log.error(
					{ discordId: user.discordId, guildId: user.guildId, error },
					"Failed to enqueue user scrape",
				);
				// Continue with other users
			}
		}

		// Get all registered lists
		const lists = await prisma.guildList.findMany({
			select: {
				id: true,
				guildId: true,
				listName: true,
			},
		});

		log.info({ listCount: lists.length }, "Enqueuing lists for sync");

		// Enqueue list sync for each list
		for (const list of lists) {
			try {
				await enqueueListScrape({
					listId: list.id,
				});
			} catch (error) {
				log.error(
					{ listId: list.id, guildId: list.guildId, error },
					"Failed to enqueue list sync",
				);
				// Continue with other lists
			}
		}

		// Run health check after all jobs are enqueued
		// Wait a bit for jobs to process
		setTimeout(async () => {
			try {
				const health = await checkScrapeHealth();
				log.info({ health }, "Scrape health check");

				if (health.warning) {
					const alertMessage = formatHealthAlert(health);
					log.warn(alertMessage);

					// Post to admin channel via webhook
					await postAdminAlert(alertMessage);
				}
			} catch (error) {
				log.error("Health check failed: %s", error);
			}
		}, config.HEALTH_CHECK_DELAY_MS);

		log.info(
			{ completedAt: new Date().toISOString() },
			"Daily scrape completed",
		);
	} catch (error) {
		log.error({ error }, "Daily scrape failed");
	} finally {
		await releaseDistributedLock(lockToken).catch((error) => {
			log.error({ error }, "Failed to release scheduler lock");
		});
		isRunning = false;
	}
}

export function startScheduler(): void {
	// Run daily at 03:00 UTC
	const task = cron.schedule("0 3 * * *", runDailyScrape, {
		scheduled: true,
		timezone: "UTC",
	});

	log.info("Scheduler started - daily scrape at 03:00 UTC");

	// Handle graceful shutdown
	process.on("SIGINT", () => {
		task.stop();
		process.exit(0);
	});

	process.on("SIGTERM", () => {
		task.stop();
		process.exit(0);
	});
}

// Allow manual trigger via CLI
if (import.meta.url === `file://${process.argv[1]}`) {
	runDailyScrape()
		.then(() => process.exit(0))
		.catch((error) => {
			log.error(String(error));
			process.exit(1);
		});
}
