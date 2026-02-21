import type { Decimal } from "@prisma/client/runtime/client";
import { storageToDisplay } from "../constants/scales.js";

export function formatRating(storage: Decimal | number | null): string {
	if (storage === null) return "—";
	const display = storageToDisplay(Number(storage));
	if (display === null) return "—";
	return display.toFixed(0);
}

export function formatRatingDecimal(
	storage: Decimal | number | null | undefined,
): string {
	if (storage === null || storage === undefined) return "—";
	const display = storageToDisplay(Number(storage));
	if (display === null) return "—";
	return display.toFixed(1);
}

export function formatNumber(num: number): string {
	return num.toLocaleString("en-US");
}

export function formatPercent(num: number, decimals = 1): string {
	return `${num.toFixed(decimals)}%`;
}

export function formatDuration(minutes: number): string {
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	if (hours === 0) return `${mins}m`;
	if (mins === 0) return `${hours}h`;
	return `${hours}h ${mins}m`;
}

export function formatList(list: string[], maxItems = 5): string {
	if (list.length === 0) return "None";
	if (list.length <= maxItems) return list.join(", ");
	return `${list.slice(0, maxItems).join(", ")} +${list.length - maxItems} more`;
}

export function truncate(str: string, maxLength: number): string {
	if (str.length <= maxLength) return str;
	return `${str.slice(0, maxLength - 3)}...`;
}

export function escapeMarkdown(text: string): string {
	return text
		.replace(/\\/g, "\\\\")
		.replace(/\*/g, "\\*")
		.replace(/_/g, "\\_")
		.replace(/~/g, "\\~")
		.replace(/`/g, "\\`")
		.replace(/\|/g, "\\|");
}

export function ratingToStars(storage: Decimal | number | null): string {
	if (storage === null) return "☆☆☆☆☆";
	const value = Number(storage);
	const fullStars = Math.floor(value);
	const hasHalf = value % 1 >= 0.5;
	const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);

	return "★".repeat(fullStars) + (hasHalf ? "½" : "") + "☆".repeat(emptyStars);
}
