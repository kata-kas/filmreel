import type { ChatInputCommandInteraction } from "discord.js";
import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { config } from "../../config/index.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";
import {
	enqueueUserScrape,
	getQueueDepth,
	getQueuePosition,
} from "../../queue/enqueue.js";
import { Colors } from "../embeds/colors.js";

// Track last scrape times for cooldown (bounded by TTL cleanup)
const scrapeCooldowns = new Map<string, number>();
const COOLDOWN_CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

function cleanupExpiredCooldowns(): void {
	const cooldownMs = config.SCRAPE_COOLDOWN_MINUTES * 60 * 1000;
	const now = Date.now();
	const cutoff = now - cooldownMs;
	for (const [key, lastScrape] of scrapeCooldowns.entries()) {
		if (lastScrape < cutoff) {
			scrapeCooldowns.delete(key);
		}
	}
}

// Periodic cleanup to prevent map growth
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function scheduleCooldownCleanup(): void {
	if (cleanupTimer) return;
	cleanupTimer = setInterval(
		cleanupExpiredCooldowns,
		COOLDOWN_CLEANUP_INTERVAL_MS,
	);
	cleanupTimer.unref?.();
}

export const data = new SlashCommandBuilder()
	.setName("scrape")
	.setDescription("Trigger a manual scrape of your Letterboxd data")
	.addUserOption((option) =>
		option
			.setName("user")
			.setDescription("User to scrape (mods only)")
			.setRequired(false),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	if (!interaction.guildId || !interaction.guild) {
		await interaction.reply({
			content: "This command can only be used in a server.",
			ephemeral: true,
		});
		return;
	}
	const requesterId = interaction.user.id;
	const targetUser = interaction.options.getUser("user");

	// Check permissions before defer when targeting another user
	if (targetUser && targetUser.id !== requesterId) {
		const member = await interaction.guild.members.fetch(requesterId);
		if (!member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
			await interaction.reply({
				content: "You need moderator permissions to scrape other users.",
				ephemeral: true,
			});
			return;
		}
	}

	await interaction.deferReply();

	const guildId = interaction.guildId;

	try {
		const discordId = targetUser?.id || requesterId;
		const isSelf = discordId === requesterId;

		// Check if registered
		const user = await prisma.user.findUnique({
			where: {
				discordId_guildId: { discordId, guildId },
			},
		});

		if (!user || user.deletedAt) {
			await interaction.editReply({
				content: isSelf
					? "You are not registered! Use `/register` first."
					: "That user is not registered.",
			});
			return;
		}

		// Check cooldown (skip for mods)
		const cooldownKey = `${discordId}-${guildId}`;
		const lastScrape = scrapeCooldowns.get(cooldownKey);
		const now = Date.now();
		const cooldownMs = config.SCRAPE_COOLDOWN_MINUTES * 60 * 1000;

		if (isSelf && lastScrape && now - lastScrape < cooldownMs) {
			const remainingMinutes = Math.ceil(
				(cooldownMs - (now - lastScrape)) / 60000,
			);
			await interaction.editReply({
				content: `Please wait ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"} before scraping again.`,
			});
			return;
		}

		// Enqueue scrape (incremental)
		const jobId = await enqueueUserScrape({
			discordId,
			guildId,
			full: false,
		});

		scrapeCooldowns.set(cooldownKey, now);
		scheduleCooldownCleanup();

		const queuePosition = await getQueuePosition("scrape", jobId);
		const queueDepth = await getQueueDepth("scrape");

		await interaction.editReply({
			embeds: [
				{
					title: "🔄 Scrape Queued",
					description: isSelf
						? "Your scrape has been queued."
						: `Scrape for ${targetUser?.username} has been queued.`,
					color: Colors.INFO,
					fields: [
						{
							name: "⏳ Queue Position",
							value:
								queuePosition > 0 ? `#${queuePosition}` : "Processing now...",
							inline: true,
						},
						{
							name: "📊 Queue Status",
							value: `${queueDepth.waiting} waiting, ${queueDepth.active} active`,
							inline: true,
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
			content: "An error occurred. Please try again later.",
		});
	}
}
