import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getOnTheBubble } from "../../db/queries/leaderboards.js";
import { logger } from "../../logger.js";
import { createFilmLeaderboardEmbed } from "../embeds/leaderboards.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("onthebubble")
	.setDescription(
		"Films with exactly 9 ratings - one more to join main leaderboard!",
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;

	try {
		const films = await getOnTheBubble(guildId, 9, 25);

		if (films.length === 0) {
			await interaction.editReply({
				content: "No films on the bubble right now.",
			});
			return;
		}

		const embed = createFilmLeaderboardEmbed(
			"🫧 On The Bubble (9 ratings)",
			films,
			1,
			1,
			{
				description: `These films have exactly 9 ratings. One more and they'll join the main leaderboard!`,
			},
		);

		await interaction.editReply({ embeds: [embed] });
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
