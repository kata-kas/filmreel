export interface UserScrapeJob {
	discordId: string;
	guildId: string;
	full: boolean;
}

export interface ListScrapeJob {
	listId: number;
}

export interface ResolveFilmJob {
	letterboxdSlug: string;
	title: string;
	year?: number;
}

export interface ProcessXpJob {
	discordId: string;
	guildId: string;
	eventType: string;
	metadata?: Record<string, unknown>;
	/** Parent job id for rating events; used for deterministic deduplication */
	sourceJobId?: string;
	/** Injected at enqueue; used for DB idempotency. Computed if absent. */
	idempotencyKey?: string;
}

export type JobData =
	| UserScrapeJob
	| ListScrapeJob
	| ResolveFilmJob
	| ProcessXpJob;

export function isUserScrapeJob(job: JobData): job is UserScrapeJob {
	return "discordId" in job && "guildId" in job && "full" in job;
}

export function isListScrapeJob(job: JobData): job is ListScrapeJob {
	return "listId" in job && Object.keys(job).length === 1;
}

export function isResolveFilmJob(job: JobData): job is ResolveFilmJob {
	return "letterboxdSlug" in job && "title" in job;
}

export function isProcessXpJob(job: JobData): job is ProcessXpJob {
	return "discordId" in job && "eventType" in job && !("full" in job);
}

export const QueueNames = {
	SCRAPE: "scrape",
	FILM_RESOLUTION: "film-resolution",
	XP: "xp",
} as const;

export const JobNames = {
	USER_SCRAPE: "user-scrape",
	LIST_SCRAPE: "list-scrape",
	RESOLVE_FILM: "resolve-film",
	PROCESS_XP: "process-xp",
} as const;
