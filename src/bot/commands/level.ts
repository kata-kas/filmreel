import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import {
	getUserLevel,
	getUserXp,
	getXpForNextLevel,
} from "../../db/queries/xp.js";
import { logger } from "../../logger.js";
import { createXpEmbed } from "../embeds/profile.js";
import { ensureGuildContext } from "../utils/guildGuard.js";
import { checkAndAssignMissingRoles } from "../utils/roleManager.js";

export const data = new SlashCommandBuilder()
	.setName("level")
	.setDescription("Check your current level and XP")
	.addUserOption((option) =>
		option
			.setName("user")
			.setDescription("User to check (defaults to you)")
			.setRequired(false),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const guild = interaction.guild;
	if (!guild) return;
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

		const [xp, level, xpToNext] = await Promise.all([
			getUserXp(discordId, guildId),
			getUserLevel(discordId, guildId),
			getXpForNextLevel(discordId, guildId),
		]);

		// Check for and assign any missing level roles
		const assignedRoles = await checkAndAssignMissingRoles(guild, discordId);

		// Get recent XP events
		const recentEvents = await prisma.xpEvent.findMany({
			where: { discordId, guildId },
			orderBy: { createdAt: "desc" },
			take: 5,
		});

		const embed = createXpEmbed({
			level,
			xp,
			xpToNextLevel: xpToNext,
			recentEvents: recentEvents.map((e) => ({
				eventType: e.eventType,
				xpAwarded: e.xpAwarded,
				createdAt: e.createdAt,
			})),
		});

		let content: string | undefined;
		if (assignedRoles.length > 0 && targetUser.id === interaction.user.id) {
			const roleNames = assignedRoles.map((r) => r.roleName).join(", ");
			content = `🎉 You've been assigned new level role(s): ${roleNames}`;
		}

		await interaction.editReply({
			content,
			embeds: [embed],
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
