import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getFilmsByAverageRating } from "../../db/queries/leaderboards.js";
import { getListByName } from "../../db/queries/lists.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("lb")
	.setDescription("Show the main leaderboard (films with 10+ ratings)")
	.addStringOption((option) =>
		option
			.setName("listname")
			.setDescription("Filter to a specific list")
			.setRequired(false),
	)
	.addUserOption((option) =>
		option
			.setName("user")
			.setDescription("Filter to this user's perspective (shows their ratings)")
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
		let listId: number | undefined;
		let listTitle = "";

		if (listName) {
			const list = await getListByName(guildId, listName);
			if (!list) {
				await interaction.editReply({
					content: `List "${listName}" not found. Use /lists to see available lists.`,
				});
				return;
			}
			listId = list.id;
			listTitle = ` — ${list.listName}`;
		}

		// Get ALL films (for proper ranking), not just first page
		const films = await getFilmsByAverageRating(guildId, {
			minRatings: 10,
			limit: 1000, // Get all for proper pagination
			listId,
		});

		if (films.length === 0) {
			await interaction.editReply({
				content: listId
					? "No films with 10+ ratings found on this list yet."
					: "No films with 10+ ratings found yet. Keep rating!",
			});
			return;
		}

		await createPagination(interaction, films, "filmLeaderboard", {
			title: `📊 Main Leaderboard${listTitle}`,
			description: "Films with 10+ ratings • Sorted by average",
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
