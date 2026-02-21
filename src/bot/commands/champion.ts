import { Prisma } from "@prisma/client";
import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { clampMinRatings } from "../../db/validation.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("champion")
	.setDescription("Films the guild is disproportionately obsessed with")
	.addIntegerOption((option) =>
		option
			.setName("min_ratings")
			.setDescription("Minimum guild ratings required (default: 20)")
			.setRequired(false)
			.setMinValue(5),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const minRatings = clampMinRatings(
		interaction.options.getInteger("min_ratings") ?? undefined,
		20,
	);

	try {
		const excludedCount = await prisma.$queryRaw<[{ count: number }]>(
			Prisma.sql`
        SELECT COUNT(*)::int as count
        FROM "Film" f
        WHERE f."letterboxdVotes" IS NULL
      `,
		);

		if (excludedCount[0] && excludedCount[0].count > 0) {
			log.log(
				{ excludedCount: excludedCount[0].count },
				"Excluding films without Letterboxd vote data",
			);
		}

		const films = await prisma.$queryRaw<
			Array<{
				letterboxd_slug: string;
				title: string;
				year: number | null;
				guild_count: number;
				total_ratings: number | null;
				avg_rating: number;
				ratio: number;
			}>
		>(
			Prisma.sql`
        SELECT 
          f."letterboxdSlug" as letterboxd_slug,
          f.title,
          f.year,
          COUNT(r.rating)::int as guild_count,
          f."letterboxdVotes" as total_ratings,
          AVG(r.rating)::float as avg_rating,
          CASE 
            WHEN f."letterboxdVotes" IS NOT NULL AND f."letterboxdVotes" > 0
            THEN COUNT(r.rating)::float / f."letterboxdVotes"::float
            ELSE 0
          END as ratio
        FROM "Film" f
        JOIN "Rating" r ON f."letterboxdSlug" = r."letterboxdSlug"
        WHERE r."guildId" = ${guildId}
          AND r.rating IS NOT NULL
          AND f."letterboxdVotes" IS NOT NULL
        GROUP BY f."letterboxdSlug", f.title, f.year, f."letterboxdVotes"
        HAVING COUNT(r.rating) >= ${minRatings}
        ORDER BY ratio DESC
        LIMIT 1000
      `,
		);

		if (films.length === 0) {
			await interaction.editReply({
				content: "Not enough data. Run some scrapes first.",
			});
			return;
		}

		await createPagination(
			interaction,
			films.map((f) => ({
				letterboxdSlug: f.letterboxd_slug,
				title: f.title,
				year: f.year,
				avgRating: f.avg_rating,
				ratingCount: f.guild_count,
			})),
			"filmLeaderboard",
			{
				title: "🏆 Champion Films",
				description: `Films the guild is disproportionately obsessed with (highest guild/total rating ratio).\nMinimum ${minRatings} guild ratings required.`,
			},
		);
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
