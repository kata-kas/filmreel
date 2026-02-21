import { Prisma } from "@prisma/client";
import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { getListByName } from "../../db/queries/lists.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("seen")
	.setDescription("Leaderboard of users who have seen the most films")
	.addStringOption((option) =>
		option
			.setName("listname")
			.setDescription("Count films on a specific list")
			.setRequired(false),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const listName = interaction.options.getString("listname");

	try {
		let listId: number | null = null;
		let listTitle = "";

		if (listName) {
			const list = await getListByName(guildId, listName);
			if (!list) {
				await interaction.editReply({
					content: `List "${listName}" not found.`,
				});
				return;
			}
			listId = list.id;
			listTitle = ` — ${list.listName}`;
		}

		const result = await prisma.$queryRaw<
			Array<{
				discord_id: string;
				nickname: string | null;
				seen_count: number;
			}>
		>(
			listId != null
				? Prisma.sql`
            SELECT 
              u."discordId" as discord_id,
              u.nickname,
              COUNT(r."letterboxdSlug")::int as seen_count
            FROM "User" u
            JOIN "Rating" r ON u."discordId" = r."discordId" AND u."guildId" = r."guildId"
            JOIN "ListFilm" lf ON r."letterboxdSlug" = lf."letterboxdSlug" AND lf."listId" = ${listId}
            WHERE u."guildId" = ${guildId}
              AND u."deletedAt" IS NULL
              AND r.watched = true
            GROUP BY u."discordId", u.nickname
            ORDER BY seen_count DESC
            LIMIT 1000
          `
				: Prisma.sql`
            SELECT 
              u."discordId" as discord_id,
              u.nickname,
              COUNT(r."letterboxdSlug")::int as seen_count
            FROM "User" u
            JOIN "Rating" r ON u."discordId" = r."discordId" AND u."guildId" = r."guildId"
            WHERE u."guildId" = ${guildId}
              AND u."deletedAt" IS NULL
              AND r.watched = true
            GROUP BY u."discordId", u.nickname
            ORDER BY seen_count DESC
            LIMIT 1000
          `,
		);

		if (result.length === 0) {
			await interaction.editReply({
				content: listName
					? `No films watched from list "${listName}" yet.`
					: "No films watched yet.",
			});
			return;
		}

		const entries = result.map((row, index) => ({
			rank: index + 1,
			discordId: row.discord_id,
			nickname: row.nickname,
			value: row.seen_count,
		}));

		await createPagination(interaction, entries, "userLeaderboard", {
			title: `👀 Most Films Seen${listTitle}`,
			description: listName
				? `Users sorted by films seen from list "${listName}"`
				: "Users sorted by total films watched",
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
