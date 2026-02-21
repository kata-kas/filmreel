import type { Job } from "bullmq";
import { prisma } from "../../db/prisma/client.js";
import { filmNeedsResolution } from "../../db/queries/films.js";
import type { ListScrapeJob } from "../../queue/definitions.js";
import { enqueueFilmResolution } from "../../queue/enqueue.js";
import { scrapeList } from "../../scraper/letterboxd.js";

export async function processListScrape(
	job: Job<ListScrapeJob>,
): Promise<{ filmsAdded: number }> {
	const { listId } = job.data;

	// Get list
	const list = await prisma.guildList.findUnique({
		where: { id: listId },
	});

	if (!list) {
		throw new Error(`List not found: ${listId}`);
	}

	// Scrape list
	const films = await scrapeList(list.letterboxdUrl);

	// Atomic transaction: delete + insert list films + update list
	const filmsAdded = await prisma.$transaction(async (tx) => {
		await tx.listFilm.deleteMany({ where: { listId } });

		for (const film of films) {
			await tx.film.upsert({
				where: { letterboxdSlug: film.slug },
				update: { title: film.title },
				create: {
					letterboxdSlug: film.slug,
					title: film.title,
				},
			});

			await tx.listFilm.create({
				data: {
					listId,
					letterboxdSlug: film.slug,
					position: film.position,
				},
			});
		}

		await tx.guildList.update({
			where: { id: listId },
			data: { lastSynced: new Date() },
		});

		return films.length;
	});

	// Enqueue film resolution after transaction (outside DB boundary)
	for (const film of films) {
		const needsResolution = await filmNeedsResolution(film.slug);
		if (needsResolution) {
			await enqueueFilmResolution({
				letterboxdSlug: film.slug,
				title: film.title,
			});
		}
	}

	return { filmsAdded };
}
