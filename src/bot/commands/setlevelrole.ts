import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { setLevelThreshold } from "../../db/queries/xp.js";
import { logger } from "../../logger.js";
import { Colors } from "../embeds/colors.js";

export const data = new SlashCommandBuilder()
	.setName("setlevelrole")
	.setDescription("Associate a Discord role with a level (mod only)")
	.addIntegerOption((option) =>
		option
			.setName("level")
			.setDescription("Level number")
			.setRequired(true)
			.setMinValue(1),
	)
	.addRoleOption((option) =>
		option
			.setName("role")
			.setDescription("Discord role to assign at this level")
			.setRequired(true),
	)
	.addIntegerOption((option) =>
		option
			.setName("xp_required")
			.setDescription("XP required to reach this level")
			.setRequired(false)
			.setMinValue(0),
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
	const level = interaction.options.getInteger("level", true);
	const role = interaction.options.getRole("role", true);
	const xpRequired =
		interaction.options.getInteger("xp_required") || level * 1000;

	try {
		await setLevelThreshold(guildId, level, xpRequired, role.id);

		await interaction.editReply({
			embeds: [
				{
					title: "✅ Level Role Set",
					description: `Level **${level}** rewards will now grant the ${role.name} role.`,
					color: Colors.SUCCESS,
					fields: [
						{ name: "🎁 Role", value: `<@&${role.id}>`, inline: true },
						{
							name: "⭐ XP Required",
							value: xpRequired.toString(),
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
