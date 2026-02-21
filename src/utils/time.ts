export function getRelativeTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHour = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHour / 24);
	const diffMonth = Math.floor(diffDay / 30);
	const diffYear = Math.floor(diffDay / 365);

	if (diffSec < 60) return "just now";
	if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
	if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
	if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
	if (diffMonth < 12)
		return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`;
	return `${diffYear} year${diffYear === 1 ? "" : "s"} ago`;
}

export function formatDate(date: Date): string {
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function formatDateTime(date: Date): string {
	return date.toLocaleString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function addDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

export function startOfDay(date: Date): Date {
	const result = new Date(date);
	result.setHours(0, 0, 0, 0);
	return result;
}

export function endOfDay(date: Date): Date {
	const result = new Date(date);
	result.setHours(23, 59, 59, 999);
	return result;
}

export function isSameDay(date1: Date, date2: Date): boolean {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
}

export function getDaysBetween(date1: Date, date2: Date): number {
	const msPerDay = 1000 * 60 * 60 * 24;
	return Math.floor((date2.getTime() - date1.getTime()) / msPerDay);
}

export function parseDateString(dateStr: string): Date | null {
	const date = new Date(dateStr);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function getCountdown(targetDate: Date): string {
	const now = new Date();
	const diffMs = targetDate.getTime() - now.getTime();

	if (diffMs <= 0) return "Expired";

	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
	const diffHours = Math.floor(
		(diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
	);
	const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

	if (diffDays > 0) {
		return `${diffDays}d ${diffHours}h ${diffMinutes}m`;
	}
	if (diffHours > 0) {
		return `${diffHours}h ${diffMinutes}m`;
	}
	return `${diffMinutes}m`;
}
