import { prisma } from "../prisma/client.js";

export async function getUser(discordId: string, guildId: string) {
	return prisma.user.findUnique({
		where: {
			discordId_guildId: { discordId, guildId },
		},
	});
}

export async function createUser(data: {
	discordId: string;
	guildId: string;
	letterboxdUsername: string;
	nickname?: string;
}) {
	return prisma.user.create({
		data: {
			...data,
			createdAt: new Date(),
		},
	});
}

export async function updateLetterboxdUsername(
	discordId: string,
	guildId: string,
	letterboxdUsername: string,
) {
	return prisma.user.update({
		where: {
			discordId_guildId: { discordId, guildId },
		},
		data: {
			letterboxdUsername,
		},
	});
}

export async function updateNickname(
	discordId: string,
	guildId: string,
	nickname: string,
) {
	// Check uniqueness within guild
	const existing = await prisma.user.findFirst({
		where: {
			guildId,
			nickname,
			NOT: {
				discordId,
			},
		},
	});

	if (existing) {
		throw new Error(`Nickname "${nickname}" is already taken in this guild`);
	}

	return prisma.user.update({
		where: {
			discordId_guildId: { discordId, guildId },
		},
		data: { nickname },
	});
}

export async function updateLastFmUsername(
	discordId: string,
	guildId: string,
	lastFmUsername: string,
) {
	return prisma.user.update({
		where: {
			discordId_guildId: { discordId, guildId },
		},
		data: { lastFmUsername },
	});
}

export async function updateAniListUsername(
	discordId: string,
	guildId: string,
	aniListUsername: string,
) {
	return prisma.user.update({
		where: {
			discordId_guildId: { discordId, guildId },
		},
		data: { aniListUsername },
	});
}

export async function getGuildUsers(guildId: string) {
	return prisma.user.findMany({
		where: {
			guildId,
			deletedAt: null,
		},
		orderBy: {
			createdAt: "asc",
		},
	});
}

export async function getUsersByNickname(guildId: string, nickname: string) {
	return prisma.user.findMany({
		where: {
			guildId,
			nickname: {
				equals: nickname,
				mode: "insensitive",
			},
			deletedAt: null,
		},
	});
}

export async function getInactiveUsers(guildId: string, days: number) {
	const cutoff = new Date();
	cutoff.setDate(cutoff.getDate() - days);

	return prisma.user.findMany({
		where: {
			guildId,
			OR: [{ lastScraped: { lt: cutoff } }, { lastScraped: null }],
			deletedAt: null,
		},
	});
}

export async function softDeleteUser(discordId: string, guildId: string) {
	return prisma.user.update({
		where: {
			discordId_guildId: { discordId, guildId },
		},
		data: {
			deletedAt: new Date(),
		},
	});
}

export async function getUserStats(discordId: string, guildId: string) {
	const [ratingsCount, watchedCount, avgRating] = await Promise.all([
		prisma.rating.count({
			where: {
				discordId,
				guildId,
				rating: { not: null },
			},
		}),
		prisma.rating.count({
			where: {
				discordId,
				guildId,
				watched: true,
			},
		}),
		prisma.rating.aggregate({
			where: {
				discordId,
				guildId,
				rating: { not: null },
			},
			_avg: {
				rating: true,
			},
		}),
	]);

	return {
		ratingsCount,
		watchedCount,
		avgRating: avgRating._avg.rating,
	};
}
