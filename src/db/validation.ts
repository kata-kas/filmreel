const MAX_LIMIT = 1000;
const MAX_OFFSET = 100000;
const MAX_MIN_RATINGS = 10000;
const MAX_LIST_ID = 2147483647;

export function clampLimit(n: number | undefined, defaultVal: number): number {
	if (n == null || !Number.isInteger(n) || n < 1) return defaultVal;
	return Math.min(n, MAX_LIMIT);
}

export function clampOffset(n: number | undefined, defaultVal: number): number {
	if (n == null || !Number.isInteger(n) || n < 0) return defaultVal;
	return Math.min(n, MAX_OFFSET);
}

export function clampMinRatings(
	n: number | undefined,
	defaultVal: number,
): number {
	if (n == null || !Number.isInteger(n) || n < 1) return defaultVal;
	return Math.min(n, MAX_MIN_RATINGS);
}

export function clampListId(n: number | undefined): number | null {
	if (n == null || !Number.isInteger(n) || n < 1 || n > MAX_LIST_ID)
		return null;
	return n;
}
