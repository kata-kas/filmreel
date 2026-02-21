import { createHash } from "node:crypto";
import type { ProcessXpJob } from "./definitions.js";

/**
 * Computes a deterministic idempotency key for an XP event.
 * Same logical event (same user, guild, type, and relevant metadata) produces the same key.
 * Used for both BullMQ jobId deduplication and DB unique constraint.
 */
export function computeXpEventIdentity(job: ProcessXpJob): string {
	const { discordId, guildId, eventType, metadata, sourceJobId } = job;
	const parts: string[] = [discordId, guildId, eventType];

	switch (eventType) {
		case "rating":
			// One job per scrape; sourceJobId identifies the parent UserScrape job
			parts.push(sourceJobId ?? String(metadata?.count ?? ""));
			break;
		case "rewatch":
			parts.push(
				String(metadata?.letterboxdSlug ?? ""),
				String(metadata?.viewCount ?? ""),
			);
			break;
		case "list_complete":
			parts.push(String(metadata?.listId ?? ""));
			break;
		case "season_participation":
			parts.push(String(metadata?.seasonId ?? ""));
			break;
		case "streak":
			// weekStart = start of 7-day lookback window (YYYY-MM-DD)
			parts.push(String(metadata?.weekStart ?? ""));
			break;
		default:
			parts.push(JSON.stringify(metadata ?? {}));
	}

	const payload = parts.join("|");
	return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}
