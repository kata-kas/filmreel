import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getCommonFilms } from "../../db/queries/ratings.js";
import { logger } from "../../logger.js";
import { formatRatingDecimal } from "../../utils/formatting.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("disagree")
	.setDescription("Films two users disagree on most")
	.addUserOption((option) =>
		option.setName("user1").setDescription("First user").setRequired(true),
	)
	.addUserOption((option) =>
		option
			.setName("user2")
			.setDescription("Second user (defaults to you)")
			.setRequired(false),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const user1 = interaction.options.getUser("user1", true);
	const user2 = interaction.options.getUser("user2") || interaction.user;

	try {
		const commonFilms = await getCommonFilms(user1.id, user2.id, guildId);

		if (commonFilms.length === 0) {
			await interaction.editReply({
				content: `${user1.username} and ${user2.username} haven't rated any films in common.`,
			});
			return;
		}

		// Sort by largest difference (most disagreement)
		const disagreed = commonFilms
			.sort((a, b) => b.difference - a.difference)
			.slice(0, 25);

		const lines = disagreed.map((f, i) => {
			const diff = (f.difference * 2).toFixed(1);
			return `${i + 1}. **${f.title}** — ${formatRatingDecimal(f.user1Rating)}/10 vs ${formatRatingDecimal(f.user2Rating)}/10 (Δ${diff})`;
		});

		await interaction.editReply({
			embeds: [
				{
					title: `⚔️ Films ${user1.username} and ${user2.username} Disagree On`,
					description: lines.join("\n").slice(0, 4000),
					color: Colors.ERROR,
					footer: {
						text: `Sorted by largest rating difference | ${commonFilms.length} films in common`,
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
