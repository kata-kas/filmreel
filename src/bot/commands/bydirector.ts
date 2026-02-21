import { Prisma } from "@prisma/client";
import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { formatRatingDecimal } from "../../utils/formatting.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("bydirector")
	.setDescription("Show films you've rated by a specific director")
	.addStringOption((option) =>
		option
			.setName("director")
			.setDescription("Director name")
			.setRequired(true),
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
	const directorName = interaction.options.getString("director", true);
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

		const excludedCount = await prisma.$queryRaw<[{ count: number }]>(
			Prisma.sql`
        SELECT COUNT(*)::int as count
        FROM "Film" f
        WHERE array_length(f.director, 1) IS NULL OR array_length(f.director, 1) = 0
      `,
		);

		if (excludedCount[0] && excludedCount[0].count > 0) {
			log.log(
				{ excludedCount: excludedCount[0].count },
				"Excluding films without director data",
			);
		}

		const directorPattern = `%${directorName}%`;
		const ratings = await prisma.$queryRaw<
			Array<{
				letterboxd_slug: string;
				title: string;
				year: number | null;
				rating: number;
				directors: string[];
			}>
		>(
			Prisma.sql`
        SELECT 
          f."letterboxdSlug" as letterboxd_slug,
          f.title,
          f.year,
          r.rating::float as rating,
          f.director as directors
        FROM "Rating" r
        JOIN "Film" f ON r."letterboxdSlug" = f."letterboxdSlug"
        WHERE r."discordId" = ${discordId}
          AND r."guildId" = ${guildId}
          AND r.rating IS NOT NULL
          AND f.director IS NOT NULL
          AND array_length(f.director, 1) > 0
          AND EXISTS (
            SELECT 1 FROM unnest(f.director) d
            WHERE LOWER(d) LIKE LOWER(${directorPattern})
          )
        ORDER BY r.rating DESC
        LIMIT 50
      `,
		);

		if (ratings.length === 0) {
			await interaction.editReply({
				content: `No films by director matching "${directorName}" found in your rated films. Note: Director data requires metadata resolution.`,
			});
			return;
		}

		// Calculate stats
		const avgRating =
			ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

		// Get the matched director name for display (use first match)
		const matchedDirector =
			ratings[0]?.directors.find((d) =>
				d.toLowerCase().includes(directorName.toLowerCase()),
			) ?? directorName;

		const lines = ratings.map((r) => {
			const year = r.year ? ` (${r.year})` : "";
			return `• **${r.title}**${year} — ⭐ ${formatRatingDecimal(r.rating)}/10`;
		});

		await interaction.editReply({
			embeds: [
				{
					title: `🎬 Films by ${matchedDirector}`,
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
