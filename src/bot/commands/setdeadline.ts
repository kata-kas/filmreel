import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getListByName, setDeadline } from "../../db/queries/lists.js";
import { logger } from "../../logger.js";
import { Colors } from "../embeds/colors.js";

export const data = new SlashCommandBuilder()
	.setName("setdeadline")
	.setDescription("Set a deadline on a list (mod only)")
	.addStringOption((option) =>
		option
			.setName("listname")
			.setDescription("Name of the list")
			.setRequired(true),
	)
	.addStringOption((option) =>
		option
			.setName("datetime")
			.setDescription("Deadline datetime (ISO format: YYYY-MM-DD HH:MM)")
			.setRequired(true),
	)
	.addStringOption((option) =>
		option
			.setName("label")
			.setDescription("Optional label for the deadline")
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
	const listName = interaction.options.getString("listname", true);
	const datetimeStr = interaction.options.getString("datetime", true);
	const label = interaction.options.getString("label") || undefined;

	try {
		const list = await getListByName(guildId, listName);
		if (!list) {
			await interaction.editReply({
				content: `List "${listName}" not found.`,
			});
			return;
		}

		// Parse datetime
		const deadline = new Date(datetimeStr);
		if (Number.isNaN(deadline.getTime())) {
			await interaction.editReply({
				content:
					"Invalid datetime format. Use: YYYY-MM-DD HH:MM (e.g., 2024-12-31 23:59)",
			});
			return;
		}

		await setDeadline(list.id, deadline, label);

		await interaction.editReply({
			embeds: [
				{
					title: "✅ Deadline Set",
					description: `Deadline set for **${list.listName}**.`,
					color: Colors.SUCCESS,
					fields: [
						{
							name: "📅 Deadline",
							value: deadline.toLocaleString(),
							inline: true,
						},
						{ name: "🏷️ Label", value: label || "None", inline: true },
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
