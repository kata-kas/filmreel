import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getGuildLists } from "../../db/queries/lists.js";
import { logger } from "../../logger.js";
import { formatDate, getCountdown } from "../../utils/time.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("lists")
	.setDescription("List all registered guild lists");

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;

	try {
		const lists = await getGuildLists(guildId);

		if (lists.length === 0) {
			await interaction.editReply({
				content:
					"No lists registered in this server. Use `/addlist` to add one.",
			});
			return;
		}

		const lines = lists.map((list) => {
			const synced = list.lastSynced
				? `Last synced: ${formatDate(list.lastSynced)}`
				: "Never synced";
			const deadline = list.deadline
				? `• Deadline: ${getCountdown(list.deadline)}${list.deadlineLabel ? ` (${list.deadlineLabel})` : ""}`
				: "";
			return `**${list.listName}** — ${synced} ${deadline}`;
		});

		await interaction.editReply({
			embeds: [
				{
					title: "📋 Registered Lists",
					description: lines.join("\n").slice(0, 4000),
					color: Colors.INFO,
					footer: {
						text: `${lists.length} list${lists.length === 1 ? "" : "s"} registered`,
					},
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
