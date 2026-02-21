import type { Browser, Page } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { config } from "../config/index.js";
import { logger } from "../logger.js";

const log = logger.child({ module: "Browser" });

let browser: Browser | null = null;
let stealthConfigured = false;

function getReadySelector(url: string): string {
	if (url.includes("/lists/")) {
		return "section.list-set, ul.poster-list, main, body";
	}
	if (url.includes("/list/")) {
		return "li.poster-container, .pagination, main, body";
	}
	if (url.includes("/films/")) {
		return "li.griditem, div.pagination, main, body";
	}
	return "main, body";
}

async function getBrowser(): Promise<Browser> {
	if (!browser) {
		if (!stealthConfigured) {
			const stealthPlugin = StealthPlugin() as unknown as Parameters<
				typeof chromium.use
			>[0];
			chromium.use(stealthPlugin);
			stealthConfigured = true;
		}

		const executablePath = config.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
		browser = await chromium.launch({
			headless: true,
			executablePath,
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});
	}
	return browser;
}

async function safeClose(
	resource: { close(): Promise<void> },
	label: string,
): Promise<void> {
	try {
		await resource.close();
	} catch (err) {
		const error = err instanceof Error ? err : new Error(String(err));
		log.warn({ label, error }, "Failed to close resource");
	}
}

export async function scrapePage(url: string): Promise<string> {
	const browser = await getBrowser();
	const context = await browser.newContext({
		userAgent:
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
		locale: "en-US",
		timezoneId: "America/New_York",
	});

	try {
		const page: Page = await context.newPage();

		try {
			let lastError: Error | null = null;
			for (
				let attempt = 1;
				attempt <= config.SCRAPE_MAX_NAV_RETRIES;
				attempt++
			) {
				try {
					await page.goto(url, {
						waitUntil: "domcontentloaded",
						timeout: config.SCRAPE_NAV_TIMEOUT_MS,
					});
					lastError = null;
					break;
				} catch (err) {
					lastError = err instanceof Error ? err : new Error(String(err));
					if (attempt < config.SCRAPE_MAX_NAV_RETRIES) {
						const delay = Math.min(
							config.SCRAPE_RETRY_MAX_DELAY_MS,
							config.SCRAPE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1),
						);
						log.warn(
							{
								attempt,
								maxRetries: config.SCRAPE_MAX_NAV_RETRIES,
								url,
								delayMs: delay,
								error: lastError,
							},
							"Navigation attempt failed, retrying",
						);
						await new Promise((resolve) => setTimeout(resolve, delay));
					} else {
						throw lastError;
					}
				}
			}

			const readySelector = getReadySelector(url);
			await page
				.waitForSelector(readySelector, {
					timeout: config.SCRAPE_SELECTOR_TIMEOUT_MS,
				})
				.catch(() => {
					log.warn(
						{ selector: readySelector },
						"Expected selector not found before timeout",
					);
				});

			return await page.content();
		} finally {
			await safeClose(page, "page");
		}
	} finally {
		await safeClose(context, "context");
	}
}

export async function closeBrowser(): Promise<void> {
	if (browser) {
		await safeClose(browser, "browser");
		browser = null;
	}
}
