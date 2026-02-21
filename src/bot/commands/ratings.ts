import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { getFilm, searchFilms } from "../../db/queries/films.js";
import { getListByName } from "../../db/queries/lists.js";
import { logger } from "../../logger.js";
import { formatRatingDecimal } from "../../utils/formatting.js";
import { Colors } from "../embeds/colors.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("ratings")
	.setDescription(
		"Show all ratings for a film or all ratings by a user on a list",
	)
	.addStringOption((option) =>
		option
			.setName("film")
			.setDescription("Film title (for film ratings)")
			.setRequired(false),
	)
	.addUserOption((option) =>
		option
			.setName("user")
			.setDescription("User (for their ratings on a list)")
			.setRequired(false),
	)
	.addStringOption((option) =>
		option
			.setName("listname")
			.setDescription("List name (required when using user option)")
			.setRequired(false),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const filmQuery = interaction.options.getString("film");
	const targetUser = interaction.options.getUser("user");
	const listName = interaction.options.getString("listname");

	try {
		// Case 1: Film ratings
		if (filmQuery && !targetUser) {
			let film = await getFilm(filmQuery);

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

			const ratings = await prisma.rating.findMany({
				where: {
					letterboxdSlug: film.letterboxdSlug,
					guildId,
					rating: { not: null },
				},
				include: {
					user: {
						select: { nickname: true, letterboxdUsername: true },
					},
				},
				orderBy: { rating: "desc" },
			});

			if (ratings.length === 0) {
				await interaction.editReply({
					content: `No ratings found for "${film.title}".`,
				});
				return;
			}

			const entries = ratings.map((r) => ({
				name: r.user?.nickname || r.user?.letterboxdUsername || "Unknown",
				rating: r.rating ? Number(r.rating) : null,
			}));

			await createPagination(
				interaction,
				entries,
				"ratingList",
				{
					title: `🎬 Ratings for "${film.title}"`,
					filmTitle: film.title,
				},
				{ pageSize: 15 },
			);
			return;
		}

		// Case 2: User's ratings on a list
		if (targetUser && listName) {
			const list = await getListByName(guildId, listName);
			if (!list) {
				await interaction.editReply({
					content: `List "${listName}" not found.`,
				});
				return;
			}

			const filmSlugs = list.listFilms.map((lf) => lf.letterboxdSlug);

			const ratings = await prisma.rating.findMany({
				where: {
					discordId: targetUser.id,
					guildId,
					letterboxdSlug: { in: filmSlugs },
				},
				include: {
					film: true,
				},
				orderBy: {
					rating: "desc",
				},
			});

			const ratedSlugs = new Set(ratings.map((r) => r.letterboxdSlug));

			// Build list with positions - this needs custom rendering
			const listItems = list.listFilms.map((lf) => {
				const rating = ratings.find(
					(r) => r.letterboxdSlug === lf.letterboxdSlug,
				);
				return {
					position: lf.position,
					title: lf.film.title,
					year: lf.film.year,
					seen: !!rating,
					rating: rating?.rating ? Number(rating.rating) : null,
				};
			});

			const lines = listItems.map((item) => {
				const year = item.year ? ` (${item.year})` : "";
				const status =
					item.rating !== null
						? `⭐ ${formatRatingDecimal(item.rating)}/10`
						: item.seen
							? "👁️ Seen"
							: "❌ Unseen";
				return `\`${item.position.toString().padStart(3)}\` ${item.title}${year} — ${status}`;
			});

			await interaction.editReply({
				embeds: [
					{
						title: `📋 ${targetUser.username}'s Ratings — ${list.listName}`,
						description: lines.join("\n").slice(0, 4000),
						color: Colors.INFO,
						footer: {
							text: `${ratedSlugs.size}/${filmSlugs.length} films seen`,
						},
					},
				],
			});
			return;
		}

		await interaction.editReply({
			content:
				"Please provide either a film name, or both a user and list name.",
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
