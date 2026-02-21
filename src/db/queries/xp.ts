import { Prisma } from "@prisma/client";
import { prisma } from "../prisma/client.js";
import { clampLimit, clampOffset } from "../validation.js";

export async function getUserXp(discordId: string, guildId: string) {
	const result = await prisma.xpEvent.aggregate({
		where: {
			discordId,
			guildId,
		},
		_sum: {
			xpAwarded: true,
		},
	});

	return result._sum.xpAwarded ?? 0;
}

export async function getUserLevel(
	discordId: string,
	guildId: string,
): Promise<number> {
	const totalXp = await getUserXp(discordId, guildId);

	// Get level thresholds for this guild
	const thresholds = await prisma.levelThreshold.findMany({
		where: { guildId },
		orderBy: { level: "asc" },
	});

	if (thresholds.length === 0) {
		// Default: 1 level per 1000 XP
		return Math.floor(totalXp / 1000) + 1;
	}

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

export async function getXpForNextLevel(
	discordId: string,
	guildId: string,
): Promise<number | null> {
	const totalXp = await getUserXp(discordId, guildId);
	const currentLevel = await getUserLevel(discordId, guildId);

	const nextThreshold = await prisma.levelThreshold.findUnique({
		where: {
			guildId_level: { guildId, level: currentLevel + 1 },
		},
	});

	if (!nextThreshold) {
		// Check if there are any thresholds defined
		const anyThreshold = await prisma.levelThreshold.findFirst({
			where: { guildId },
		});

		if (!anyThreshold) {
			// Default: next level at next 1000 XP boundary
			return (Math.floor(totalXp / 1000) + 1) * 1000;
		}

		return null; // Max level reached
	}

	return nextThreshold.xpRequired - totalXp;
}

export async function getXpLeaderboard(
	guildId: string,
	options: {
		limit?: number;
		offset?: number;
	} = {},
): Promise<
	Array<{
		rank: number;
		discordId: string;
		nickname: string | null;
		xp: number;
		level: number;
	}>
> {
	const limit = clampLimit(options.limit, 10);
	const offset = clampOffset(options.offset, 0);

	const result = await prisma.$queryRaw<
		Array<{
			discord_id: string;
			nickname: string | null;
			xp: number;
		}>
	>(
		Prisma.sql`
      SELECT 
        u."discordId" as discord_id,
        u.nickname,
        COALESCE(SUM(xe."xpAwarded"), 0)::int as xp
      FROM "User" u
      LEFT JOIN "XpEvent" xe ON u."discordId" = xe."discordId" AND u."guildId" = xe."guildId"
      WHERE u."guildId" = ${guildId}
        AND u."deletedAt" IS NULL
      GROUP BY u."discordId", u.nickname
      HAVING COALESCE(SUM(xe."xpAwarded"), 0) > 0
      ORDER BY xp DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `,
	);

	// Calculate levels for each user
	const withLevels = await Promise.all(
		result.map(async (row, index) => ({
			rank: offset + index + 1,
			discordId: row.discord_id,
			nickname: row.nickname,
			xp: row.xp,
			level: await getUserLevel(row.discord_id, guildId),
		})),
	);

	return withLevels;
}

export async function getLevelThresholds(guildId: string) {
	return prisma.levelThreshold.findMany({
		where: { guildId },
		orderBy: { level: "asc" },
	});
}

export async function setLevelThreshold(
	guildId: string,
	level: number,
	xpRequired: number,
	roleId?: string,
) {
	return prisma.levelThreshold.upsert({
		where: {
			guildId_level: { guildId, level },
		},
		update: {
			xpRequired,
			roleId,
		},
		create: {
			guildId,
			level,
			xpRequired,
			roleId,
		},
	});
}

export async function setGuildXpConfig(
	guildId: string,
	eventType: string,
	xpAmount: number,
) {
	return prisma.guildXpConfig.upsert({
		where: {
			guildId_eventType: { guildId, eventType },
		},
		update: {
			xpAmount,
		},
		create: {
			guildId,
			eventType,
			xpAmount,
		},
	});
}

export async function getGuildXpConfig(guildId: string) {
	return prisma.guildXpConfig.findMany({
		where: { guildId },
	});
}
