import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { logger } from "../../logger.js";
import { QueueNames } from "../../queue/definitions.js";
import { getQueueDepth } from "../../queue/enqueue.js";
import { Colors } from "../embeds/colors.js";

export const data = new SlashCommandBuilder()
	.setName("isbusy")
	.setDescription("Check the current queue status");

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	try {
		const [scrapeStatus, resolutionStatus, xpStatus] = await Promise.all([
			getQueueDepth(QueueNames.SCRAPE),
			getQueueDepth(QueueNames.FILM_RESOLUTION),
			getQueueDepth(QueueNames.XP),
		]);

		const isProcessing =
			scrapeStatus.isProcessing ||
			resolutionStatus.isProcessing ||
			xpStatus.isProcessing;

		const fields = [
			{
				name: "📊 Scrape Queue",
				value: `${scrapeStatus.waiting} waiting • ${scrapeStatus.active} active`,
				inline: true,
			},
			{
				name: "🎬 Film Resolution",
				value: `${resolutionStatus.waiting} waiting • ${resolutionStatus.active} active`,
				inline: true,
			},
			{
				name: "⭐ XP Processing",
				value: `${xpStatus.waiting} waiting • ${xpStatus.active} active`,
				inline: true,
			},
		];

		await interaction.editReply({
			embeds: [
				{
					title: isProcessing ? "⚙️ Workers Busy" : "✅ Workers Idle",
					description: isProcessing
						? "Background workers are currently processing jobs."
						: "All background queues are empty.",
					color: isProcessing ? Colors.WARNING : Colors.SUCCESS,
					fields,
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
