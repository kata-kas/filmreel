import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { clearDeadline, getListByName } from "../../db/queries/lists.js";
import { logger } from "../../logger.js";
import { Colors } from "../embeds/colors.js";

export const data = new SlashCommandBuilder()
	.setName("cleardeadline")
	.setDescription("Remove a deadline from a list (mod only)")
	.addStringOption((option) =>
		option
			.setName("listname")
			.setDescription("Name of the list")
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
	const listName = interaction.options.getString("listname", true);

	try {
		const list = await getListByName(guildId, listName);
		if (!list) {
			await interaction.editReply({
				content: `List "${listName}" not found.`,
			});
			return;
		}

		await clearDeadline(list.id);

		await interaction.editReply({
			embeds: [
				{
					title: "✅ Deadline Cleared",
					description: `Deadline removed from **${list.listName}**.`,
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
