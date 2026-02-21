import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { setGuildXpConfig } from "../../db/queries/xp.js";
import { logger } from "../../logger.js";
import { Colors } from "../embeds/colors.js";

export const data = new SlashCommandBuilder()
	.setName("setxp")
	.setDescription("Override XP amount for an event type (mod only)")
	.addStringOption((option) =>
		option
			.setName("event_type")
			.setDescription("XP event type")
			.setRequired(true)
			.addChoices(
				{ name: "Rating", value: "rating" },
				{ name: "Rewatch", value: "rewatch" },
				{ name: "List Complete", value: "list_complete" },
				{ name: "Season Participation", value: "season_participation" },
				{ name: "Streak", value: "streak" },
			),
	)
	.addIntegerOption((option) =>
		option
			.setName("amount")
			.setDescription("XP amount to award")
			.setRequired(true)
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
	const eventType = interaction.options.getString("event_type", true);
	const amount = interaction.options.getInteger("amount", true);

	try {
		await setGuildXpConfig(guildId, eventType, amount);

		const typeLabels: Record<string, string> = {
			rating: "⭐ Rating a film",
			rewatch: "🔁 Rewatch",
			list_complete: "📋 Complete a list",
			season_participation: "🎯 Season participation",
			streak: "🔥 Streak bonus",
		};

		await interaction.editReply({
			embeds: [
				{
					title: "✅ XP Configuration Updated",
					description: `**${typeLabels[eventType]}** will now award **${amount} XP**.`,
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
