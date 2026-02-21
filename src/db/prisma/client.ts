import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "../../config/index.js";
import { logger } from "../../logger.js";

const globalForPrisma = globalThis as unknown as {
	prisma: PrismaClient | undefined;
};

export const prisma =
	globalForPrisma.prisma ??
	new PrismaClient({
		adapter: new PrismaPg({
			connectionString: config.DATABASE_URL,
		}),
	});

if (config.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

let prismaReady = false;
export async function ensurePrismaConnected(
	startupContext: "bot" | "worker" | "scheduler",
): Promise<void> {
	if (prismaReady) return;

	try {
		await prisma.$connect();
		prismaReady = true;
		logger.info({ startupContext }, "Prisma connection established");
	} catch (error) {
		logger.error({ startupContext, error }, "Prisma connection failed");
		throw error;
	}
}

export default prisma;
