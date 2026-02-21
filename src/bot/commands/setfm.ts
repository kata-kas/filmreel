import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("setfm")
	.setDescription("Set your Last.fm username")
	.addStringOption((option) =>
		option
			.setName("username")
			.setDescription("Your Last.fm username")
			.setRequired(true),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const discordId = interaction.user.id;
	const username = interaction.options.getString("username", true);

	try {
		const user = await prisma.user.findUnique({
			where: {
				discordId_guildId: { discordId, guildId },
			},
		});

		if (!user || user.deletedAt) {
			await interaction.editReply({
				content: "You are not registered! Use `/register` first.",
			});
			return;
		}

		await prisma.user.update({
			where: { discordId_guildId: { discordId, guildId } },
			data: { lastFmUsername: username },
		});

		await interaction.editReply({
			embeds: [
				{
					title: "✅ Last.fm Username Set",
					description: `Your Last.fm username has been set to **${username}**.`,
					color: Colors.SUCCESS,
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
