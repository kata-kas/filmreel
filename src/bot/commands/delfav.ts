import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import {
	checkFavoriteExists,
	removeUserFavorite,
} from "../../db/queries/favorites.js";
import { logger } from "../../logger.js";
import { createResolver } from "../../tmdb/resolver.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("delfav")
	.setDescription("Remove a favorite")
	.addStringOption((option) =>
		option
			.setName("lookup")
			.setDescription("Name of the favorite to remove")
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
	const lookup = interaction.options.getString("lookup", true);

	try {
		// Check if registered
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

		const resolver = createResolver();
		const result = await resolver.resolve(lookup);

		// Check if exists
		const exists = await checkFavoriteExists(discordId, guildId, result);
		if (!exists) {
			await interaction.editReply({
				content: `**${result.canonicalName}** is not in your favorites.`,
			});
			return;
		}

		await removeUserFavorite(discordId, guildId, result);

		await interaction.editReply({
			embeds: [
				{
					title: "✅ Favorite Removed",
					description: `Removed **${result.canonicalName}** from your favorites.`,
					color: Colors.SUCCESS,
				},
			],
		});
	} catch (error) {
		if (error instanceof Error && error.message.includes("Could not resolve")) {
			await interaction.editReply({
				content: `Could not find "${lookup}".`,
			});
			return;
		}

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
