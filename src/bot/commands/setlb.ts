import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { enqueueUserScrape } from "../../queue/enqueue.js";
import { extractLetterboxdUsername } from "../../scraper/letterboxd.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("setlb")
	.setDescription("Update your Letterboxd username")
	.addStringOption((option) =>
		option
			.setName("username")
			.setDescription("Your Letterboxd username or URL")
			.setRequired(true),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const input = interaction.options.getString("username", true);
	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const discordId = interaction.user.id;

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

		// Extract username
		let letterboxdUsername = extractLetterboxdUsername(input);
		if (!letterboxdUsername) {
			// Assume input is just the username
			letterboxdUsername = input.toLowerCase().replace(/[^a-z0-9_-]/g, "");
		}

		// Update user
		await prisma.user.update({
			where: { discordId_guildId: { discordId, guildId } },
			data: {
				letterboxdUsername,
				lastScraped: null,
			},
		});

		// Enqueue full re-scrape
		await enqueueUserScrape({
			discordId,
			guildId,
			full: true,
		});

		await interaction.editReply({
			embeds: [
				{
					title: "✅ Letterboxd Username Updated",
					description: `Your Letterboxd username has been changed to **${letterboxdUsername}**.`,
					color: Colors.SUCCESS,
					fields: [
						{
							name: "🔄 Re-scrape Queued",
							value: "A full re-scrape has been queued to update your data.",
							inline: false,
						},
					],
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
