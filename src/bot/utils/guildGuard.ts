import type { ChatInputCommandInteraction } from "discord.js";
import { logger } from "../../logger.js";

const log = logger.child({ component: "guildGuard" });
const GUILD_REQUIRED_MESSAGE = "This command can only be used in a server.";

/**
 * Ensures the interaction has guild context. Sends an appropriate error response
 * and returns null if invoked in DMs or without a guild.
 */
export async function ensureGuildContext(
	interaction: ChatInputCommandInteraction,
): Promise<string | null> {
	if (interaction.guildId) {
		return interaction.guildId;
	}

	const payload = { content: GUILD_REQUIRED_MESSAGE, ephemeral: true };

	try {
		if (interaction.deferred) {
			await interaction.editReply({ content: GUILD_REQUIRED_MESSAGE });
		} else if (interaction.replied) {
			await interaction.followUp(payload);
		} else {
			await interaction.reply(payload);
		}
	} catch (err) {
		log.error(
			{
				interactionId: interaction.id,
				userId: interaction.user?.id,
				commandName: interaction.commandName,
				error: err,
			},
			"Failed to send guild-required message",
		);
	}

	return null;
}
