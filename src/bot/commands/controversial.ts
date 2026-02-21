import { Prisma } from "@prisma/client";
import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { formatRatingDecimal } from "../../utils/formatting.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
	.setName("controversial")
	.setDescription(
		"Your films sorted by how far you deviate from the guild average",
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

		const films = await prisma.$queryRaw<
			Array<{
				letterboxd_slug: string;
				title: string;
				year: number | null;
				user_rating: number;
				guild_avg: number;
				deviation: number;
			}>
		>(
			Prisma.sql`
        SELECT 
          f."letterboxdSlug" as letterboxd_slug,
          f.title,
          f.year,
          r.rating::float as user_rating,
          guild_avg.avg_rating as guild_avg,
          ABS(r.rating - guild_avg.avg_rating)::float as deviation
        FROM "Rating" r
        JOIN "Film" f ON r."letterboxdSlug" = f."letterboxdSlug"
        JOIN (
          SELECT "letterboxdSlug", AVG(rating) as avg_rating
          FROM "Rating"
          WHERE "guildId" = ${guildId} AND rating IS NOT NULL
          GROUP BY "letterboxdSlug"
          HAVING COUNT(rating) >= 3
        ) guild_avg ON r."letterboxdSlug" = guild_avg."letterboxdSlug"
        WHERE r."discordId" = ${discordId}
          AND r."guildId" = ${guildId}
          AND r.rating IS NOT NULL
        ORDER BY deviation DESC
        LIMIT 1000
      `,
		);

		if (films.length === 0) {
			await interaction.editReply({
				content: "Not enough rated films in common with the guild.",
			});
			return;
		}

		// This command shows a custom format, so we render pages manually
		const totalPages = Math.ceil(films.length / PAGE_SIZE);
		const page = 1;
		const pageData = films.slice(0, PAGE_SIZE);

		const lines = pageData.map((f, i) => {
			const rank = (page - 1) * PAGE_SIZE + i + 1;
			const year = f.year ? ` (${f.year})` : "";
			const userRating = formatRatingDecimal(f.user_rating);
			const guildAvg = formatRatingDecimal(f.guild_avg);
			const diff = (f.deviation * 2).toFixed(1);
			return `${rank}. **${f.title}**${year} — You: ${userRating}/10 | Guild: ${guildAvg}/10 (Δ${diff})`;
		});

		await interaction.editReply({
			embeds: [
				{
					title: `⚡ ${user.nickname || targetUser.username}'s Most Controversial Ratings`,
					description: lines.join("\n").slice(0, 4000),
					color: Colors.WARNING,
					footer: {
						text: `Page ${page}/${totalPages} • ${films.length} films • Sorted by deviation from guild average`,
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
