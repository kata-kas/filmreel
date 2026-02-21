import type { ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { getDivisiveFilms } from "../../db/queries/leaderboards.js";
import { logger } from "../../logger.js";
import { formatRatingDecimal } from "../../utils/formatting.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
	.setName("divisive")
	.setDescription("Most divisive films (highest rating standard deviation)");

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;

	try {
		const films = await getDivisiveFilms(guildId, {
			minRatings: 5,
			limit: 1000,
		});

		if (films.length === 0) {
			await interaction.editReply({
				content: "Not enough data yet.",
			});
			return;
		}

		// Custom renderer for divisive films (shows std dev)
		const renderDivisive = (
			items: unknown[],
			page: number,
			totalPages: number,
			metadata?: Record<string, unknown>,
		) => {
			const filmItems = items as typeof films;
			const embed = new EmbedBuilder()
				.setTitle("⚡ Most Divisive Films")
				.setDescription(
					"Films with the most disagreement among ratings (highest standard deviation)",
				)
				.setColor(Colors.WARNING);

			const startRank = (page - 1) * ((metadata?.pageSize as number) || 10) + 1;
			const lines = filmItems.map((f, i) => {
				const rank = startRank + i;
				const rankEmoji =
					rank <= 3
						? ["🥇", "🥈", "🥉"][rank - 1]
						: `\`${rank.toString().padStart(2)}\``;
				const year = f.year ? ` (${f.year})` : "";
				const rating = formatRatingDecimal(f.avgRating);
				const stdDev = f.stdDev.toFixed(2);
				return `${rankEmoji} **${f.title}**${year} — ⭐ ${rating}/10 (σ${stdDev})`;
			});

			embed.setDescription(lines.join("\n"));
			embed.setFooter({
				text: `Page ${page}/${totalPages} • ${metadata?.totalItems || filmItems.length} total`,
			});

			return embed;
		};

		// Use custom pagination
		await interaction.editReply({
			content: `Showing ${Math.min(films.length, PAGE_SIZE)} of ${films.length} films`,
		});

		// For now, show first page only - full pagination requires storing the render function
		const embed = renderDivisive(
			films.slice(0, PAGE_SIZE),
			1,
			Math.ceil(films.length / PAGE_SIZE),
			{ pageSize: PAGE_SIZE, totalItems: films.length },
		);
		await interaction.editReply({ embeds: [embed] });
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
