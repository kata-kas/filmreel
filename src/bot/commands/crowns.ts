import { Prisma } from "@prisma/client";
import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("crowns")
	.setDescription("Users with the most rewatched films");

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;

	try {
		const result = await prisma.$queryRaw<
			Array<{
				discord_id: string;
				nickname: string | null;
				crown_count: number;
			}>
		>(
			Prisma.sql`
        SELECT 
          u."discordId" as discord_id,
          u.nickname,
          COUNT(CASE WHEN r."viewCount" > 1 THEN 1 END)::int as crown_count
        FROM "User" u
        JOIN "Rating" r ON u."discordId" = r."discordId" AND u."guildId" = r."guildId"
        WHERE u."guildId" = ${guildId}
          AND u."deletedAt" IS NULL
        GROUP BY u."discordId", u.nickname
        HAVING COUNT(CASE WHEN r."viewCount" > 1 THEN 1 END) > 0
        ORDER BY crown_count DESC
        LIMIT 1000
      `,
		);

		if (result.length === 0) {
			await interaction.editReply({
				content:
					"No rewatched films found yet. Use `/scrapeunrated` to update view counts.",
			});
			return;
		}

		const entries = result.map((row, index) => ({
			rank: index + 1,
			discordId: row.discord_id,
			nickname: row.nickname,
			value: row.crown_count,
		}));

		await createPagination(interaction, entries, "userLeaderboard", {
			title: "👑 Crowns Leaderboard",
			description:
				"Users sorted by number of distinct films watched more than once",
			valueLabel: "films",
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
