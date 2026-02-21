import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import {
	getSeasonOrDefault,
	getSeasonYearStats,
} from "../../db/queries/seasons.js";
import { logger } from "../../logger.js";
import { formatRatingDecimal } from "../../utils/formatting.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("roulette")
	.setDescription("Season statistics")
	.addSubcommand((subcommand) =>
		subcommand
			.setName("stats")
			.setDescription("Show season statistics")
			.addStringOption((option) =>
				option
					.setName("category")
					.setDescription("Statistic category")
					.setRequired(true)
					.addChoices(
						{ name: "Director breakdown", value: "director" },
						{ name: "Film stats", value: "film" },
						{ name: "Year breakdown", value: "year" },
						{ name: "Most seen", value: "seen" },
						{ name: "Total runtime", value: "time" },
						{ name: "Avg rating TO", value: "avgto" },
						{ name: "Avg rating FROM", value: "avgfrom" },
					),
			)
			.addIntegerOption((option) =>
				option
					.setName("season")
					.setDescription("Season ID (defaults to active/most recent)")
					.setRequired(false),
			),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const subcommand = interaction.options.getSubcommand();

	if (subcommand === "stats") {
		const category = interaction.options.getString("category", true);
		const seasonId = interaction.options.getInteger("season") || undefined;

		try {
			const season = await getSeasonOrDefault(guildId, seasonId);

			if (!season) {
				await interaction.editReply({
					content: "No seasons found. Create one with `/addseason`.",
				});
				return;
			}

			const filmSlugs = season.list.listFilms.map((lf) => lf.letterboxdSlug);

			switch (category) {
				case "director": {
					// Would need TMDB director data
					await interaction.editReply({
						content: "Director stats require TMDB data. Feature coming soon.",
					});
					return;
				}

				case "film": {
					const ratings = await prisma.rating.findMany({
						where: {
							guildId,
							letterboxdSlug: { in: filmSlugs },
							watchedDate: {
								gte: season.startDate,
								lte: season.endDate,
							},
						},
						include: {
							film: true,
							user: { select: { nickname: true } },
						},
					});

					const filmStats = new Map<
						string,
						{
							title: string;
							count: number;
							avgRating: number;
							ratingCount: number;
						}
					>();
					for (const r of ratings) {
						const stat = filmStats.get(r.letterboxdSlug) || {
							title: r.film.title,
							count: 0,
							avgRating: 0,
							ratingCount: 0,
						};
						stat.count++;
						if (r.rating) {
							stat.avgRating =
								(stat.avgRating * stat.ratingCount + Number(r.rating)) /
								(stat.ratingCount + 1);
							stat.ratingCount++;
						}
						filmStats.set(r.letterboxdSlug, stat);
					}

					const sorted = Array.from(filmStats.entries())
						.sort((a, b) => b[1].count - a[1].count)
						.slice(0, 25);

					const lines = sorted.map(([_, stat], i) => {
						const rating =
							stat.ratingCount > 0
								? ` — ⭐ ${formatRatingDecimal(stat.avgRating)}/10`
								: "";
						return `${i + 1}. **${stat.title}** — ${stat.count} viewers${rating}`;
					});

					await interaction.editReply({
						embeds: [
							{
								title: `🎬 Film Stats — ${season.name}`,
								description: lines.join("\n").slice(0, 4000),
								color: Colors.INFO,
							},
						],
					});
					return;
				}

				case "year": {
					const yearStats = await getSeasonYearStats(season.id, guildId);

					if (yearStats.length === 0) {
						await interaction.editReply({
							content: "No year data available.",
						});
						return;
					}

					const lines = yearStats.map((y, i) => {
						return `${i + 1}. **${y.year}** — ${y.count} films`;
					});

					await interaction.editReply({
						embeds: [
							{
								title: `📅 Year Breakdown — ${season.name}`,
								description: lines.join("\n").slice(0, 4000),
								color: Colors.INFO,
							},
						],
					});
					return;
				}

				case "seen": {
					const ratings = await prisma.rating.findMany({
						where: {
							guildId,
							letterboxdSlug: { in: filmSlugs },
							watchedDate: {
								gte: season.startDate,
								lte: season.endDate,
							},
						},
						include: {
							user: { select: { nickname: true } },
						},
					});

					const userCounts = new Map<
						string,
						{ nickname: string | null; count: number }
					>();
					for (const r of ratings) {
						const existing = userCounts.get(r.discordId);
						if (existing) {
							existing.count++;
						} else {
							userCounts.set(r.discordId, {
								nickname: r.user?.nickname,
								count: 1,
							});
						}
					}

					const sorted = Array.from(userCounts.entries())
						.sort((a, b) => b[1].count - a[1].count)
						.slice(0, 25);

					const lines = sorted.map(([_, stat], i) => {
						return `${i + 1}. **${stat.nickname || "Unknown"}** — ${stat.count} films`;
					});

					await interaction.editReply({
						embeds: [
							{
								title: `👀 Most Seen — ${season.name}`,
								description: lines.join("\n").slice(0, 4000),
								color: Colors.INFO,
							},
						],
					});
					return;
				}

				case "time": {
					// Would need TMDB runtime data
					await interaction.editReply({
						content: "Runtime stats require TMDB data. Feature coming soon.",
					});
					return;
				}

				case "avgto":
				case "avgfrom": {
					await interaction.editReply({
						content: "Average rating stats coming soon.",
					});
					return;
				}
			}
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
}
