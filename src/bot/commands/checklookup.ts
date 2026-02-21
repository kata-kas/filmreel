import type { ChatInputCommandInteraction } from "discord.js";
import { SlashCommandBuilder } from "discord.js";
import { logger } from "../../logger.js";
import { createResolver } from "../../tmdb/resolver.js";
import { Colors } from "../embeds/colors.js";

export const data = new SlashCommandBuilder()
	.setName("checklookup")
	.setDescription("Test the lookup resolver without saving")
	.addStringOption((option) =>
		option
			.setName("lookup")
			.setDescription("Name to look up (director, genre, country, or studio)")
			.setRequired(true),
	);

const log = logger.child({ command: data.name });

export async function execute(
	interaction: ChatInputCommandInteraction,
): Promise<void> {
	await interaction.deferReply();

	const lookup = interaction.options.getString("lookup", true);

	try {
		const resolver = createResolver();
		const result = await resolver.resolve(lookup);

		const typeLabel = {
			person: "👤 Person (Director/Actor)",
			genre: "🏷️ Genre",
			country: "🌍 Country",
			company: "🏢 Studio/Company",
		}[result.type];

		const fields = [
			{
				name: "Type",
				value: typeLabel,
				inline: true,
			},
			{
				name: "Canonical Name",
				value: result.canonicalName,
				inline: true,
			},
		];

		if (result.tmdbId) {
			fields.push({
				name: "TMDB ID",
				value: result.tmdbId.toString(),
				inline: true,
			});
		}

		if (result.isoCode) {
			fields.push({
				name: "ISO Code",
				value: result.isoCode,
				inline: true,
			});
		}

		await interaction.editReply({
			embeds: [
				{
					title: "🔍 Lookup Result",
					description: `Resolved "${lookup}" to:`,
					color: Colors.SUCCESS,
					fields,
					footer: { text: "Use /addfav to save this to your favorites" },
				},
			],
		});
	} catch (error) {
		if (error instanceof Error && error.message.includes("Could not resolve")) {
			await interaction.editReply({
				embeds: [
					{
						title: "❌ Lookup Failed",
						description: `Could not resolve "${lookup}" to any known entity.`,
						color: Colors.ERROR,
					},
				],
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
