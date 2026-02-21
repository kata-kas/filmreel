import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { getFilm, searchFilms } from "../../db/queries/films.js";
import { logger } from "../../logger.js";
import { createFilmEmbed } from "../embeds/profile.js";
import { ensureGuildContext } from "../utils/guildGuard.js";
// formatRatingDecimal not used - embed handles formatting

export const data = new SlashCommandBuilder()
	.setName("rating")
	.setDescription("Look up a film's rating")
	.addStringOption((option) =>
		option
			.setName("film")
			.setDescription("Film title")
			.setRequired(true)
			.setAutocomplete(true),
	)
	.addUserOption((option) =>
		option
			.setName("user")
			.setDescription("Show this user's rating for the film")
			.setRequired(false),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const filmQuery = interaction.options.getString("film", true);
	const targetUser = interaction.options.getUser("user");

	try {
		// Search for film
		let film = await getFilm(filmQuery);

		if (!film) {
			// Try fuzzy search
			const results = await searchFilms(filmQuery, 1);
			if (results.length > 0) {
				film = results[0];
			}
		}

		if (!film) {
			await interaction.editReply({
				content: `Film "${filmQuery}" not found. Try a different title.`,
			});
			return;
		}

		// Get server stats
		const serverStats = await prisma.rating.aggregate({
			where: {
				letterboxdSlug: film.letterboxdSlug,
				guildId,
				rating: { not: null },
			},
			_avg: { rating: true },
			_count: { rating: true },
		});

		// Get user rating if requested
		let userRating: number | null | undefined;
		if (targetUser) {
			const userRatingData = await prisma.rating.findUnique({
				where: {
					discordId_guildId_letterboxdSlug: {
						discordId: targetUser.id,
						guildId,
						letterboxdSlug: film.letterboxdSlug,
					},
				},
			});
			userRating =
				userRatingData?.rating !== null && userRatingData?.rating !== undefined
					? Number(userRatingData.rating)
					: null;
		}

		// Use posterPath directly from Film table if available
		const posterUrl = film.posterPath ?? undefined;

		const embed = createFilmEmbed({
			title: film.title,
			year: film.year,
			avgRating: serverStats._avg.rating
				? Number(serverStats._avg.rating)
				: null,
			ratingCount: serverStats._count.rating,
			userRating,
			posterUrl,
		});

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
