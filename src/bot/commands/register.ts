import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import { enqueueUserScrape, getQueuePosition } from "../../queue/enqueue.js";
import { extractLetterboxdUsername } from "../../scraper/letterboxd.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("register")
	.setDescription("Register your Letterboxd account")
	.addStringOption((option) =>
		option
			.setName("letterboxd_url")
			.setDescription("Your Letterboxd profile URL")
			.setRequired(true),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const letterboxdUrl = interaction.options.getString("letterboxd_url", true);
	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const discordId = interaction.user.id;

	try {
		// Extract username from URL first (fail fast on invalid input)
		const letterboxdUsername = extractLetterboxdUsername(letterboxdUrl);

		if (!letterboxdUsername) {
			await interaction.editReply({
				content:
					"Invalid Letterboxd URL. Please provide a valid profile URL (e.g., https://letterboxd.com/username/).",
			});
			return;
		}

		// Upsert: create if not exists, restore if soft-deleted; 0 rows = already registered
		const upserted = await prisma.$queryRaw<
			Array<{ discordId: string; guildId: string; letterboxdUsername: string }>
		>`
			INSERT INTO "User" ("discordId", "guildId", "letterboxdUsername", "createdAt")
			VALUES (${discordId}, ${guildId}, ${letterboxdUsername}, NOW())
			ON CONFLICT ("discordId", "guildId")
			DO UPDATE SET
				"letterboxdUsername" = EXCLUDED."letterboxdUsername",
				"deletedAt" = NULL,
				"lastScraped" = NULL
			WHERE "User"."deletedAt" IS NOT NULL
			RETURNING "discordId", "guildId", "letterboxdUsername"
		`;

		if (upserted.length === 0) {
			await interaction.editReply({
				content: `You're already registered! Use "/setlb" to change your Letterboxd username.`,
			});
			return;
		}

		// Enqueue full scrape
		const jobId = await enqueueUserScrape({
			discordId,
			guildId,
			full: true,
		});

		const queuePosition = await getQueuePosition("scrape", jobId);

		await interaction.editReply({
			embeds: [
				{
					title: "✅ Registration Successful",
					description: `Welcome, **${letterboxdUsername}**!\n\nYour profile has been registered and a full scrape has been queued.`,
					color: Colors.SUCCESS,
					fields: [
						{
							name: "⏳ Queue Position",
							value:
								queuePosition > 0
									? `You are #${queuePosition} in the queue.`
									: "Your scrape is processing...",
							inline: false,
						},
						{
							name: "📋 Next Steps",
							value:
								"Use `/setnick` to set a nickname, `/scrape` to manually trigger updates, or `/profile` to see your stats.",
							inline: false,
						},
					],
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
			content: "An error occurred while registering. Please try again later.",
		});
	}
}
