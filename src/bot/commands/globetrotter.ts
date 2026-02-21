import { Prisma } from "@prisma/client";
import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("globetrotter")
	.setDescription("Users who have watched films from the most countries");

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;

	try {
		const excludedCount = await prisma.$queryRaw<[{ count: number }]>(
			Prisma.sql`
        SELECT COUNT(*)::int as count
        FROM "Film" f
        WHERE array_length(f.country, 1) IS NULL OR array_length(f.country, 1) = 0
      `,
		);

		if (excludedCount[0] && excludedCount[0].count > 0) {
			log.log(
				{ excludedCount: excludedCount[0].count },
				"Excluding films without country data",
			);
		}

		const result = await prisma.$queryRaw<
			Array<{
				discord_id: string;
				nickname: string | null;
				country_count: number;
			}>
		>(
			Prisma.sql`
        SELECT 
          u."discordId" as discord_id,
          u.nickname,
          COUNT(DISTINCT unnested.country)::int as country_count
        FROM "User" u
        JOIN "Rating" r ON u."discordId" = r."discordId" AND u."guildId" = r."guildId"
        JOIN "Film" f ON r."letterboxdSlug" = f."letterboxdSlug"
        JOIN LATERAL unnest(f.country) AS unnested(country) ON true
        WHERE u."guildId" = ${guildId}
          AND u."deletedAt" IS NULL
          AND f.country IS NOT NULL
          AND array_length(f.country, 1) > 0
        GROUP BY u."discordId", u.nickname
        ORDER BY country_count DESC
        LIMIT 1000
      `,
		);

		if (result.length === 0) {
			await interaction.editReply({
				content: "No country data available yet. Requires metadata resolution.",
			});
			return;
		}

		const entries = result.map((row, index) => ({
			rank: index + 1,
			discordId: row.discord_id,
			nickname: row.nickname,
			value: row.country_count,
		}));

		await createPagination(interaction, entries, "userLeaderboard", {
			title: "🌍 Globetrotter Leaderboard",
			description:
				"Users sorted by number of distinct countries in their watched films",
			valueLabel: "countries",
		});
	} catch (error) {
		log.error(
			{
				commandName: interaction.commandName,
				interactionId: interaction.id,
				guildId: interaction.guildId ?? undefined,
				userId: interaction.user?.id,
				error,
			},
			"Command execution failed",
		);
		await interaction.editReply({
			content: "An error occurred. Please try again later.",
		});
	}
}
