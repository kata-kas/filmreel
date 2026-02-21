import type { Guild } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { logger } from "../../logger.js";

const log = logger.child({ component: "roleManager" });

/**
 * Assigns a level-up role to a guild member
 * This should be called when we detect a level up (from job result or periodically)
 */
export async function assignLevelRole(
	guild: Guild,
	discordId: string,
	level: number,
): Promise<{ success: boolean; roleName?: string; error?: string }> {
	try {
		// Get the role for this level
		const threshold = await prisma.levelThreshold.findUnique({
			where: {
				guildId_level: { guildId: guild.id, level },
			},
		});

		if (!threshold?.roleId) {
			return { success: false, error: "No role configured for this level" };
		}

		// Fetch the member
		const member = await guild.members.fetch(discordId).catch(() => null);
		if (!member) {
			return { success: false, error: "Member not found in guild" };
		}

		// Check if role exists
		const role = await guild.roles.fetch(threshold.roleId).catch(() => null);
		if (!role) {
			return { success: false, error: "Role not found" };
		}

		// Check if already has role
		if (member.roles.cache.has(threshold.roleId)) {
			return { success: true, roleName: role.name }; // Already has it
		}

		// Assign the role
		await member.roles.add(threshold.roleId);

		return { success: true, roleName: role.name };
	} catch (error) {
		log.error(
			{ guildId: guild.id, discordId, level, error },
			"Error assigning level role",
		);
		return { success: false, error: "Failed to assign role" };
	}
}

/**
 * Checks and assigns any missing level roles for a user
 * Useful to call when a user runs a command
 */
export async function checkAndAssignMissingRoles(
	guild: Guild,
	discordId: string,
): Promise<Array<{ level: number; roleName: string }>> {
	const assigned: Array<{ level: number; roleName: string }> = [];

	try {
		// Get user's current level
		const xpSum = await prisma.xpEvent.aggregate({
			where: { discordId, guildId: guild.id },
			_sum: { xpAwarded: true },
		});
		const totalXp = xpSum._sum.xpAwarded ?? 0;

		const thresholds = await prisma.levelThreshold.findMany({
			where: { guildId: guild.id },
			orderBy: { level: "asc" },
		});

		let currentLevel = 1;
		for (const t of thresholds) {
			if (totalXp >= t.xpRequired) {
				currentLevel = t.level;
			}
		}

		// Check all levels up to current and assign missing roles
		for (const threshold of thresholds) {
			if (threshold.level > currentLevel) break;
			if (!threshold.roleId) continue;

			const result = await assignLevelRole(guild, discordId, threshold.level);
			if (result.success && result.roleName) {
				assigned.push({ level: threshold.level, roleName: result.roleName });
			}
		}
	} catch (error) {
		log.error(
			{ guildId: guild.id, discordId, error },
			"Error checking missing roles",
		);
	}

	return assigned;
}

/**
 * Removes lower level roles when user gets a higher level role
 * Optional: keeps all roles or only keeps highest
 */
export async function cleanupLowerLevelRoles(
	guild: Guild,
	discordId: string,
	currentLevel: number,
	keepAll = true,
): Promise<void> {
	if (keepAll) return; // Don't remove any roles

	try {
		const member = await guild.members.fetch(discordId).catch(() => null);
		if (!member) return;

		const thresholds = await prisma.levelThreshold.findMany({
			where: {
				guildId: guild.id,
				level: { lt: currentLevel },
				roleId: { not: null },
			},
		});

		for (const t of thresholds) {
			if (t.roleId && member.roles.cache.has(t.roleId)) {
				await member.roles.remove(t.roleId);
			}
		}
	} catch (error) {
		log.error(
			{ guildId: guild.id, discordId, currentLevel, error },
			"Error cleaning up lower level roles",
		);
	}
}
