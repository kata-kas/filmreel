import { Queue } from "bullmq";
import { config } from "../config/index.js";
import { getRedis } from "../redis.js";
import type {
	ListScrapeJob,
	ProcessXpJob,
	ResolveFilmJob,
	UserScrapeJob,
} from "./definitions.js";
import { JobNames, QueueNames } from "./definitions.js";
import { computeXpEventIdentity } from "./xpIdempotency.js";

const connection = getRedis();

// Define queues
export const scrapeQueue = new Queue(QueueNames.SCRAPE, { connection });
export const filmResolutionQueue = new Queue(QueueNames.FILM_RESOLUTION, {
	connection,
});
export const xpQueue = new Queue(QueueNames.XP, { connection });

// States where a job is considered "in-flight" for deduplication (includes active)
const IN_FLIGHT_STATES = ["waiting", "delayed", "paused", "active"] as const;

async function getExistingJobIdIfInFlight(
	queue: Queue,
	jobId: string,
): Promise<string | null> {
	const job = await queue.getJob(jobId);
	if (!job) return null;
	const state = await job.getState();
	const resolvedJobId = job.id ? String(job.id) : jobId;
	return IN_FLIGHT_STATES.includes(state as (typeof IN_FLIGHT_STATES)[number])
		? resolvedJobId
		: null;
}

// Sanitize slug for BullMQ jobId (no colons)
function sanitizeSlug(slug: string): string {
	return slug.replace(/:/g, "-");
}

// Enqueue helpers - atomic dedup via deterministic jobId + getJob (O(1), no full-queue scans)
export async function enqueueUserScrape(job: UserScrapeJob): Promise<string> {
	const jobId = `${JobNames.USER_SCRAPE}-${job.discordId}-${job.guildId}`;
	const existing = await getExistingJobIdIfInFlight(scrapeQueue, jobId);
	if (existing) return existing;

	const added = await scrapeQueue.add(
		JobNames.USER_SCRAPE,
		{ ...job, deduplicationKey: `user-${job.discordId}-${job.guildId}` },
		{
			jobId,
			removeOnComplete: { age: 24 * 3600 },
			removeOnFail: { age: 7 * 24 * 3600 },
		},
	);
	return added.id ? String(added.id) : jobId;
}

export async function enqueueListScrape(job: ListScrapeJob): Promise<string> {
	const jobId = `${JobNames.LIST_SCRAPE}-${job.listId}`;
	const existing = await getExistingJobIdIfInFlight(scrapeQueue, jobId);
	if (existing) return existing;

	const added = await scrapeQueue.add(
		JobNames.LIST_SCRAPE,
		{ ...job, deduplicationKey: `list-${job.listId}` },
		{
			jobId,
			removeOnComplete: { age: 24 * 3600 },
			removeOnFail: { age: 7 * 24 * 3600 },
		},
	);
	return added.id ? String(added.id) : jobId;
}

export async function enqueueFilmResolution(
	job: ResolveFilmJob,
): Promise<string> {
	const jobId = `${JobNames.RESOLVE_FILM}-${sanitizeSlug(job.letterboxdSlug)}`;
	const existing = await getExistingJobIdIfInFlight(filmResolutionQueue, jobId);
	if (existing) return existing;

	const added = await filmResolutionQueue.add(
		JobNames.RESOLVE_FILM,
		{ ...job, deduplicationKey: `film-${job.letterboxdSlug}` },
		{
			jobId,
			attempts: config.FILM_RESOLUTION_ATTEMPTS,
			backoff: {
				type: "exponential",
				delay: config.FILM_RESOLUTION_BACKOFF_MS,
			},
			removeOnComplete: { age: 24 * 3600 },
			removeOnFail: { age: 30 * 24 * 3600 },
		},
	);
	return added.id ? String(added.id) : jobId;
}

export async function enqueueDelayedFilmResolution(
	job: ResolveFilmJob,
	delayMs: number,
): Promise<string> {
	const jobId = `${JobNames.RESOLVE_FILM}-${sanitizeSlug(job.letterboxdSlug)}-delayed`;
	const existing = await getExistingJobIdIfInFlight(filmResolutionQueue, jobId);
	if (existing) return existing;

	const added = await filmResolutionQueue.add(
		JobNames.RESOLVE_FILM,
		{ ...job, deduplicationKey: `film-${job.letterboxdSlug}` },
		{
			jobId,
			delay: delayMs,
			attempts: config.FILM_RESOLUTION_ATTEMPTS,
			backoff: {
				type: "exponential",
				delay: config.FILM_RESOLUTION_BACKOFF_MS,
			},
			removeOnComplete: { age: 24 * 3600 },
			removeOnFail: { age: 30 * 24 * 3600 },
		},
	);
	return added.id ? String(added.id) : jobId;
}

export async function enqueueProcessXp(job: ProcessXpJob): Promise<string> {
	const identity = computeXpEventIdentity(job);
	const jobId = `${JobNames.PROCESS_XP}-${identity}`;
	const existing = await getExistingJobIdIfInFlight(xpQueue, jobId);
	if (existing) return existing;

	const payload = { ...job, idempotencyKey: identity };
	const added = await xpQueue.add(JobNames.PROCESS_XP, payload, {
		jobId,
		removeOnComplete: { age: 7 * 24 * 3600 },
		removeOnFail: { age: 30 * 24 * 3600 },
	});

	return added.id ? String(added.id) : jobId;
}

// Queue status helpers
export async function getQueuePosition(
	queueName: string,
	jobId: string,
): Promise<number> {
	let queue: Queue;

	switch (queueName) {
		case QueueNames.SCRAPE:
			queue = scrapeQueue;
			break;
		case QueueNames.FILM_RESOLUTION:
			queue = filmResolutionQueue;
			break;
		case QueueNames.XP:
			queue = xpQueue;
			break;
		default:
			return -1;
	}

	const waiting = await queue.getWaiting();
	const index = waiting.findIndex((j) => j.id === jobId);

	return index === -1 ? 0 : index + 1;
}

export async function getQueueDepth(
	queueName: string,
): Promise<{ waiting: number; active: number; isProcessing: boolean }> {
	let queue: Queue;

	switch (queueName) {
		case QueueNames.SCRAPE:
			queue = scrapeQueue;
			break;
		case QueueNames.FILM_RESOLUTION:
			queue = filmResolutionQueue;
			break;
		case QueueNames.XP:
			queue = xpQueue;
			break;
		default:
			return { waiting: 0, active: 0, isProcessing: false };
	}

	const [waiting, active] = await Promise.all([
		queue.getWaitingCount(),
		queue.getActiveCount(),
	]);

	return {
		waiting,
		active,
		isProcessing: active > 0,
	};
}

export async function getJobStatus(queueName: string, jobId: string) {
	let queue: Queue;

	switch (queueName) {
		case QueueNames.SCRAPE:
			queue = scrapeQueue;
			break;
		case QueueNames.FILM_RESOLUTION:
			queue = filmResolutionQueue;
			break;
		case QueueNames.XP:
			queue = xpQueue;
			break;
		default:
			return null;
	}

	const job = await queue.getJob(jobId);
	if (!job) return null;

	const state = await job.getState();
	return {
		id: job.id,
		state,
		progress: job.progress,
		returnvalue: job.returnvalue,
		failedReason: job.failedReason,
	};
}
