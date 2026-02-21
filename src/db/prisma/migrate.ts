import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../../config/index.js";
import { logger } from "../../logger.js";

const log = logger.child({ module: "PrismaMigrate" });
let migrationDone = false;

function getPrismaCliPath(): string {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return path.resolve(here, "../../../node_modules/prisma/build/index.js");
}

export async function runMigrationsOnStartup(
	startupContext: "bot" | "worker" | "scheduler",
): Promise<void> {
	if (!config.AUTO_MIGRATE || migrationDone) return;

	const prismaCliPath = getPrismaCliPath();
	log.info({ startupContext }, "Running prisma migrate deploy");

	await new Promise<void>((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[prismaCliPath, "migrate", "deploy", "--schema", "prisma/schema.prisma"],
			{
				stdio: "inherit",
			},
		);

		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`prisma migrate deploy failed with code ${code}`));
		});
	});

	migrationDone = true;
	log.info({ startupContext }, "Prisma migrations applied");
}
