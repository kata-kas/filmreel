import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getHighestPercentageOfRating } from "../../db/queries/leaderboards.js";
import { getListByName } from "../../db/queries/lists.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("percentageof")
	.setDescription("Users with the highest percentage of a specific rating")
	.addIntegerOption((option) =>
		option
			.setName("rating")
			.setDescription("Rating on a 1-10 scale (e.g. 7)")
			.setRequired(true)
			.setMinValue(1)
			.setMaxValue(10),
	)
	.addStringOption((option) =>
		option
			.setName("listname")
			.setDescription(
				'Filter to a list (defaults to "The Lot" when that list exists)',
			)
			.setRequired(false),
	)
	.addIntegerOption((option) =>
		option
			.setName("min_ratings")
			.setDescription("Minimum ratings required per user (default: 10)")
			.setRequired(false)
			.setMinValue(1),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const rating = interaction.options.getInteger("rating", true);
	const requestedListName = interaction.options.getString("listname");
	const minRatings = interaction.options.getInteger("min_ratings") ?? 10;

	try {
		let listId: number | undefined;
		let listTitle = "";

		const effectiveListName = requestedListName ?? "The Lot";
		const list = await getListByName(guildId, effectiveListName);

		if (requestedListName && !list) {
			await interaction.editReply({
				content: `List "${requestedListName}" not found.`,
			});
			return;
		}

		if (list) {
			listId = list.id;
			listTitle = ` in ${list.listName}`;
		}

		const entries = await getHighestPercentageOfRating(guildId, rating, {
			listId,
			minRatings,
			limit: 1000,
		});

		if (entries.length === 0) {
			await interaction.editReply({
				content: `No users found with ${minRatings}+ ratings${list ? ` in "${list.listName}"` : ""}.`,
			});
			return;
		}

		await createPagination(interaction, entries, "userLeaderboard", {
			title: `Highest Percentage of ${rating}s${listTitle}`,
			description: `Users sorted by share of ratings equal to ${rating}/10. Minimum ${minRatings} ratings required.`,
			valueLabel: "percent",
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
