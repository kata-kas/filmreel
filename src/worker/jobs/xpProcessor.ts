import { Prisma } from "@prisma/client";
import type { Job } from "bullmq";
import { DEFAULT_XP_WEIGHTS, isValidXpEventType } from "../../constants/xp.js";
import { prisma } from "../../db/prisma/client.js";
import type { ProcessXpJob } from "../../queue/definitions.js";
import { computeXpEventIdentity } from "../../queue/xpIdempotency.js";

interface XpCalculation {
	xpToAward: number;
	newTotalXp: number;
	levelUp: boolean;
	newLevel?: number;
}

async function calculateXp(jobData: ProcessXpJob): Promise<XpCalculation> {
	const { discordId, guildId, eventType, metadata } = jobData;
	// Get guild XP config override if exists
	const guildConfig = await prisma.guildXpConfig.findUnique({
		where: {
			guildId_eventType: { guildId, eventType },
		},
	});

	const xpPerEvent =
		guildConfig?.xpAmount ??
		DEFAULT_XP_WEIGHTS[eventType as keyof typeof DEFAULT_XP_WEIGHTS] ??
		0;

	if (!isValidXpEventType(eventType)) {
		return { xpToAward: 0, newTotalXp: 0, levelUp: false };
	}

	// Calculate XP amount based on event type and metadata
	let xpToAward = xpPerEvent;

	switch (eventType) {
		case "rating": {
			// XP per rating
			const count = (metadata?.count as number) ?? 1;
			xpToAward = xpPerEvent * count;
			break;
		}

		case "rewatch": {
			// XP per rewatch beyond first viewing
			const viewCount = (metadata?.viewCount as number) ?? 2;
			xpToAward = xpPerEvent * (viewCount - 1);
			break;
		}

		case "list_complete":
			// Fixed amount for completing a list
			xpToAward = xpPerEvent;
			break;

		case "season_participation":
			// Fixed amount for season participation
			xpToAward = xpPerEvent;
			break;

		case "streak":
			// Fixed amount for achieving a streak
			xpToAward = xpPerEvent;
			break;
	}

	// Record XP event (idempotent: unique constraint prevents double-award on retries)
	const idempotencyKey =
		jobData.idempotencyKey ?? computeXpEventIdentity(jobData);

	try {
		await prisma.xpEvent.create({
			data: {
				discordId,
				guildId,
				eventType,
				idempotencyKey,
				xpAwarded: xpToAward,
			},
		});
	} catch (err) {
		// P2002 = unique constraint violation; event already awarded
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === "P2002"
		) {
			const xpAggregation = await prisma.xpEvent.aggregate({
				where: { discordId, guildId },
				_sum: { xpAwarded: true },
			});
			const newTotalXp = xpAggregation._sum.xpAwarded ?? 0;
			return {
				xpToAward: 0,
				newTotalXp,
				levelUp: false,
			};
		}
		throw err;
	}

	// Calculate total XP
	const xpAggregation = await prisma.xpEvent.aggregate({
		where: { discordId, guildId },
		_sum: { xpAwarded: true },
	});

	const newTotalXp = xpAggregation._sum.xpAwarded ?? 0;

	// Check for level up
	const currentLevel = await calculateLevel(guildId, newTotalXp - xpToAward);
	const newLevel = await calculateLevel(guildId, newTotalXp);

	const levelUp = newLevel > currentLevel;

	return {
		xpToAward,
		newTotalXp,
		levelUp,
		newLevel: levelUp ? newLevel : undefined,
	};
}

async function calculateLevel(
	guildId: string,
	totalXp: number,
): Promise<number> {
	// Get level thresholds for this guild
	const thresholds = await prisma.levelThreshold.findMany({
		where: { guildId },
		orderBy: { level: "asc" },
	});

	if (thresholds.length === 0) {
		// Default level calculation: 1 level per 1000 XP
		return Math.floor(totalXp / 1000) + 1;
	}

	// Find current level based on XP
	let level = 1;
	for (const threshold of thresholds) {
		if (totalXp >= threshold.xpRequired) {
			level = threshold.level;
		} else {
			break;
		}
	}

	return level;
}

async function assignRole(
	_discordId: string,
	guildId: string,
	level: number,
): Promise<string | null> {
	// Get role for this level
	const threshold = await prisma.levelThreshold.findUnique({
		where: {
			guildId_level: { guildId, level },
		},
	});

	if (!threshold?.roleId) {
		return null;
	}

	// Role assignment would need Discord client - this is handled in bot layer
	return threshold.roleId;
}

export async function processXpJob(
	job: Job<ProcessXpJob>,
): Promise<XpCalculation & { roleId?: string | null }> {
	const { discordId, guildId } = job.data;
	const result = await calculateXp(job.data);

	let roleId: string | null = null;

	if (result.levelUp && result.newLevel) {
		roleId = await assignRole(discordId, guildId, result.newLevel);
	}

	return {
		...result,
		roleId,
	};
}

// Helper to check and award streak XP
export async function checkStreak(
	discordId: string,
	guildId: string,
): Promise<boolean> {
	const sevenDaysAgo = new Date();
	sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

	// Check if user has rated at least 5 films in the last 7 days
	const ratings = await prisma.rating.findMany({
		where: {
			discordId,
			guildId,
			watchedDate: {
				gte: sevenDaysAgo,
			},
		},
		orderBy: {
			watchedDate: "desc",
		},
	});

	if (ratings.length >= 5) {
		// Check if we already awarded streak XP for this period
		const existingStreak = await prisma.xpEvent.findFirst({
			where: {
				discordId,
				guildId,
				eventType: "streak",
				createdAt: {
					gte: sevenDaysAgo,
				},
			},
		});

		if (!existingStreak) {
			// Award streak XP (weekStart for deterministic idempotency)
			const { enqueueProcessXp } = await import("../../queue/enqueue.js");
			const weekStart = sevenDaysAgo.toISOString().slice(0, 10);

			await enqueueProcessXp({
				discordId,
				guildId,
				eventType: "streak",
				metadata: { filmsRated: ratings.length, weekStart },
			});

			return true;
		}
	}

	return false;
}
