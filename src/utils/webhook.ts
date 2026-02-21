import { config } from "../config/index.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "Webhook" });

/**
 * Webhook utility for admin alerts
 * Posts an alert message to the admin Discord channel via webhook
 * This is used by the scheduler process which doesn't have Discord client access
 */
export async function postAdminAlert(message: string): Promise<void> {
	const webhookUrl = config.ADMIN_WEBHOOK_URL;
	if (!webhookUrl) {
		log.info("[ADMIN ALERT - no webhook configured]:", message);
		return;
	}

	try {
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				content: message,
				username: "FilmReel Alerts",
			}),
		});

		if (!response.ok) {
			log.error("Failed to post webhook:", await response.text());
		}
	} catch (error) {
		log.error("Error posting webhook:", error);
	}
}
