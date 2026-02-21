import { Prisma } from "@prisma/client";
import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { formatRatingDecimal } from "../../utils/formatting.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

// ISO country codes mapping
const COUNTRY_CODES: Record<string, string> = {
	us: "US",
	usa: "US",
	"united states": "US",
	uk: "GB",
	gb: "GB",
	"united kingdom": "GB",
	britain: "GB",
	fr: "FR",
	france: "FR",
	de: "DE",
	germany: "DE",
	jp: "JP",
	japan: "JP",
	kr: "KR",
	"south korea": "KR",
	korea: "KR",
	in: "IN",
	india: "IN",
	it: "IT",
	italy: "IT",
	es: "ES",
	spain: "ES",
	ca: "CA",
	canada: "CA",
	au: "AU",
	australia: "AU",
	mx: "MX",
	mexico: "MX",
	br: "BR",
	brazil: "BR",
	cn: "CN",
	china: "CN",
	ru: "RU",
	russia: "RU",
	se: "SE",
	sweden: "SE",
	dk: "DK",
	denmark: "DK",
	no: "NO",
	norway: "NO",
};

function normalizeCountry(input: string): string | null {
	const normalized = input.toLowerCase().trim();
	return COUNTRY_CODES[normalized] || null;
}

export const data = new SlashCommandBuilder()
	.setName("bycountry")
	.setDescription("Show films you've rated from a specific country")
	.addStringOption((option) =>
		option
			.setName("country")
			.setDescription('Country name or ISO code (e.g., "Japan", "JP")')
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
	const countryInput = interaction.options.getString("country", true);
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

		const countryCode = normalizeCountry(countryInput);
		if (!countryCode) {
			await interaction.editReply({
				content: `Could not recognize country "${countryInput}". Try using the ISO code (e.g., "US", "JP").`,
			});
			return;
		}

		const excludedCount = await prisma.$queryRaw<[{ count: number }]>(
			Prisma.sql`
        SELECT COUNT(*)::int as count
        FROM "Film" f
        WHERE array_length(f.country, 1) IS NULL OR array_length(f.country, 1) = 0
      `,
		);

		if (excludedCount[0] && excludedCount[0].count > 0) {
			log.log(
				{ excludedCount: excludedCount[0].count },
				"Excluding films without country data",
			);
		}

		const countryPattern = `%${countryCode}%`;
		const ratings = await prisma.$queryRaw<
			Array<{
				letterboxd_slug: string;
				title: string;
				year: number | null;
				rating: number;
			}>
		>(
			Prisma.sql`
        SELECT 
          f."letterboxdSlug" as letterboxd_slug,
          f.title,
          f.year,
          r.rating::float as rating
        FROM "Rating" r
        JOIN "Film" f ON r."letterboxdSlug" = f."letterboxdSlug"
        WHERE r."discordId" = ${discordId}
          AND r."guildId" = ${guildId}
          AND r.rating IS NOT NULL
          AND f.country IS NOT NULL
          AND array_length(f.country, 1) > 0
          AND EXISTS (
            SELECT 1 FROM unnest(f.country) c
            WHERE LOWER(c) LIKE LOWER(${countryPattern})
          )
        ORDER BY r.rating DESC
        LIMIT 50
      `,
		);

		if (ratings.length === 0) {
			await interaction.editReply({
				content: `No films from ${countryCode} found in your rated films. Note: Country data requires metadata resolution.`,
			});
			return;
		}

		const avgRating =
			ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

		const lines = ratings.map((r) => {
			const year = r.year ? ` (${r.year})` : "";
			return `• **${r.title}**${year} — ⭐ ${formatRatingDecimal(r.rating)}/10`;
		});

		await interaction.editReply({
			embeds: [
				{
					title: `🌍 Films from ${countryCode}`,
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
