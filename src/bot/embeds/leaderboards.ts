import { EmbedBuilder } from "discord.js";
import type { LeaderboardEntry } from "../../types/index.js";
import {
	formatNumber,
	formatRatingDecimal,
	truncate,
} from "../../utils/formatting.js";
import { Colors } from "./colors.js";

export function createLeaderboardEmbed(
	title: string,
	entries: LeaderboardEntry[],
	page: number,
	totalPages: number,
	options: {
		valueLabel: string;
		secondaryLabel?: string;
		description?: string;
		footer?: string;
	},
): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setTitle(title)
		.setColor(Colors.FILMREEL)
		.setTimestamp();

	if (options.description) {
		embed.setDescription(options.description);
	}

	if (entries.length === 0) {
		embed.setDescription(
			options.description
				? `${options.description}\n\nNo entries found.`
				: "No entries found.",
		);
		return embed;
	}

	const lines = entries.map((entry) => {
		const rankEmoji =
			entry.rank <= 3
				? ["🥇", "🥈", "🥉"][entry.rank - 1]
				: `\`${entry.rank.toString().padStart(2)}\``;
		const name = truncate(entry.nickname || "Unknown", 20);

		let line = `${rankEmoji} **${escapeMarkdown(name)}** — ${formatValue(entry.value, options.valueLabel)}`;

		if (options.secondaryLabel && entry.secondaryValue !== undefined) {
			line += ` (${formatValue(entry.secondaryValue, options.secondaryLabel)})`;
		}

		return line;
	});

	embed.setDescription(lines.join("\n"));

	const footerParts = [];
	if (options.footer) {
		footerParts.push(options.footer);
	}
	footerParts.push(`Page ${page}/${totalPages}`);

	embed.setFooter({ text: footerParts.join(" • ") });

	return embed;
}

export function createFilmLeaderboardEmbed(
	title: string,
	films: Array<{
		letterboxdSlug: string;
		title: string;
		year: number | null;
		avgRating: number;
		ratingCount: number;
	}>,
	page: number,
	totalPages: number,
	options: {
		description?: string;
	} = {},
): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setTitle(title)
		.setColor(Colors.FILMREEL)
		.setTimestamp();

	if (options.description) {
		embed.setDescription(options.description);
	}

	if (films.length === 0) {
		embed.setDescription("No films found.");
		return embed;
	}

	const lines = films.map((film, index) => {
		const rank = (page - 1) * 10 + index + 1;
		const rankEmoji =
			rank <= 3
				? ["🥇", "🥈", "🥉"][rank - 1]
				: `\`${rank.toString().padStart(2)}\``;
		const yearDisplay = film.year ? ` (${film.year})` : "";
		const title = truncate(film.title, 35);
		const rating = formatRatingDecimal(film.avgRating / 2); // Convert from display scale to storage for formatting

		return `${rankEmoji} **${escapeMarkdown(title)}**${yearDisplay} — ⭐ ${rating}/10 (${formatNumber(film.ratingCount)})`;
	});

	embed.setDescription(lines.join("\n"));
	embed.setFooter({ text: `Page ${page}/${totalPages}` });

	return embed;
}

export function createComparisonEmbed(
	user1Name: string,
	user2Name: string,
	commonFilms: number,
	avgDifference: number,
	mostAgreed: Array<{ title: string; difference: number }>,
	mostDisagreed: Array<{ title: string; difference: number }>,
): EmbedBuilder {
	return new EmbedBuilder()
		.setTitle(`🎬 Comparison: ${user1Name} vs ${user2Name}`)
		.setColor(Colors.FILMREEL)
		.addFields(
			{
				name: "📊 Stats",
				value: [
					`**Films in common:** ${commonFilms}`,
					`**Average difference:** ${(avgDifference * 2).toFixed(1)} points`,
				].join("\n"),
				inline: false,
			},
			{
				name: "🤝 Most Agreed",
				value:
					mostAgreed.length > 0
						? mostAgreed
								.map(
									(f, i) =>
										`${i + 1}. ${truncate(f.title, 30)} (${(f.difference * 2).toFixed(1)})`,
								)
								.join("\n")
						: "No films rated in common",
				inline: true,
			},
			{
				name: "⚔️ Most Disagreed",
				value:
					mostDisagreed.length > 0
						? mostDisagreed
								.map(
									(f, i) =>
										`${i + 1}. ${truncate(f.title, 30)} (${(f.difference * 2).toFixed(1)})`,
								)
								.join("\n")
						: "No films rated in common",
				inline: true,
			},
		);
}

function formatValue(value: number, label: string): string {
	if (label === "rating") {
		return `⭐ ${(value * 2).toFixed(1)}/10`;
	}
	return `${formatNumber(Math.round(value))} ${label}`;
}

function escapeMarkdown(text: string): string {
	return text.replace(/([*_`~|])/g, "\\$1");
}
