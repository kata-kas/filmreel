import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { prisma } from "../../db/prisma/client.js";
import { getCommonFilms } from "../../db/queries/ratings.js";
import { logger } from "../../logger.js";
import { createComparisonEmbed } from "../embeds/leaderboards.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("compare")
	.setDescription("Compare ratings between two users")
	.addUserOption((option) =>
		option
			.setName("user1")
			.setDescription("First user to compare")
			.setRequired(true),
	)
	.addUserOption((option) =>
		option
			.setName("user2")
			.setDescription("Second user (defaults to you)")
			.setRequired(false),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const user1 = interaction.options.getUser("user1", true);
	const user2 = interaction.options.getUser("user") || interaction.user;

	try {
		// Check both users are registered
		const [user1Data, user2Data] = await Promise.all([
			prisma.user.findUnique({
				where: { discordId_guildId: { discordId: user1.id, guildId } },
			}),
			prisma.user.findUnique({
				where: { discordId_guildId: { discordId: user2.id, guildId } },
			}),
		]);

		if (!user1Data || user1Data.deletedAt) {
			await interaction.editReply({
				content: `${user1.username} is not registered.`,
			});
			return;
		}

		if (!user2Data || user2Data.deletedAt) {
			await interaction.editReply({
				content:
					user2.id === interaction.user.id
						? "You are not registered! Use `/register` first."
						: `${user2.username} is not registered.`,
			});
			return;
		}

		const commonFilms = await getCommonFilms(user1.id, user2.id, guildId);

		if (commonFilms.length === 0) {
			await interaction.editReply({
				content: `${user1.username} and ${user2.username} haven't rated any films in common.`,
			});
			return;
		}

		// Calculate average difference
		const totalDifference = commonFilms.reduce(
			(sum, f) => sum + f.difference,
			0,
		);
		const avgDifference = totalDifference / commonFilms.length;

		// Sort by agreement (smallest difference first)
		const byAgreement = [...commonFilms].sort(
			(a, b) => a.difference - b.difference,
		);
		const mostAgreed = byAgreement.slice(0, 5);

		// Sort by disagreement (largest difference first)
		const byDisagreement = [...commonFilms].sort(
			(a, b) => b.difference - a.difference,
		);
		const mostDisagreed = byDisagreement.slice(0, 5);

		const embed = createComparisonEmbed(
			user1Data.nickname || user1.username,
			user2Data.nickname || user2.username,
			commonFilms.length,
			avgDifference,
			mostAgreed.map((f) => ({ title: f.title, difference: f.difference })),
			mostDisagreed.map((f) => ({ title: f.title, difference: f.difference })),
		);

		await interaction.editReply({ embeds: [embed] });
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
