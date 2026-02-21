import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getListByName } from "../../db/queries/lists.js";
import { createSeason } from "../../db/queries/seasons.js";
import { logger } from "../../logger.js";
import { Colors } from "../embeds/colors.js";

export const data = new SlashCommandBuilder()
	.setName("addseason")
	.setDescription("Create a new season linked to a list (mod only)")
	.addStringOption((option) =>
		option.setName("name").setDescription("Season name").setRequired(true),
	)
	.addStringOption((option) =>
		option
			.setName("listname")
			.setDescription("List to associate with this season")
			.setRequired(true),
	)
	.addStringOption((option) =>
		option
			.setName("start_date")
			.setDescription("Start date (YYYY-MM-DD)")
			.setRequired(true),
	)
	.addStringOption((option) =>
		option
			.setName("end_date")
			.setDescription("End date (YYYY-MM-DD)")
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
			content: "You need moderator permissions to use this command.",
			ephemeral: true,
		});
		return;
	}
	await interaction.deferReply();

	const guildId = interaction.guildId;
	const name = interaction.options.getString("name", true);
	const listName = interaction.options.getString("listname", true);
	const startDateStr = interaction.options.getString("start_date", true);
	const endDateStr = interaction.options.getString("end_date", true);

	try {
		const list = await getListByName(guildId, listName);
		if (!list) {
			await interaction.editReply({
				content: `List "${listName}" not found.`,
			});
			return;
		}

		// Parse dates
		const startDate = new Date(startDateStr);
		const endDate = new Date(endDateStr);

		if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
			await interaction.editReply({
				content: "Invalid date format. Use: YYYY-MM-DD",
			});
			return;
		}

		if (endDate <= startDate) {
			await interaction.editReply({
				content: "End date must be after start date.",
			});
			return;
		}

		await createSeason({
			guildId,
			name,
			listId: list.id,
			startDate,
			endDate,
		});

		await interaction.editReply({
			embeds: [
				{
					title: "✅ Season Created",
					description: `Season "**${name}**" has been created.`,
					color: Colors.SUCCESS,
					fields: [
						{ name: "📋 List", value: list.listName, inline: true },
						{
							name: "📅 Start",
							value: startDate.toLocaleDateString(),
							inline: true,
						},
						{
							name: "📅 End",
							value: endDate.toLocaleDateString(),
							inline: true,
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
