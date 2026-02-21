import type { LookupResult } from "../../types/index.js";
import { prisma } from "../prisma/client.js";

export async function addUserFavorite(
	discordId: string,
	guildId: string,
	lookup: LookupResult,
) {
	return prisma.userFavorite.create({
		data: {
			discordId,
			guildId,
			lookupType: lookup.type,
			tmdbId: lookup.tmdbId,
			isoCode: lookup.isoCode,
			canonicalName: lookup.canonicalName,
		},
	});
}

export async function removeUserFavorite(
	discordId: string,
	guildId: string,
	lookup: LookupResult,
) {
	return prisma.userFavorite.deleteMany({
		where: {
			discordId,
			guildId,
			lookupType: lookup.type,
			tmdbId: lookup.tmdbId,
			isoCode: lookup.isoCode,
		},
	});
}

export async function getUserFavorites(discordId: string, guildId: string) {
	return prisma.userFavorite.findMany({
		where: {
			discordId,
			guildId,
		},
	});
}

export async function getUserFavoritesByType(
	discordId: string,
	guildId: string,
	lookupType: string,
) {
	return prisma.userFavorite.findMany({
		where: {
			discordId,
			guildId,
			lookupType,
		},
	});
}

export async function getGuildStudios(guildId: string) {
	const studios = await prisma.userFavorite.findMany({
		where: {
			guildId,
			lookupType: "company",
		},
		distinct: ["tmdbId"],
		select: {
			canonicalName: true,
			tmdbId: true,
		},
	});

	return studios;
}

export async function checkFavoriteExists(
	discordId: string,
	guildId: string,
	lookup: LookupResult,
): Promise<boolean> {
	const count = await prisma.userFavorite.count({
		where: {
			discordId,
			guildId,
			lookupType: lookup.type,
			tmdbId: lookup.tmdbId,
			isoCode: lookup.isoCode,
		},
	});

	return count > 0;
}
