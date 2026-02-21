import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("watchlist")
	.setDescription("Show common films in two users' Letterboxd watchlists")
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
		const [user1Data, user2Data] = await Promise.all([
			prisma.user.findUnique({
				where: { discordId_guildId: { discordId: user1.id, guildId } },
				select: { deletedAt: true },
			}),
			prisma.user.findUnique({
				where: { discordId_guildId: { discordId: user2.id, guildId } },
				select: { deletedAt: true },
			}),
		]);

		if (!user1Data || user1Data.deletedAt) {
			await interaction.editReply({
				content: `${user1.username} is not registered.`,
			});
			return;
		}

		if (!user2Data || user2Data.deletedAt) {
			await interaction.editReply({
				content:
					user2.id === interaction.user.id
						? "You are not registered! Use `/register` first."
						: `${user2.username} is not registered.`,
			});
			return;
		}

		const [watchlist1, watchlist2] = await Promise.all([
			prisma.rating.findMany({
				where: {
					discordId: user1.id,
					guildId,
					watched: false,
				},
				select: {
					letterboxdSlug: true,
					film: {
						select: {
							title: true,
							year: true,
						},
					},
				},
			}),
			prisma.rating.findMany({
				where: {
					discordId: user2.id,
					guildId,
					watched: false,
				},
				select: {
					letterboxdSlug: true,
				},
			}),
		]);

		const watchlist2Slugs = new Set(
			watchlist2.map((film) => film.letterboxdSlug),
		);
		const common = watchlist1
			.filter((film) => watchlist2Slugs.has(film.letterboxdSlug))
			.map((film) => ({
				letterboxdSlug: film.letterboxdSlug,
				title: film.film.title,
				year: film.film.year,
			}));

		if (common.length === 0) {
			await interaction.editReply({
				content: `${user1.username} and ${user2.username} have no common films in their watchlists.`,
			});
			return;
		}

		await createPagination(interaction, common, "filmList", {
			title: `🎬 Common Watchlist — ${user1.username} + ${user2.username}`,
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
			content:
				"Failed to fetch watchlists right now. Please try again in a minute.",
		});
	}
}
