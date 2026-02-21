import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getSheepScores } from "../../db/queries/leaderboards.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("sheep")
	.setDescription("Users who rate closest to the server average (sheep)")
	.addIntegerOption((option) =>
		option
			.setName("min_ratings")
			.setDescription("Minimum ratings required (default: 20)")
			.setRequired(false)
			.setMinValue(5),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const minRatings = interaction.options.getInteger("min_ratings") || 20;

	try {
		const entries = await getSheepScores(guildId, { minRatings, limit: 1000 });

		if (entries.length === 0) {
			await interaction.editReply({
				content: `No users found with ${minRatings}+ ratings.`,
			});
			return;
		}

		await createPagination(interaction, entries, "userLeaderboard", {
			title: "🐑 Sheep Leaderboard",
			description: `Users sorted by how close they rate to the server average.\nLower is better! Minimum ${minRatings} ratings required.`,
			valueLabel: "avg diff",
			secondaryLabel: "films",
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
