import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { getListsByUser } from "../../db/queries/lists.js";
import { logger } from "../../logger.js";
import { formatDate } from "../../utils/time.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("serverlists")
	.setDescription("Show lists submitted by a user")
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
	const targetUser = interaction.options.getUser("user") || interaction.user;
	const discordId = targetUser.id;

	try {
		const lists = await getListsByUser(guildId, discordId);

		if (lists.length === 0) {
			await interaction.editReply({
				content:
					targetUser.id === interaction.user.id
						? "You haven't submitted any lists yet."
						: `${targetUser.username} hasn't submitted any lists.`,
			});
			return;
		}

		const lines = lists.map((list) => {
			const synced = list.lastSynced
				? `Last synced: ${formatDate(list.lastSynced)}`
				: "Never synced";
			const deadline = list.deadline
				? `• Deadline: ${formatDate(list.deadline)}`
				: "";
			return `**${list.listName}** — ${synced} ${deadline}`;
		});

		await interaction.editReply({
			embeds: [
				{
					title: `📋 Lists by ${targetUser.username}`,
					description: lines.join("\n").slice(0, 4000),
					color: Colors.INFO,
					footer: {
						text: `${lists.length} list${lists.length === 1 ? "" : "s"}`,
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
