export const DEFAULT_XP_WEIGHTS = {
	rating: 10,
	rewatch: 5,
	list_complete: 50,
	season_participation: 25,
	streak: 15,
} as const;

export type XpEventType = keyof typeof DEFAULT_XP_WEIGHTS;

export const XP_EVENT_TYPES: XpEventType[] = [
	"rating",
	"rewatch",
	"list_complete",
	"season_participation",
	"streak",
];

export function isValidXpEventType(type: string): type is XpEventType {
	return XP_EVENT_TYPES.includes(type as XpEventType);
}
