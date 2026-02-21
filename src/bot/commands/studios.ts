import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getGuildStudios } from "../../db/queries/favorites.js";
import { logger } from "../../logger.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("studios")
	.setDescription("List all unique studios in UserFavorites across the guild");

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;

	try {
		const studios = await getGuildStudios(guildId);

		if (studios.length === 0) {
			await interaction.editReply({
				content: "No studios favorited yet. Use `/addfav` to add favorites.",
			});
			return;
		}

		const studioList = studios.map((s) => `• ${s.canonicalName}`).join("\n");

		await interaction.editReply({
			embeds: [
				{
					title: "🏢 Favorite Studios",
					description: studioList.slice(0, 4000),
					color: Colors.INFO,
					footer: { text: `${studios.length} unique studios` },
				},
			],
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
