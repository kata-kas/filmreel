import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getGuildUsers, getInactiveUsers } from "../../db/queries/users.js";
import { logger } from "../../logger.js";
import { getRelativeTime } from "../../utils/time.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

const INACTIVE_DAYS = 30;

export const data = new SlashCommandBuilder()
	.setName("active")
	.setDescription("List all registered users and their last scrape time");

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;

	try {
		const [allUsers, inactiveUsers] = await Promise.all([
			getGuildUsers(guildId),
			getInactiveUsers(guildId, INACTIVE_DAYS),
		]);

		if (allUsers.length === 0) {
			await interaction.editReply({
				content: "No registered users found in this server.",
			});
			return;
		}

		const inactiveSet = new Set(inactiveUsers.map((u) => u.discordId));

		// Sort by last scraped (most recent first)
		const sorted = allUsers.sort((a, b) => {
			const dateA = a.lastScraped?.getTime() || 0;
			const dateB = b.lastScraped?.getTime() || 0;
			return dateB - dateA;
		});

		const lines = sorted.map((u) => {
			const nickname = u.nickname || u.letterboxdUsername;
			const status = inactiveSet.has(u.discordId) ? "🔴" : "🟢";
			const lastScraped = u.lastScraped
				? getRelativeTime(u.lastScraped)
				: "Never";

			return `${status} **${nickname}** — ${lastScraped}`;
		});

		await interaction.editReply({
			embeds: [
				{
					title: "👥 Active Users",
					description: lines.join("\n").slice(0, 4000),
					color: Colors.INFO,
					footer: {
						text: `${allUsers.length} total • ${inactiveUsers.length} inactive (>30 days) • 🟢 Active 🔴 Inactive`,
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
