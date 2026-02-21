import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { searchFilms } from "../../db/queries/films.js";
import { logger } from "../../logger.js";
import { formatRatingDecimal } from "../../utils/formatting.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("avid")
	.setDescription("Who has seen a film the most times?")
	.addStringOption((option) =>
		option.setName("film").setDescription("Film title").setRequired(true),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const filmQuery = interaction.options.getString("film", true);

	try {
		// Find film
		let film = await prisma.film.findUnique({
			where: { letterboxdSlug: filmQuery },
		});

		if (!film) {
			const results = await searchFilms(filmQuery, 1);
			if (results.length > 0) {
				film = results[0];
			}
		}

		if (!film) {
			await interaction.editReply({
				content: `Film "${filmQuery}" not found.`,
			});
			return;
		}

		// Get all view counts for this film
		const ratings = await prisma.rating.findMany({
			where: {
				letterboxdSlug: film.letterboxdSlug,
				guildId,
				watched: true,
			},
			include: {
				user: {
					select: { nickname: true, letterboxdUsername: true },
				},
			},
			orderBy: {
				viewCount: "desc",
			},
			take: 25,
		});

		if (ratings.length === 0) {
			await interaction.editReply({
				content: `No one has watched "${film.title}" yet.`,
			});
			return;
		}

		const lines = ratings.map((r, i) => {
			const name = r.user?.nickname || r.user?.letterboxdUsername || "Unknown";
			const viewEmoji = r.viewCount > 1 ? "🔁" : "👁️";
			const rating = r.rating
				? ` (⭐ ${formatRatingDecimal(r.rating)}/10)`
				: "";
			return `${i + 1}. **${name}** — ${viewEmoji} ${r.viewCount}x${rating}`;
		});

		await interaction.editReply({
			embeds: [
				{
					title: `🔁 Most Watched: ${film.title}`,
					description: lines.join("\n").slice(0, 4000),
					color: Colors.INFO,
					footer: { text: `${ratings.length} users have seen this film` },
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
