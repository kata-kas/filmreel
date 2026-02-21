import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getFilmsByAverageRating } from "../../db/queries/leaderboards.js";
import { getListByName } from "../../db/queries/lists.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("alt")
	.setDescription("Show alternative leaderboard (films with 3-9 ratings)")
	.addStringOption((option) =>
		option
			.setName("listname")
			.setDescription("Filter to a specific list")
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
					content: `List "${listName}" not found.`,
				});
				return;
			}
			listId = list.id;
			listTitle = ` — ${list.listName}`;
		}

		const films = await getFilmsByAverageRating(guildId, {
			minRatings: 3,
			maxRatings: 9,
			limit: 1000,
			listId,
		});

		if (films.length === 0) {
			await interaction.editReply({
				content: "No films with 3-9 ratings found.",
			});
			return;
		}

		await createPagination(interaction, films, "filmLeaderboard", {
			title: `🔄 Alternative Leaderboard${listTitle}`,
			description:
				"Films with 3-9 ratings • One more rating to join main leaderboard!",
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
