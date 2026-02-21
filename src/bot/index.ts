import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
	type ChatInputCommandInteraction,
	Client,
	Collection,
	Events,
	GatewayIntentBits,
	REST,
	Routes,
} from "discord.js";
import { config } from "../config/index.js";
import { ensurePrismaConnected } from "../db/prisma/client.js";
import { runMigrationsOnStartup } from "../db/prisma/migrate.js";
import { logger } from "../logger.js";
import { getRedis } from "../redis.js";
import { closeBrowser } from "../scraper/browser.js";
import { handlePaginationInteraction } from "./pagination.js";

const log = logger.child({ component: "bot" });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Discord client
const client = new Client({
	intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

// Store commands
const commands = new Collection<
	string,
	{
		data: { name: string };
		execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
	}
>();

// Load commands from files
async function loadCommands() {
	const commandsPath = path.join(__dirname, "commands");
	const commandFiles = fs
		.readdirSync(commandsPath)
		.filter((file) => file.endsWith(".js") && !file.endsWith(".d.ts"));

	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = await import(filePath);

		if ("data" in command && "execute" in command) {
			commands.set(command.data.name, command);
		} else {
			log.warn({ filePath }, "Command missing required data or execute export");
		}
	}
}

// Deploy commands to Discord
export async function deployCommands() {
	const rest = new REST().setToken(config.DISCORD_TOKEN);

	const commandsData = Array.from(commands.values()).map((c) => c.data);

	try {
		log.log(
			{ commandCount: commandsData.length },
			"Started refreshing application commands",
		);

		// For development: register to specific guilds
		if (config.NODE_ENV === "development") {
			for (const guildId of config.GUILD_IDS) {
				await rest.put(
					Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, guildId),
					{ body: commandsData },
				);
				log.log({ guildId }, "Registered commands to guild");
			}
		} else {
			// For production: register globally
			await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), {
				body: commandsData,
			});
			log.log("Registered commands globally");
		}
	} catch (error) {
		log.error({ error }, "Error deploying commands");
	}
}

// Event: Bot ready
client.once(Events.ClientReady, (readyClient) => {
	log.log({ userTag: readyClient.user.tag }, "Ready, logged in");
});

// Event: Interaction create
client.on(Events.InteractionCreate, async (interaction) => {
	// Handle button interactions (pagination)
	if (interaction.isButton()) {
		const handled = await handlePaginationInteraction(interaction);
		if (handled) return;
	}

	// Handle slash commands
	if (!interaction.isChatInputCommand()) return;

	const command = commands.get(interaction.commandName);

	if (!command) {
		log.error(
			{ commandName: interaction.commandName },
			"No matching command found",
		);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		log.error(
			{
				commandName: interaction.commandName,
				interactionId: interaction.id,
				guildId: interaction.guildId ?? undefined,
				userId: interaction.user?.id,
				error,
			},
			"Command execution failed",
		);

		const errorPayload = {
			content: "There was an error executing this command!",
			ephemeral: true,
		};

		try {
			if (interaction.deferred && !interaction.replied) {
				await interaction.editReply({ content: errorPayload.content });
			} else if (interaction.replied) {
				await interaction.followUp(errorPayload);
			} else {
				await interaction.reply(errorPayload);
			}
		} catch (replyError) {
			log.error("Failed to send error response to user:", replyError);
		}
	}
});

// Start the bot
export async function startBot() {
	await runMigrationsOnStartup("bot");
	await ensurePrismaConnected("bot");
	await loadCommands();
	await client.login(config.DISCORD_TOKEN);
	return client;
}

// Graceful shutdown
async function shutdown(): Promise<void> {
	log.log("Shutting down bot...");
	await closeBrowser();
	await client.destroy();
	try {
		await getRedis().quit();
	} catch (err) {
		log.error({ error: err }, "Redis quit error");
	}
	process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	startBot();
}
