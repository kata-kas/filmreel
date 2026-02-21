import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("friends")
	.setDescription("Find users with the most films in common")
	.addSubcommand((subcommand) =>
		subcommand
			.setName("rated")
			.setDescription("Users with most films rated in common")
			.addUserOption((option) =>
				option
					.setName("user")
					.setDescription("User to analyze (defaults to you)")
					.setRequired(false),
			),
	)
	.addSubcommand((subcommand) =>
		subcommand
			.setName("watched")
			.setDescription(
				"Users with most films watched in common (regardless of rating)",
			)
			.addUserOption((option) =>
				option
					.setName("user")
					.setDescription("User to analyze (defaults to you)")
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

		if (subcommand === "rated") {
			const userRatings = await prisma.rating.findMany({
				where: {
					discordId,
					guildId,
					rating: { not: null },
				},
				select: {
					letterboxdSlug: true,
					rating: true,
				},
			});

			const userSlugs = new Set(userRatings.map((r) => r.letterboxdSlug));

			const otherUsers = await prisma.user.findMany({
				where: {
					guildId,
					discordId: { not: discordId },
					deletedAt: null,
				},
			});

			const friendships = [];

			for (const other of otherUsers) {
				const otherRatings = await prisma.rating.findMany({
					where: {
						discordId: other.discordId,
						guildId,
						rating: { not: null },
						letterboxdSlug: { in: Array.from(userSlugs) },
					},
					select: {
						letterboxdSlug: true,
						rating: true,
					},
				});

				if (otherRatings.length > 0) {
					let totalDifference = 0;
					for (const r of otherRatings) {
						const userRating = userRatings.find(
							(ur) => ur.letterboxdSlug === r.letterboxdSlug,
						);
						if (userRating?.rating && r.rating) {
							totalDifference += Math.abs(
								Number(userRating.rating) - Number(r.rating),
							);
						}
					}

					friendships.push({
						rank: 0, // Will be set after sorting
						discordId: other.discordId,
						nickname: other.nickname,
						value: otherRatings.length,
						secondaryValue: totalDifference / otherRatings.length,
					});
				}
			}

			friendships.sort((a, b) => b.value - a.value);
			// Update ranks
			friendships.forEach((f, i) => {
				f.rank = i + 1;
			});

			if (friendships.length === 0) {
				await interaction.editReply({
					content: "No rated films in common with other users.",
				});
				return;
			}

			await createPagination(interaction, friendships, "userLeaderboard", {
				title: `🤝 Most Films Rated in Common with ${targetUser.username}`,
				valueLabel: "films",
				secondaryLabel: "avg diff",
			});
		} else if (subcommand === "watched") {
			const userRatings = await prisma.rating.findMany({
				where: {
					discordId,
					guildId,
					watched: true,
				},
				select: {
					letterboxdSlug: true,
				},
			});

			const userSlugs = new Set(userRatings.map((r) => r.letterboxdSlug));

			const otherUsers = await prisma.user.findMany({
				where: {
					guildId,
					discordId: { not: discordId },
					deletedAt: null,
				},
			});

			const friendships = [];

			for (const other of otherUsers) {
				const count = await prisma.rating.count({
					where: {
						discordId: other.discordId,
						guildId,
						watched: true,
						letterboxdSlug: { in: Array.from(userSlugs) },
					},
				});

				if (count > 0) {
					friendships.push({
						rank: 0,
						discordId: other.discordId,
						nickname: other.nickname,
						value: count,
					});
				}
			}

			friendships.sort((a, b) => b.value - a.value);
			friendships.forEach((f, i) => {
				f.rank = i + 1;
			});

			if (friendships.length === 0) {
				await interaction.editReply({
					content: "No watched films in common with other users.",
				});
				return;
			}

			await createPagination(interaction, friendships, "userLeaderboard", {
				title: `👀 Most Films Watched in Common with ${targetUser.username}`,
				valueLabel: "films",
			});
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
