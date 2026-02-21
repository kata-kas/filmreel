import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
// prisma not needed for rewards query
import { getLevelThresholds } from "../../db/queries/xp.js";
import { logger } from "../../logger.js";
import { formatNumber } from "../../utils/formatting.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("rewards")
	.setDescription("Show level rewards and XP thresholds");

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;

	try {
		const thresholds = await getLevelThresholds(guildId);

		if (thresholds.length === 0) {
			await interaction.editReply({
				content:
					"No level rewards configured yet. Use `/setlevelrole` to add rewards.",
			});
			return;
		}

		const lines = thresholds.map((t) => {
			const role = t.roleId ? `<@&${t.roleId}>` : "No role";
			return `**Level ${t.level}** — ${formatNumber(t.xpRequired)} XP — ${role}`;
		});

		await interaction.editReply({
			embeds: [
				{
					title: "🎁 Level Rewards",
					description: lines.join("\n"),
					color: Colors.GOLD,
					footer: {
						text: "Earn XP by rating films and completing activities!",
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
