import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { enqueueUserScrape, getQueuePosition } from "../../queue/enqueue.js";
import { Colors } from "../embeds/colors.js";

export const data = new SlashCommandBuilder()
	.setName("scrapeunrated")
	.setDescription("Full scrape including watched-but-unrated films")
	.addUserOption((option) =>
		option
			.setName("user")
			.setDescription("User to scrape (mods only)")
			.setRequired(false),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) {
		await interaction.reply({
			content: "This command can only be used in a server.",
			ephemeral: true,
		});
		return;
	}
	const requesterId = interaction.user.id;
	const targetUser = interaction.options.getUser("user");

	// Check permissions before defer when targeting another user
	if (targetUser && targetUser.id !== requesterId) {
		const member = await interaction.guild.members.fetch(requesterId);
		if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
			await interaction.reply({
				content: "You need moderator permissions to scrape other users.",
				ephemeral: true,
			});
			return;
		}
	}

	await interaction.deferReply();

	const guildId = interaction.guildId;

	try {
		const discordId = targetUser?.id || requesterId;
		const isSelf = discordId === requesterId;

		// Check if registered
		const user = await prisma.user.findUnique({
			where: {
				discordId_guildId: { discordId, guildId },
			},
		});

		if (!user || user.deletedAt) {
			await interaction.editReply({
				content: isSelf
					? "You are not registered! Use `/register` first."
					: "That user is not registered.",
			});
			return;
		}

		// Enqueue full scrape
		const jobId = await enqueueUserScrape({
			discordId,
			guildId,
			full: true,
		});

		const queuePosition = await getQueuePosition("scrape", jobId);

		await interaction.editReply({
			embeds: [
				{
					title: "🔄 Full Scrape Queued",
					description: isSelf
						? "A full scrape (including unrated films) has been queued for you."
						: `A full scrape has been queued for ${targetUser?.username}.`,
					color: Colors.INFO,
					fields: [
						{
							name: "⏳ Queue Position",
							value:
								queuePosition > 0 ? `#${queuePosition}` : "Processing now...",
							inline: true,
						},
						{
							name: "⚠️ Note",
							value:
								"Full scrapes take longer and include watched-but-unrated films that incremental scrapes may miss.",
							inline: false,
						},
					],
				},
			],
		});
	} catch (error) {
		log.error("Error in scrapeunrated command:", error);
		await interaction.editReply({
			content: "An error occurred. Please try again later.",
		});
	}
}
