import { Worker } from "bullmq";
import { config } from "../config/index.js";
import { ensurePrismaConnected } from "../db/prisma/client.js";
import { runMigrationsOnStartup } from "../db/prisma/migrate.js";
import { logger } from "../logger.js";
import {
	isListScrapeJob,
	isProcessXpJob,
	isResolveFilmJob,
	isUserScrapeJob,
	JobNames,
	QueueNames,
} from "../queue/definitions.js";
import { getRedis } from "../redis.js";
import { closeBrowser } from "../scraper/browser.js";
import { processFilmResolution } from "./jobs/filmResolution.js";
import { processListScrape } from "./jobs/listScrape.js";
import { processUserScrape } from "./jobs/userScrape.js";
import { processXpJob } from "./jobs/xpProcessor.js";

const log = logger.child({ module: "Worker" });
const connection = getRedis();
await runMigrationsOnStartup("worker");
await ensurePrismaConnected("worker");

// Scrape worker
const scrapeWorker = new Worker(
	QueueNames.SCRAPE,
	async (job) => {
		log.info(
			{ jobId: job.id, queueName: QueueNames.SCRAPE },
			"Processing scrape job",
		);

		try {
			if (job.name === JobNames.USER_SCRAPE && isUserScrapeJob(job.data)) {
				const result = await processUserScrape(job);
				return result;
			}

			if (job.name === JobNames.LIST_SCRAPE && isListScrapeJob(job.data)) {
				const result = await processListScrape(job);
				return result;
			}

			throw new Error(`Unknown job type: ${job.name}`);
		} catch (error) {
			log.error(
				{ jobId: job.id, queueName: QueueNames.SCRAPE, error },
				"Job failed",
			);
			throw error;
		}
	},
	{
		connection,
		concurrency: config.SCRAPE_CONCURRENCY,
	},
);

// Film resolution worker
const filmResolutionWorker = new Worker(
	QueueNames.FILM_RESOLUTION,
	async (job) => {
		log.info(
			{ jobId: job.id, queueName: QueueNames.FILM_RESOLUTION },
			"Processing film resolution job",
		);

		try {
			if (job.name === JobNames.RESOLVE_FILM && isResolveFilmJob(job.data)) {
				const result = await processFilmResolution(job);
				return result;
			}

			throw new Error(`Unknown job type: ${job.name}`);
		} catch (error) {
			log.error(
				{ jobId: job.id, queueName: QueueNames.FILM_RESOLUTION, error },
				"Job failed",
			);
			throw error;
		}
	},
	{
		connection,
		concurrency: config.FILM_RESOLUTION_CONCURRENCY,
	},
);

// XP worker
const xpWorker = new Worker(
	QueueNames.XP,
	async (job) => {
		log.info({ jobId: job.id, queueName: QueueNames.XP }, "Processing XP job");

		try {
			if (job.name === JobNames.PROCESS_XP && isProcessXpJob(job.data)) {
				const result = await processXpJob(job);
				return result;
			}

			throw new Error(`Unknown job type: ${job.name}`);
		} catch (error) {
			log.error({ jobId: job.id, error }, "Job failed");
			throw error;
		}
	},
	{
		connection,
		concurrency: config.XP_WORKER_CONCURRENCY,
	},
);

// Event handlers
scrapeWorker.on("completed", (job, result) => {
	log.info(
		{ jobId: job.id, queueName: QueueNames.SCRAPE, result },
		"Scrape job completed",
	);
});

scrapeWorker.on("failed", (job, error) => {
	log.error(
		{ jobId: job?.id, queueName: QueueNames.SCRAPE, error },
		"Scrape job failed",
	);
});

filmResolutionWorker.on("completed", (job, result) => {
	log.info(
		{ jobId: job.id, queueName: QueueNames.FILM_RESOLUTION, result },
		"Film resolution job completed",
	);
});

filmResolutionWorker.on("failed", (job, error) => {
	log.error(
		{ jobId: job?.id, queueName: QueueNames.FILM_RESOLUTION, error },
		"Film resolution job failed",
	);
});

xpWorker.on("completed", (job, result) => {
	log.info(
		{ jobId: job.id, queueName: QueueNames.XP, result },
		"XP job completed",
	);
});

xpWorker.on("failed", (job, error) => {
	log.error(
		{ jobId: job?.id, queueName: QueueNames.XP, error },
		"XP job failed",
	);
});

log.info("Workers started");

// Graceful shutdown
process.on("SIGINT", async () => {
	log.info("Shutting down workers...");
	await Promise.all([
		scrapeWorker.close(),
		filmResolutionWorker.close(),
		xpWorker.close(),
	]);
	await closeBrowser();
	await connection.quit();
	process.exit(0);
});

process.on("SIGTERM", async () => {
	log.info("Shutting down workers...");
	await Promise.all([
		scrapeWorker.close(),
		filmResolutionWorker.close(),
		xpWorker.close(),
	]);
	await closeBrowser();
	await connection.quit();
	process.exit(0);
});
