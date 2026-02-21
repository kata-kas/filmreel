import { Prisma } from "@prisma/client";
import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { getUserLevel } from "../../db/queries/xp.js";
import { logger } from "../../logger.js";
import { formatNumber } from "../../utils/formatting.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

const PAGE_SIZE = 10;

export const data = new SlashCommandBuilder()
	.setName("xp")
	.setDescription("View the XP leaderboard");

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;

	try {
		const result = await prisma.$queryRaw<
			Array<{
				discord_id: string;
				nickname: string | null;
				xp: number;
			}>
		>(
			Prisma.sql`
        SELECT 
          u."discordId" as discord_id,
          u.nickname,
          COALESCE(SUM(xe."xpAwarded"), 0)::int as xp
        FROM "User" u
        LEFT JOIN "XpEvent" xe ON u."discordId" = xe."discordId" AND u."guildId" = xe."guildId"
        WHERE u."guildId" = ${guildId}
          AND u."deletedAt" IS NULL
        GROUP BY u."discordId", u.nickname
        HAVING COALESCE(SUM(xe."xpAwarded"), 0) > 0
        ORDER BY xp DESC
        LIMIT 1000
      `,
		);

		if (result.length === 0) {
			await interaction.editReply({
				content: "No XP earned yet. Start rating films to earn XP!",
			});
			return;
		}

		// Calculate levels for each user
		const entries = await Promise.all(
			result.map(async (row, index) => ({
				rank: index + 1,
				discordId: row.discord_id,
				nickname: row.nickname,
				value: row.xp,
				level: await getUserLevel(row.discord_id, guildId),
			})),
		);

		// Since we have level info, use custom rendering
		const totalPages = Math.ceil(entries.length / PAGE_SIZE) || 1;
		const page = 1;
		const pageData = entries.slice(0, PAGE_SIZE);

		const lines = pageData.map((entry) => {
			const rankEmoji =
				entry.rank <= 3
					? ["🥇", "🥈", "🥉"][entry.rank - 1]
					: `\`${entry.rank.toString().padStart(2)}\``;
			const name = entry.nickname || "Unknown";
			return `${rankEmoji} **${name}** — Level ${entry.level} • ${formatNumber(entry.value)} XP`;
		});

		await interaction.editReply({
			embeds: [
				{
					title: "⭐ XP Leaderboard",
					description: lines.join("\n"),
					color: Colors.GOLD,
					footer: {
						text: `Page ${page}/${totalPages} • ${entries.length} users • Earn XP by rating films, rewatches, and completing lists!`,
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
