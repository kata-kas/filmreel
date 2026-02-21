import { Prisma } from "@prisma/client";
import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { getListByName } from "../../db/queries/lists.js";
import { logger } from "../../logger.js";
import { createPagination } from "../pagination.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("all")
	.setDescription("Show all rated films (union of /lb and /alt)")
	.addStringOption((option) =>
		option
			.setName("listname")
			.setDescription("Filter to a specific list")
			.setRequired(false),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const listName = interaction.options.getString("listname");

	try {
		let listId: number | null = null;
		let listTitle = "";

		if (listName) {
			const list = await getListByName(guildId, listName);
			if (!list) {
				await interaction.editReply({
					content: `List "${listName}" not found.`,
				});
				return;
			}
			listId = list.id;
			listTitle = ` — ${list.listName}`;
		}

		const films = await prisma.$queryRaw<
			Array<{
				letterboxd_slug: string;
				title: string;
				year: number | null;
				avg_rating: number;
				rating_count: number;
			}>
		>(
			listId != null
				? Prisma.sql`
            SELECT 
              f."letterboxdSlug" as letterboxd_slug,
              f.title,
              f.year,
              AVG(r.rating)::float as avg_rating,
              COUNT(r.rating)::int as rating_count
            FROM "Film" f
            JOIN "Rating" r ON f."letterboxdSlug" = r."letterboxdSlug"
            WHERE r."guildId" = ${guildId}
              AND r.rating IS NOT NULL
              AND f."letterboxdSlug" IN (SELECT "letterboxdSlug" FROM "ListFilm" WHERE "listId" = ${listId})
            GROUP BY f."letterboxdSlug", f.title, f.year
            HAVING COUNT(r.rating) >= 3
            ORDER BY avg_rating DESC, rating_count DESC
            LIMIT 1000
          `
				: Prisma.sql`
            SELECT 
              f."letterboxdSlug" as letterboxd_slug,
              f.title,
              f.year,
              AVG(r.rating)::float as avg_rating,
              COUNT(r.rating)::int as rating_count
            FROM "Film" f
            JOIN "Rating" r ON f."letterboxdSlug" = r."letterboxdSlug"
            WHERE r."guildId" = ${guildId}
              AND r.rating IS NOT NULL
            GROUP BY f."letterboxdSlug", f.title, f.year
            HAVING COUNT(r.rating) >= 3
            ORDER BY avg_rating DESC, rating_count DESC
            LIMIT 1000
          `,
		);

		if (films.length === 0) {
			await interaction.editReply({
				content: "No rated films found.",
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
				ratingCount: f.rating_count,
			})),
			"filmLeaderboard",
			{
				title: `📚 All Films${listTitle}`,
				description: "All films with 3+ ratings",
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
