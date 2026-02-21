import { prisma } from "../db/prisma/client.js";

interface ScrapeHealthResult {
	totalUsers: number;
	usersWithActivity: number;
	usersWithZeroUpdates: number;
	warning: boolean;
	affectedUsers: { discordId: string; guildId: string; username: string }[];
}

export async function checkScrapeHealth(
	guildId?: string,
): Promise<ScrapeHealthResult> {
	// Get users who should have had activity based on their scrape frequency pattern
	const thirtyDaysAgo = new Date();
	thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

	const whereClause = guildId ? { guildId } : {};

	const users = await prisma.user.findMany({
		where: {
			...whereClause,
			lastScraped: {
				gte: thirtyDaysAgo,
			},
			deletedAt: null,
		},
		select: {
			discordId: true,
			guildId: true,
			letterboxdUsername: true,
			lastScraped: true,
		},
	});

	const result: ScrapeHealthResult = {
		totalUsers: users.length,
		usersWithActivity: 0,
		usersWithZeroUpdates: 0,
		warning: false,
		affectedUsers: [],
	};

	for (const user of users) {
		if (!user.lastScraped) {
			continue;
		}

		// Get recent ratings count
		const recentRatings = await prisma.rating.count({
			where: {
				discordId: user.discordId,
				guildId: user.guildId,
				updatedAt: {
					gte: user.lastScraped,
				},
			},
		});

		// Check if user has historical activity pattern
		const historicalRatings = await prisma.rating.count({
			where: {
				discordId: user.discordId,
				guildId: user.guildId,
			},
		});

		// If user has historical ratings but zero new ones in recent scrape, flag them
		if (historicalRatings > 0 && recentRatings === 0) {
			// Check if we expected activity (based on typical scrape pattern)
			const lastScrapedDate = user.lastScraped;
			const daysSinceLastScrape =
				(Date.now() - lastScrapedDate.getTime()) / (1000 * 60 * 60 * 24);

			// Only flag if we expected activity (scrape was more than 12 hours ago)
			if (daysSinceLastScrape < 1.5) {
				result.usersWithZeroUpdates++;
				result.affectedUsers.push({
					discordId: user.discordId,
					guildId: user.guildId,
					username: user.letterboxdUsername,
				});
			}
		} else {
			result.usersWithActivity++;
		}
	}

	// Warning if more than 20% of users with historical activity had zero updates
	const activeUsers = result.usersWithActivity + result.usersWithZeroUpdates;
	if (activeUsers > 0 && result.usersWithZeroUpdates / activeUsers > 0.2) {
		result.warning = true;
	}

	return result;
}

export function formatHealthAlert(result: ScrapeHealthResult): string {
	if (!result.warning) {
		return `Scrape health check passed: ${result.usersWithActivity}/${result.totalUsers} users had activity.`;
	}

	const percentage = (
		(result.usersWithZeroUpdates /
			(result.usersWithActivity + result.usersWithZeroUpdates)) *
		100
	).toFixed(1);

	let message = `⚠️ **Scrape Health Warning**\n\n`;
	message += `${result.usersWithZeroUpdates} users (${percentage}%) had zero new entries despite expected activity.\n\n`;
	message += `Affected users:\n`;

	for (const user of result.affectedUsers.slice(0, 10)) {
		message += `- ${user.username}\n`;
	}

	if (result.affectedUsers.length > 10) {
		message += `- ... and ${result.affectedUsers.length - 10} more\n`;
	}

	return message;
}
