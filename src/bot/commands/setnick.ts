import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { updateNickname } from "../../db/queries/users.js";
import { logger } from "../../logger.js";
import { Colors } from "../embeds/colors.js";
import { ensureGuildContext } from "../utils/guildGuard.js";

export const data = new SlashCommandBuilder()
	.setName("setnick")
	.setDescription("Set your nickname for leaderboards")
	.addStringOption((option) =>
		option
			.setName("nickname")
			.setDescription("Your preferred nickname")
			.setRequired(true)
			.setMaxLength(32),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const nickname = interaction.options.getString("nickname", true);
	const guildId = await ensureGuildContext(interaction);
	if (!guildId) return;
	const discordId = interaction.user.id;

	try {
		await updateNickname(discordId, guildId, nickname);

		await interaction.editReply({
			embeds: [
				{
					title: "✅ Nickname Set",
					description: `Your nickname has been set to **${nickname}**.`,
					color: Colors.SUCCESS,
				},
			],
		});
	} catch (error) {
		if (error instanceof Error && error.message.includes("already taken")) {
			await interaction.editReply({
				content: error.message,
			});
			return;
		}

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
