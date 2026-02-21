export const RATING_SCALE = {
	MIN_STORAGE: 0.5,
	MAX_STORAGE: 5.0,
	INCREMENT: 0.5,
	MIN_DISPLAY: 1,
	MAX_DISPLAY: 10,
} as const;

export function storageToDisplay(storage: number | null): number | null {
	if (storage === null) return null;
	return storage * 2;
}

export function displayToStorage(display: number): number {
	return display / 2;
}
