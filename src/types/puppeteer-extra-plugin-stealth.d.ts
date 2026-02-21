declare module "puppeteer-extra-plugin-stealth" {
	interface PlaywrightExtraPlugin {
		name?: string;
	}

	export default function StealthPlugin(
		...args: unknown[]
	): PlaywrightExtraPlugin;
}
