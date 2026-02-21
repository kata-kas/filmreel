import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import express from "express";
import { config } from "../config/index.js";
import { prisma } from "../db/prisma/client.js";
import { logger } from "../logger.js";
import { filmResolutionQueue, scrapeQueue, xpQueue } from "../queue/enqueue.js";
import { getRedis } from "../redis.js";

const log = logger.child({ module: "BullBoard" });

const basePath = "/admin/queues";
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(basePath);

createBullBoard({
	queues: [
		new BullMQAdapter(scrapeQueue),
		new BullMQAdapter(filmResolutionQueue),
		new BullMQAdapter(xpQueue),
	],
	serverAdapter: serverAdapter,
	options: {
		uiConfig: {
			boardTitle: "FilmReel Queue Manager",
		},
	},
});

const app = express();
app.use(basePath, serverAdapter.getRouter());
app.get("/healthz", async (_req, res) => {
	try {
		await Promise.all([prisma.$queryRaw`SELECT 1`, getRedis().ping()]);
		res.status(200).json({ status: "ok" });
	} catch (error) {
		log.error({ error }, "Readiness check failed");
		res.status(503).json({ status: "error" });
	}
});

const PORT = config.BULL_BOARD_PORT;

app.listen(PORT, () => {
	log.info({ port: PORT, basePath }, "Bull Board running");
});
