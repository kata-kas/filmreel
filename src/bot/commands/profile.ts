import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { getUserFavorites } from "../../db/queries/favorites.js";
import { getUserStats } from "../../db/queries/users.js";
import {
	getUserLevel,
	getUserXp,
	getXpForNextLevel,
} from "../../db/queries/xp.js";
import { logger } from "../../logger.js";
import { createProfileEmbed } from "../embeds/profile.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("profile")
	.setDescription("View your FilmReel profile")
	.addUserOption((option) =>
		option
			.setName("user")
			.setDescription("User to view (defaults to you)")
			.setRequired(false),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const targetUser = interaction.options.getUser("user") || interaction.user;
	const discordId = targetUser.id;

	try {
		const user = await prisma.user.findUnique({
			where: {
				discordId_guildId: { discordId, guildId },
			},
		});

		if (!user || user.deletedAt) {
			await interaction.editReply({
				content:
					targetUser.id === interaction.user.id
						? "You are not registered! Use `/register` first."
						: `${targetUser.username} is not registered.`,
			});
			return;
		}

		// Gather stats
		const [stats, favorites, xp, level, xpToNext] = await Promise.all([
			getUserStats(discordId, guildId),
			getUserFavorites(discordId, guildId),
			getUserXp(discordId, guildId),
			getUserLevel(discordId, guildId),
			getXpForNextLevel(discordId, guildId),
		]);

		// Get highest and lowest rated films
		const [highest, lowest] = await Promise.all([
			prisma.rating.findFirst({
				where: {
					discordId,
					guildId,
					rating: { not: null },
				},
				orderBy: { rating: "desc" },
				include: { film: true },
			}),
			prisma.rating.findFirst({
				where: {
					discordId,
					guildId,
					rating: { not: null },
				},
				orderBy: { rating: "asc" },
				include: { film: true },
			}),
		]);

		// Extract favorites by type
		const favoriteDirector = favorites.find(
			(f) => f.lookupType === "person",
		)?.canonicalName;
		const favoriteGenre = favorites.find(
			(f) => f.lookupType === "genre",
		)?.canonicalName;
		const favoriteCountry = favorites.find(
			(f) => f.lookupType === "country",
		)?.canonicalName;
		const favoriteStudio = favorites.find(
			(f) => f.lookupType === "company",
		)?.canonicalName;

		const embed = createProfileEmbed({
			nickname: user.nickname || targetUser.username,
			letterboxdUsername: user.letterboxdUsername,
			ratingsCount: stats.ratingsCount,
			watchedCount: stats.watchedCount,
			avgRating: stats.avgRating ? Number(stats.avgRating) : null,
			favoriteDirector,
			favoriteGenre,
			favoriteCountry,
			favoriteStudio,
			highestRatedFilm: highest
				? {
						title: highest.film.title,
						rating: Number(highest.rating),
					}
				: undefined,
			lowestRatedFilm: lowest
				? {
						title: lowest.film.title,
						rating: Number(lowest.rating),
					}
				: undefined,
			level,
			xp,
			xpToNextLevel: xpToNext,
			lastScraped: user.lastScraped,
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
