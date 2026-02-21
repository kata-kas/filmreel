import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getGuildUsers } from "../../db/queries/users.js";
import { logger } from "../../logger.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("nicknames")
	.setDescription("List all registered nicknames in this server");

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;

	try {
		const users = await getGuildUsers(guildId);

		if (users.length === 0) {
			await interaction.editReply({
				content: "No registered users found in this server.",
			});
			return;
		}

		// Sort by nickname
		const sorted = users
			.filter((u) => u.nickname)
			.sort((a, b) => (a.nickname || "").localeCompare(b.nickname || ""));

		if (sorted.length === 0) {
			await interaction.editReply({
				content: "No users have set nicknames yet.",
			});
			return;
		}

		const lines = sorted.map((u) => {
			const lbLink = `https://letterboxd.com/${u.letterboxdUsername}/`;
			return `**${u.nickname}** — [${u.letterboxdUsername}](${lbLink})`;
		});

		// Split into chunks if needed (Discord limit ~4000 chars)
		const content = lines.join("\n");

		await interaction.editReply({
			embeds: [
				{
					title: "🏷️ Registered Nicknames",
					description: content.slice(0, 4000),
					color: Colors.INFO,
					footer: { text: `${sorted.length} users with nicknames` },
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
