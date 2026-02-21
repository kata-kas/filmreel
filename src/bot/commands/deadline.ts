import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getNearestDeadline } from "../../db/queries/lists.js";
import { logger } from "../../logger.js";
import { getCountdown } from "../../utils/time.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("deadline")
	.setDescription("Show the nearest upcoming list deadline");

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;

	try {
		const deadline = await getNearestDeadline(guildId);

		if (!deadline) {
			await interaction.editReply({
				content: "No upcoming deadlines set.",
			});
			return;
		}

		if (!deadline.deadline) {
			await interaction.editReply({
				content: "No upcoming deadlines set.",
			});
			return;
		}

		const countdown = getCountdown(deadline.deadline);

		await interaction.editReply({
			embeds: [
				{
					title: "⏰ Upcoming Deadline",
					description: `**${deadline.listName}**${deadline.deadlineLabel ? ` — ${deadline.deadlineLabel}` : ""}`,
					color: Colors.WARNING,
					fields: [
						{
							name: "📅 Time Remaining",
							value: countdown,
							inline: true,
						},
						{
							name: "🔗 List",
							value: deadline.letterboxdUrl,
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
