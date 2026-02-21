import { EmbedBuilder } from "discord.js";
import {
	formatDuration,
	formatNumber,
	formatRatingDecimal,
} from "../../utils/formatting.js";
import { getRelativeTime } from "../../utils/time.js";
import { Colors } from "./colors.js";

export function createProfileEmbed(data: {
	nickname: string;
	letterboxdUsername: string;
	ratingsCount: number;
	watchedCount: number;
	avgRating: number | null;
	favoriteDirector?: string;
	favoriteGenre?: string;
	favoriteCountry?: string;
	favoriteStudio?: string;
	mostWatchedDirector?: string;
	highestRatedFilm?: { title: string; rating: number };
	lowestRatedFilm?: { title: string; rating: number };
	level: number;
	xp: number;
	xpToNextLevel?: number | null;
	lastScraped?: Date | null;
}): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setTitle(`🎬 ${data.nickname}'s Profile`)
		.setURL(`https://letterboxd.com/${data.letterboxdUsername}/`)
		.setColor(Colors.FILMREEL)
		.setTimestamp();

	// Main stats field
	const statsValue = [
		`**Films Rated:** ${formatNumber(data.ratingsCount)}`,
		`**Films Watched:** ${formatNumber(data.watchedCount)}`,
		`**Average Rating:** ${data.avgRating ? `${formatRatingDecimal(data.avgRating)}/10` : "—"}`,
		`**Level:** ${data.level} (${formatNumber(data.xp)} XP)`,
	];

	if (data.xpToNextLevel !== null && data.xpToNextLevel !== undefined) {
		statsValue.push(
			`**XP to next level:** ${formatNumber(data.xpToNextLevel)}`,
		);
	}

	embed.addFields({
		name: "📊 Statistics",
		value: statsValue.join("\n"),
		inline: false,
	});

	// Favorites field
	const favorites = [];
	if (data.favoriteDirector)
		favorites.push(`**Director:** ${data.favoriteDirector}`);
	if (data.favoriteGenre) favorites.push(`**Genre:** ${data.favoriteGenre}`);
	if (data.favoriteCountry)
		favorites.push(`**Country:** ${data.favoriteCountry}`);
	if (data.favoriteStudio) favorites.push(`**Studio:** ${data.favoriteStudio}`);

	if (favorites.length > 0) {
		embed.addFields({
			name: "❤️ Favorites",
			value: favorites.join("\n"),
			inline: true,
		});
	}

	// Extremes field
	const extremes = [];
	if (data.highestRatedFilm) {
		extremes.push(
			`**Highest:** ${data.highestRatedFilm.title} (${formatRatingDecimal(data.highestRatedFilm.rating)}/10)`,
		);
	}
	if (data.lowestRatedFilm) {
		extremes.push(
			`**Lowest:** ${data.lowestRatedFilm.title} (${formatRatingDecimal(data.lowestRatedFilm.rating)}/10)`,
		);
	}
	if (data.mostWatchedDirector) {
		extremes.push(`**Most watched director:** ${data.mostWatchedDirector}`);
	}

	if (extremes.length > 0) {
		embed.addFields({
			name: "🎥 Highlights",
			value: extremes.join("\n"),
			inline: true,
		});
	}

	if (data.lastScraped) {
		embed.setFooter({
			text: `Last updated: ${getRelativeTime(data.lastScraped)}`,
		});
	}

	return embed;
}

export function createFilmEmbed(data: {
	title: string;
	year?: number | null;
	avgRating: number | null;
	ratingCount: number;
	userRating?: number | null;
	posterUrl?: string;
	overview?: string;
	director?: string;
	runtime?: number;
	genres?: string[];
}): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setTitle(data.year ? `${data.title} (${data.year})` : data.title)
		.setColor(Colors.FILMREEL);

	if (data.posterUrl) {
		embed.setThumbnail(`https://image.tmdb.org/t/p/w200${data.posterUrl}`);
	}

	const fields = [];

	// Rating info
	const ratingParts = [];
	if (data.avgRating !== null) {
		ratingParts.push(
			`⭐ Server Avg: ${formatRatingDecimal(data.avgRating)}/10`,
		);
	}
	ratingParts.push(`👥 ${formatNumber(data.ratingCount)} ratings`);

	if (data.userRating !== undefined) {
		ratingParts.push(
			`🎯 Your rating: ${data.userRating ? `${formatRatingDecimal(data.userRating)}/10` : "—"}`,
		);
	}

	fields.push({
		name: "📊 Ratings",
		value: ratingParts.join(" • "),
		inline: false,
	});

	if (data.director) {
		fields.push({
			name: "🎬 Director",
			value: data.director,
			inline: true,
		});
	}

	if (data.runtime) {
		fields.push({
			name: "⏱️ Runtime",
			value: formatDuration(data.runtime),
			inline: true,
		});
	}

	if (data.genres && data.genres.length > 0) {
		fields.push({
			name: "🏷️ Genres",
			value: data.genres.slice(0, 3).join(", "),
			inline: true,
		});
	}

	if (data.overview) {
		fields.push({
			name: "📝 Overview",
			value:
				data.overview.length > 300
					? `${data.overview.slice(0, 300)}...`
					: data.overview,
			inline: false,
		});
	}

	embed.addFields(fields);

	return embed;
}

export function createXpEmbed(data: {
	level: number;
	xp: number;
	xpToNextLevel?: number | null;
	recentEvents?: Array<{
		eventType: string;
		xpAwarded: number;
		createdAt: Date;
	}>;
}): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setTitle("⭐ XP & Level")
		.setColor(Colors.GOLD);

	const fields = [
		{
			name: "Current Level",
			value: `${data.level}`,
			inline: true,
		},
		{
			name: "Total XP",
			value: formatNumber(data.xp),
			inline: true,
		},
	];

	if (data.xpToNextLevel !== null && data.xpToNextLevel !== undefined) {
		fields.push({
			name: "XP to Next Level",
			value: formatNumber(data.xpToNextLevel),
			inline: true,
		});
	}

	embed.addFields(fields);

	if (data.recentEvents && data.recentEvents.length > 0) {
		const eventsText = data.recentEvents
			.slice(0, 5)
			.map(
				(e) =>
					`+${e.xpAwarded} XP — ${e.eventType} (${getRelativeTime(e.createdAt)})`,
			)
			.join("\n");

		embed.addFields({
			name: "📅 Recent Activity",
			value: eventsText,
			inline: false,
		});
	}

	return embed;
}

export function createListEmbed(data: {
	listName: string;
	filmCount: number;
	lastSynced?: Date | null;
	deadline?: Date | null;
	deadlineLabel?: string | null;
	films?: Array<{
		position: number;
		title: string;
		year: number | null;
		hasRating?: boolean;
		userRating?: number | null;
	}>;
	page?: number;
	totalPages?: number;
}): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setTitle(`📋 ${data.listName}`)
		.setColor(Colors.FILMREEL);

	const infoParts = [`**Films:** ${data.filmCount}`];

	if (data.lastSynced) {
		infoParts.push(`**Last synced:** ${getRelativeTime(data.lastSynced)}`);
	}

	if (data.deadline) {
		infoParts.push(
			`**Deadline:** ${getRelativeTime(data.deadline)}${data.deadlineLabel ? ` (${data.deadlineLabel})` : ""}`,
		);
	}

	embed.setDescription(infoParts.join("\n"));

	if (data.films && data.films.length > 0) {
		const lines = data.films.map((f) => {
			const year = f.year ? ` (${f.year})` : "";
			const rating = f.hasRating
				? f.userRating !== null
					? ` ⭐ ${formatRatingDecimal(f.userRating)}/10`
					: " 👁️ Seen"
				: " ❌ Unseen";
			return `\`${f.position.toString().padStart(3)}\` ${f.title}${year}${rating}`;
		});

		embed.addFields({
			name: "🎬 Films",
			value:
				lines.join("\n").slice(0, 1000) +
				(lines.join("\n").length > 1000 ? "\n..." : ""),
			inline: false,
		});
	}

	if (data.totalPages && data.totalPages > 1) {
		embed.setFooter({ text: `Page ${data.page}/${data.totalPages}` });
	}

	return embed;
}
