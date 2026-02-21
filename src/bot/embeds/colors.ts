// Discord embed color constants
export const Colors = {
	PRIMARY: 0x5865f2, // Discord blurple
	SUCCESS: 0x57f287, // Green
	WARNING: 0xfee75c, // Yellow
	ERROR: 0xed4245, // Red
	INFO: 0xeb459e, // Pink
	FILMREEL: 0xff6b6b, // Brand color (coral)
	SECONDARY: 0x99aab5, // Gray
	GOLD: 0xffd700, // Gold for leaderboards
	SILVER: 0xc0c0c0, // Silver
	BRONZE: 0xcd7f32, // Bronze
} as const;

export function getRankColor(rank: number): number {
	switch (rank) {
		case 1:
			return Colors.GOLD;
		case 2:
			return Colors.SILVER;
		case 3:
			return Colors.BRONZE;
		default:
			return Colors.FILMREEL;
	}
}
