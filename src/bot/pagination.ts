import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	PermissionFlagsBits,
} from "discord.js";
import { config } from "../config/index.js";
import { getRedis } from "../redis.js";
import {
	formatNumber,
	formatPercent,
	formatRatingDecimal,
} from "../utils/formatting.js";
import { Colors } from "./embeds/colors.js";

const redis = getRedis();
const PAGINATION_TTL = 300; // 5 minutes

/** Discord snowflake IDs are 17–20 digits */
const SNOWFLAKE_REGEX = /^\d{17,20}$/;

function isValidSnowflake(id: unknown): id is string {
	return typeof id === "string" && SNOWFLAKE_REGEX.test(id);
}

function safeJsonParse<T>(raw: string): T | null {
	try {
		const parsed = JSON.parse(raw) as T;
		return parsed;
	} catch {
		// Attempt corruption cleanup: strip trailing garbage, retry
		const trimmed = raw.replace(/,?\s*[}\]]?\s*$/, "").trim();
		const lastBrace = Math.max(
			trimmed.lastIndexOf("}"),
			trimmed.lastIndexOf("]"),
		);
		if (lastBrace > 0) {
			try {
				return JSON.parse(trimmed.slice(0, lastBrace + 1)) as T;
			} catch {
				/* fall through */
			}
		}
		return null;
	}
}

interface PaginationData {
	data: unknown[];
	page: number;
	pageSize: number;
	totalPages: number;
	renderType: string;
	guildId: string;
	userId: string;
	metadata?: Record<string, unknown>;
}

type RenderFunction = (
	items: unknown[],
	page: number,
	totalPages: number,
	metadata?: Record<string, unknown>,
) => EmbedBuilder;

// Film leaderboard renderer
const renderFilmLeaderboard: RenderFunction = (
	items,
	page,
	totalPages,
	metadata,
) => {
	const films = items as Array<{
		letterboxdSlug: string;
		title: string;
		year: number | null;
		avgRating: number;
		ratingCount: number;
	}>;

	const title = (metadata?.title as string) || "Film Leaderboard";
	const description = (metadata?.description as string) || "";

	const embed = new EmbedBuilder()
		.setTitle(title)
		.setColor(Colors.FILMREEL)
		.setTimestamp();

	if (description) {
		embed.setDescription(description);
	}

	if (films.length === 0) {
		embed.setDescription("No entries found.");
		return embed;
	}

	const startRank =
		(page - 1) *
			((metadata?.pageSize as number) ?? config.PAGINATION_DEFAULT_PAGE_SIZE) +
		1;
	const lines = films.map((film, index) => {
		const rank = startRank + index;
		const rankEmoji =
			rank <= 3
				? ["🥇", "🥈", "🥉"][rank - 1]
				: `\`${rank.toString().padStart(2)}\``;
		const year = film.year ? ` (${film.year})` : "";
		const rating = formatRatingDecimal(film.avgRating);
		return `${rankEmoji} **${film.title}**${year} — ⭐ ${rating}/10 (${formatNumber(film.ratingCount)})`;
	});

	embed.setDescription(lines.join("\n"));
	embed.setFooter({
		text: `Page ${page}/${totalPages} • ${metadata?.totalItems || films.length} total`,
	});

	return embed;
};

// User leaderboard renderer
const renderUserLeaderboard: RenderFunction = (
	items,
	page,
	totalPages,
	metadata,
) => {
	const entries = items as Array<{
		rank: number;
		discordId: string;
		nickname: string | null;
		value: number;
		secondaryValue?: number;
	}>;

	const title = (metadata?.title as string) || "Leaderboard";
	const description = (metadata?.description as string) || "";
	const valueLabel = (metadata?.valueLabel as string) || "value";
	const secondaryLabel = (metadata?.secondaryLabel as string) || "";

	const embed = new EmbedBuilder()
		.setTitle(title)
		.setColor(Colors.FILMREEL)
		.setTimestamp();

	if (description) {
		embed.setDescription(description);
	}

	if (entries.length === 0) {
		embed.setDescription("No entries found.");
		return embed;
	}

	const lines = entries.map((entry) => {
		const rankEmoji =
			entry.rank <= 3
				? ["🥇", "🥈", "🥉"][entry.rank - 1]
				: `\`${entry.rank.toString().padStart(2)}\``;
		const name = entry.nickname || `<@${entry.discordId}>`;

		let line = `${rankEmoji} **${name}** — `;

		if (valueLabel === "rating") {
			line += `⭐ ${(entry.value * 2).toFixed(1)}/10`;
		} else if (valueLabel === "percent") {
			line += formatPercent(entry.value, 2);
		} else {
			line += `${formatNumber(Math.round(entry.value))} ${valueLabel}`;
		}

		if (secondaryLabel && entry.secondaryValue !== undefined) {
			if (secondaryLabel === "avg diff") {
				line += ` (Δ${(entry.secondaryValue * 2).toFixed(1)})`;
			} else {
				line += ` (${formatNumber(Math.round(entry.secondaryValue))} ${secondaryLabel})`;
			}
		}

		return line;
	});

	embed.setDescription(lines.join("\n"));
	embed.setFooter({
		text: `Page ${page}/${totalPages} • ${metadata?.totalItems || entries.length} total`,
	});

	return embed;
};

// Rating list renderer
const renderRatingList: RenderFunction = (
	items,
	page,
	totalPages,
	metadata,
) => {
	const ratings = items as Array<{
		name: string;
		rating: number | null;
	}>;

	const title = (metadata?.title as string) || "Ratings";
	const filmTitle = (metadata?.filmTitle as string) || "";

	const embed = new EmbedBuilder().setTitle(title).setColor(Colors.INFO);

	if (filmTitle) {
		embed.setDescription(`Ratings for **${filmTitle}**`);
	}

	if (ratings.length === 0) {
		embed.setDescription("No ratings found.");
		return embed;
	}

	const lines = ratings.map((r) => {
		const ratingStr =
			r.rating !== null ? `⭐ ${formatRatingDecimal(r.rating)}/10` : "—";
		return `**${r.name}**: ${ratingStr}`;
	});

	embed.setDescription(lines.join("\n"));
	embed.setFooter({
		text: `Page ${page}/${totalPages} • ${metadata?.totalItems || ratings.length} total ratings`,
	});

	return embed;
};

// Help command renderer
const renderHelpList: RenderFunction = (items, page, totalPages, metadata) => {
	const commands = items as Array<{
		name: string;
		description: string;
	}>;

	const embed = new EmbedBuilder()
		.setTitle((metadata?.title as string) || "Available Commands")
		.setColor(Colors.INFO)
		.setTimestamp();

	if (commands.length === 0) {
		embed.setDescription("No commands are currently registered.");
		return embed;
	}

	const lines = commands.map(
		(command) => `\`/${command.name}\` - ${command.description}`,
	);
	embed.setDescription(lines.join("\n"));
	embed.setFooter({
		text: `Page ${page}/${totalPages} • ${metadata?.totalItems || commands.length} total`,
	});

	return embed;
};

const renderFilmList: RenderFunction = (items, page, totalPages, metadata) => {
	const films = items as Array<{
		title: string;
		year?: number | null;
		letterboxdSlug?: string;
	}>;

	const embed = new EmbedBuilder()
		.setTitle((metadata?.title as string) || "Films")
		.setColor(Colors.INFO)
		.setTimestamp();

	if (films.length === 0) {
		embed.setDescription("No entries found.");
		return embed;
	}

	const startRank =
		(page - 1) *
			((metadata?.pageSize as number) ?? config.PAGINATION_DEFAULT_PAGE_SIZE) +
		1;
	const lines = films.map((film, index) => {
		const rank = startRank + index;
		const rankEmoji =
			rank <= 3
				? ["🥇", "🥈", "🥉"][rank - 1]
				: `\`${rank.toString().padStart(2)}\``;
		const year = film.year ? ` (${film.year})` : "";
		const link = film.letterboxdSlug
			? `https://letterboxd.com/film/${film.letterboxdSlug}/`
			: null;
		return link
			? `${rankEmoji} **[${film.title}](${link})**${year}`
			: `${rankEmoji} **${film.title}**${year}`;
	});

	embed.setDescription(lines.join("\n"));
	embed.setFooter({
		text: `Page ${page}/${totalPages} • ${metadata?.totalItems || films.length} total`,
	});

	return embed;
};

const renderers: Record<string, RenderFunction> = {
	filmLeaderboard: renderFilmLeaderboard,
	filmList: renderFilmList,
	userLeaderboard: renderUserLeaderboard,
	ratingList: renderRatingList,
	helpList: renderHelpList,
};

export interface PaginationOptions {
	pageSize?: number;
}

export async function createPagination<T>(
	interaction: ChatInputCommandInteraction,
	data: T[],
	renderType: string,
	metadata?: Record<string, unknown>,
	options?: PaginationOptions,
): Promise<void> {
	const pageSize = options?.pageSize ?? config.PAGINATION_DEFAULT_PAGE_SIZE;
	const totalPages = Math.ceil(data.length / pageSize) || 1;

	// Don't paginate if only one page
	if (totalPages === 1) {
		const renderer = renderers[renderType];
		if (renderer) {
			const embed = renderer(data, 1, 1, {
				...metadata,
				pageSize,
				totalItems: data.length,
			});
			await interaction.editReply({ embeds: [embed] });
		}
		return;
	}

	const guildId = interaction.guildId;
	if (!guildId) {
		await interaction.editReply({
			content: "This command can only be used in a server.",
		});
		return;
	}

	// Store data in Redis
	const userId = interaction.user.id;
	const paginationData: PaginationData = {
		data,
		page: 1,
		pageSize,
		totalPages,
		renderType,
		guildId,
		userId,
		metadata: { ...metadata, totalItems: data.length },
	};

	const key = `pagination:${guildId}:${userId}:${interaction.id}`;
	await redis.setex(key, PAGINATION_TTL, JSON.stringify(paginationData));

	// Create initial embed
	const pageData = data.slice(0, pageSize);
	const renderer = renderers[renderType];
	if (!renderer) {
		throw new Error(`Unknown render type: ${renderType}`);
	}

	const embed = renderer(pageData, 1, totalPages, {
		...metadata,
		pageSize,
		totalItems: data.length,
	});

	// Create buttons (customId includes guild/user/interaction for stronger namespace)
	const baseId = `pagination:${guildId}:${userId}:${interaction.id}`;
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${baseId}:prev`)
			.setLabel("◀ Previous")
			.setStyle(ButtonStyle.Primary)
			.setDisabled(true),
		new ButtonBuilder()
			.setCustomId(`${baseId}:next`)
			.setLabel("Next ▶")
			.setStyle(ButtonStyle.Primary)
			.setDisabled(false),
	);

	await interaction.editReply({
		embeds: [embed],
		components: [row],
	});
}

export async function handlePaginationInteraction(
	interaction: ButtonInteraction,
): Promise<boolean> {
	const customId = interaction.customId;

	if (!customId.startsWith("pagination:")) {
		return false;
	}

	// Format: pagination:guildId:userId:interactionId:action
	const parts = customId.split(":");
	if (parts.length !== 5) {
		return false;
	}

	const [, guildId, userId, interactionId, action] = parts;

	if (action !== "prev" && action !== "next") {
		return false;
	}

	if (!isValidSnowflake(guildId) || !isValidSnowflake(userId)) {
		await interaction.reply({
			content: "This pagination has expired. Please run the command again.",
			ephemeral: true,
		});
		return true;
	}

	const key = `pagination:${guildId}:${userId}:${interactionId}`;
	const raw = await redis.get(key);

	if (!raw) {
		await interaction.reply({
			content: "This pagination has expired. Please run the command again.",
			ephemeral: true,
		});
		return true;
	}

	const paginationData = safeJsonParse<PaginationData>(raw);
	if (!paginationData) {
		await redis.del(key);
		await interaction.reply({
			content: "This pagination has expired. Please run the command again.",
			ephemeral: true,
		});
		return true;
	}

	// Validate stored userId and guildId format and context
	if (
		!isValidSnowflake(paginationData.userId) ||
		!isValidSnowflake(paginationData.guildId)
	) {
		await redis.del(key);
		await interaction.reply({
			content: "This pagination has expired. Please run the command again.",
			ephemeral: true,
		});
		return true;
	}

	if (paginationData.guildId !== interaction.guildId) {
		await interaction.reply({
			content: "You can only interact with paginations in the same server.",
			ephemeral: true,
		});
		return true;
	}

	// Security: only allow original user or guild mods
	const isOwner = paginationData.userId === interaction.user.id;
	const isMod =
		!isOwner &&
		(await interaction.guild?.members
			.fetch(interaction.user.id)
			.then((m) => m.permissions.has(PermissionFlagsBits.ModerateMembers))
			.catch(() => false));

	if (!isOwner && !isMod) {
		await interaction.reply({
			content: "You can only interact with your own paginations.",
			ephemeral: true,
		});
		return true;
	}

	// Calculate new page
	let newPage = paginationData.page;
	if (action === "next" && newPage < paginationData.totalPages) {
		newPage++;
	} else if (action === "prev" && newPage > 1) {
		newPage--;
	}

	// Update stored page
	paginationData.page = newPage;
	await redis.setex(key, PAGINATION_TTL, JSON.stringify(paginationData));

	// Get page data
	const start = (newPage - 1) * paginationData.pageSize;
	const end = start + paginationData.pageSize;
	const pageData = paginationData.data.slice(start, end);

	// Re-render embed
	const renderer = renderers[paginationData.renderType];
	if (!renderer) {
		await interaction.reply({
			content: "Error: Unknown pagination type.",
			ephemeral: true,
		});
		return true;
	}

	const embed = renderer(
		pageData,
		newPage,
		paginationData.totalPages,
		paginationData.metadata,
	);

	// Update buttons (preserve full namespace in customId)
	const baseId = `pagination:${guildId}:${userId}:${interactionId}`;
	const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId(`${baseId}:prev`)
			.setLabel("◀ Previous")
			.setStyle(ButtonStyle.Primary)
			.setDisabled(newPage === 1),
		new ButtonBuilder()
			.setCustomId(`${baseId}:next`)
			.setLabel("Next ▶")
			.setStyle(ButtonStyle.Primary)
			.setDisabled(newPage === paginationData.totalPages),
	);

	await interaction.update({
		embeds: [embed],
		components: [row],
	});

	return true;
}

export async function cleanupPagination(
	guildId: string,
	userId: string,
	interactionId: string,
): Promise<void> {
	const key = `pagination:${guildId}:${userId}:${interactionId}`;
	await redis.del(key);
}
