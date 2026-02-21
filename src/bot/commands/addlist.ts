import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { createList, getListByName } from "../../db/queries/lists.js";
import { logger } from "../../logger.js";
import { enqueueListScrape } from "../../queue/enqueue.js";
import { extractListInfo } from "../../scraper/letterboxd.js";
import { Colors } from "../embeds/colors.js";

export const data = new SlashCommandBuilder()
	.setName("addlist")
	.setDescription("Register a Letterboxd list (mod only)")
	.addStringOption((option) =>
		option
			.setName("url")
			.setDescription("Letterboxd list URL")
			.setRequired(true),
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
	const member = await interaction.guild.members.fetch(interaction.user.id);
	if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
		await interaction.reply({
			content: "You need moderator permissions to add lists.",
			ephemeral: true,
		});
		return;
	}
	await interaction.deferReply();

	const guildId = interaction.guildId;
	const discordId = interaction.user.id;
	const url = interaction.options.getString("url", true);

	try {
		// Check if registered
		const user = await prisma.user.findUnique({
			where: {
				discordId_guildId: { discordId, guildId },
			},
		});

		if (!user || user.deletedAt) {
			await interaction.editReply({
				content: "You need to register first! Use `/register`.",
			});
			return;
		}

		// Validate URL
		const listInfo = extractListInfo(url);
		if (!listInfo) {
			await interaction.editReply({
				content:
					"Invalid Letterboxd list URL. Format: https://letterboxd.com/username/list/list-name/",
			});
			return;
		}

		// Generate list name from slug
		const listName = listInfo.listSlug
			.replace(/-/g, " ")
			.replace(/\b\w/g, (c) => c.toUpperCase());

		// Check if already exists
		const existing = await getListByName(guildId, listName);
		if (existing) {
			await interaction.editReply({
				content: `A list named "${listName}" already exists.`,
			});
			return;
		}

		// Create list
		const list = await createList({
			guildId,
			letterboxdUrl: url,
			listName,
			createdBy: discordId,
		});

		// Enqueue scrape
		await enqueueListScrape({ listId: list.id });

		await interaction.editReply({
			embeds: [
				{
					title: "✅ List Added",
					description: `Added list **${listName}** and started syncing.`,
					color: Colors.SUCCESS,
					fields: [
						{
							name: "🔗 URL",
							value: url,
							inline: false,
						},
						{
							name: "🔄 Sync",
							value: "The list is being synced in the background.",
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
