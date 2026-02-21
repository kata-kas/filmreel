import pino, { type Bindings, type Logger as PinoLogger } from "pino";
import { config } from "./config/index.js";

export interface AppLogger {
	child(bindings: Bindings): AppLogger;
	debug(...args: unknown[]): void;
	log(...args: unknown[]): void;
	info(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	error(...args: unknown[]): void;
}

function wrapLogger(inner: PinoLogger): AppLogger {
	return {
		child(bindings: Bindings): AppLogger {
			return wrapLogger(inner.child(bindings));
		},
		debug(...args: unknown[]): void {
			inner.debug(...(args as Parameters<PinoLogger["debug"]>));
		},
		log(...args: unknown[]): void {
			inner.info(...(args as Parameters<PinoLogger["info"]>));
		},
		info(...args: unknown[]): void {
			inner.info(...(args as Parameters<PinoLogger["info"]>));
		},
		warn(...args: unknown[]): void {
			inner.warn(...(args as Parameters<PinoLogger["warn"]>));
		},
		error(...args: unknown[]): void {
			inner.error(...(args as Parameters<PinoLogger["error"]>));
		},
	};
}

const base = pino({
	level: config.LOG_LEVEL,
});

export const logger = wrapLogger(base);
export function createChildLogger(bindings: Bindings): AppLogger {
	return logger.child(bindings);
}
