import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { formatRatingDecimal } from "../../utils/formatting.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("byyear")
	.setDescription("Show films you've rated from a specific year")
	.addIntegerOption((option) =>
		option
			.setName("year")
			.setDescription("Release year")
			.setRequired(true)
			.setMinValue(1888)
			.setMaxValue(2100),
	)
	.addUserOption((option) =>
		option
			.setName("user")
			.setDescription("User to analyze (defaults to you)")
			.setRequired(false),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const year = interaction.options.getInteger("year", true);
	const targetUser = interaction.options.getUser("user") || interaction.user;
	const discordId = targetUser.id;

	try {
		// Check if registered
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

		// Query films from this year
		const ratings = await prisma.rating.findMany({
			where: {
				discordId,
				guildId,
				rating: { not: null },
				film: {
					year,
				},
			},
			include: {
				film: true,
			},
			orderBy: {
				rating: "desc",
			},
			take: 50,
		});

		if (ratings.length === 0) {
			await interaction.editReply({
				content: `No films from ${year} found in your rated films.`,
			});
			return;
		}

		const avgRating =
			ratings.reduce((sum, r) => sum + Number(r.rating), 0) / ratings.length;

		const lines = ratings.map((r) => {
			return `• **${r.film.title}** — ⭐ ${formatRatingDecimal(r.rating)}/10`;
		});

		await interaction.editReply({
			embeds: [
				{
					title: `📅 Films from ${year}`,
					description: [
						`**${ratings.length} films** — Average: ⭐ ${formatRatingDecimal(avgRating)}/10`,
						"",
						...lines,
					]
						.join("\n")
						.slice(0, 4000),
					color: Colors.INFO,
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
