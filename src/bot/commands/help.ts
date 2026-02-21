import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";

export const data = new SlashCommandBuilder()
	.setName("help")
	.setDescription("Show all available commands and what they do");

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply({ ephemeral: true });

	try {
		const appCommands = interaction.guildId
			? await interaction.client.application.commands.fetch({
					guildId: interaction.guildId,
				})
			: await interaction.client.application.commands.fetch();

		const chatCommands = Array.from(appCommands.values())
			.filter((command) => command.type === 1)
			.map((command) => ({
				name: command.name,
				description: command.description || "No description",
			}))
			.sort((a, b) => a.name.localeCompare(b.name));

		if (chatCommands.length === 0) {
			await interaction.editReply({
				content: "No commands are currently registered.",
			});
			return;
		}

		await createPagination(
			interaction,
			chatCommands,
			"helpList",
			{
				title: "FilmReel Commands",
			},
			{ pageSize: 12 },
		);
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
			content: "Failed to load command list. Please try again.",
		});
	}
}
