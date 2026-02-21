import { Prisma } from "@prisma/client";
import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("rated")
	.setDescription("Leaderboard of users who have rated the most films");

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
				rating_count: number;
			}>
		>(
			Prisma.sql`
        SELECT 
          u."discordId" as discord_id,
          u.nickname,
          COUNT(r.rating)::int as rating_count
        FROM "User" u
        JOIN "Rating" r ON u."discordId" = r."discordId" AND u."guildId" = r."guildId"
        WHERE u."guildId" = ${guildId}
          AND u."deletedAt" IS NULL
          AND r.rating IS NOT NULL
        GROUP BY u."discordId", u.nickname
        ORDER BY rating_count DESC
        LIMIT 1000
      `,
		);

		if (result.length === 0) {
			await interaction.editReply({
				content: "No ratings found yet. Start rating films!",
			});
			return;
		}

		const entries = result.map((row, index) => ({
			rank: index + 1,
			discordId: row.discord_id,
			nickname: row.nickname,
			value: row.rating_count,
		}));

		await createPagination(interaction, entries, "userLeaderboard", {
			title: "🏆 Most Films Rated",
			description: "Users sorted by number of films rated",
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
