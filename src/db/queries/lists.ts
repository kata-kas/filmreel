import { prisma } from "../prisma/client.js";

export async function getGuildLists(guildId: string) {
	return prisma.guildList.findMany({
		where: { guildId },
		orderBy: { createdBy: "asc" },
	});
}

export async function getList(listId: number) {
	return prisma.guildList.findUnique({
		where: { id: listId },
		include: {
			listFilms: {
				include: {
					film: true,
				},
				orderBy: {
					position: "asc",
				},
			},
		},
	});
}

export async function getListByName(guildId: string, listName: string) {
	return prisma.guildList.findFirst({
		where: {
			guildId,
			listName: {
				equals: listName,
				mode: "insensitive",
			},
		},
		include: {
			listFilms: {
				include: {
					film: true,
				},
				orderBy: {
					position: "asc",
				},
			},
		},
	});
}

export async function createList(data: {
	guildId: string;
	letterboxdUrl: string;
	listName: string;
	createdBy: string;
}) {
	return prisma.guildList.create({
		data,
	});
}

export async function deleteList(listId: number) {
	return prisma.guildList.delete({
		where: { id: listId },
	});
}

export async function setDeadline(
	listId: number,
	deadline: Date,
	label?: string,
) {
	return prisma.guildList.update({
		where: { id: listId },
		data: {
			deadline,
			deadlineLabel: label,
		},
	});
}

export async function clearDeadline(listId: number) {
	return prisma.guildList.update({
		where: { id: listId },
		data: {
			deadline: null,
			deadlineLabel: null,
		},
	});
}

export async function getUpcomingDeadlines(guildId: string, limit = 5) {
	return prisma.guildList.findMany({
		where: {
			guildId,
			deadline: {
				gte: new Date(),
			},
		},
		orderBy: {
			deadline: "asc",
		},
		take: limit,
	});
}

export async function getNearestDeadline(guildId: string) {
	return prisma.guildList.findFirst({
		where: {
			guildId,
			deadline: {
				gte: new Date(),
			},
		},
		orderBy: {
			deadline: "asc",
		},
	});
}

export async function getListsByUser(guildId: string, discordId: string) {
	return prisma.guildList.findMany({
		where: {
			guildId,
			createdBy: discordId,
		},
		orderBy: {
			lastSynced: "desc",
		},
	});
}

export async function isFilmInList(listId: number, letterboxdSlug: string) {
	const count = await prisma.listFilm.count({
		where: {
			listId,
			letterboxdSlug,
		},
	});
	return count > 0;
}

export async function getListFilmRatings(listId: number, guildId: string) {
	return prisma.rating.findMany({
		where: {
			guildId,
			// Note: listFilms relation needs to be added to schema
			// For now, querying by film slugs from the list
			letterboxdSlug: {
				in: (
					await prisma.listFilm.findMany({
						where: { listId },
						select: { letterboxdSlug: true },
					})
				).map((lf) => lf.letterboxdSlug),
			},
		},
		include: {
			film: true,
			user: {
				select: {
					nickname: true,
				},
			},
		},
	});
}
