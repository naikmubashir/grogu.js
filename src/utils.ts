import fs from "fs";
import type { RequestHandler } from "express";
import type { Dependencies, GroguMiddleware, HttpMethod } from "./types";

// ansi color codes
const ansiCode = {
	debug: "\x1b[36m", // blue
	info: "\x1b[32m", // green
	error: "\x1b[31m", // red
	warn: "\x1b[33m", // orangish something
	reset: "\x1b[0m",
	bold: "\x1b[1m",
} as const;

type LogLevel = "debug" | "info" | "error" | "warn";

/** Trailing spaces are load-bearing: they keep the log columns aligned. */
const labels: Record<LogLevel, string> = {
	debug: "[DEBUG] ",
	info: "[INFO]  ",
	error: "[ERROR] ",
	warn: "[WARN]  ",
};

function emit(level: LogLevel, args: unknown[]): void {
	console.log(
		`${ansiCode.bold}${new Date().toISOString()}${ansiCode.reset} ${ansiCode[level]}${labels[level]}${ansiCode.reset}`,
		...args
	);
}

export const logger = {
	debug: (...args: unknown[]): void => emit("debug", args),
	info: (...args: unknown[]): void => emit("info", args),
	error: (...args: unknown[]): void => emit("error", args),
	warn: (...args: unknown[]): void => emit("warn", args),
};

/**
 * dirIterator
 * iterates over a given directory path and returns filenames and filepaths
 */
export function dirIterator(dir: string, f: (name: string, filepath: string) => void): void {
	// tsc emits no directory for a folder holding only .gitkeep, so services/,
	// middlewares/ and models/ can be absent from dist/ entirely. Iterating zero
	// files matches the empty-but-present directory this replaces.
	if (!fs.existsSync(dir)) return;

	const list = fs.readdirSync(dir);
	list.forEach(function (file) {
		let name = file;
		const filepath = dir + "/" + file;
		const stat = fs.statSync(filepath);
		const segments = name.split(".");
		if (stat && !stat.isDirectory() && segments.length > 1) {
			name = segments[0];
			const extension = segments[segments.length - 1];
			if (extension === "js") {
				f(name, filepath);
			}
		}
	});
}

/**
 * getValidHttpMethod
 * returns the valid http method from the string provided
 */
export function getValidHttpMethod(str: string | undefined | null): HttpMethod | null {
	if (!str) return null;
	// Constructed per call, not hoisted: a /g regex carries lastIndex state.
	const httpMethodRegex = /^(all|get|post|put|delete|trace|options|connect|patch|head)\s*/gi;
	const method = str.match(httpMethodRegex);
	return method && method.length ? (method[method.length - 1].toLowerCase().trim() as HttpMethod) : null;
}

/**
 * fatalError
 * consoles the fatal error then shuts down the node process
 *
 * The `never` return type is load-bearing: it lets TypeScript narrow control
 * flow in app.ts, where a guard proves a value is non-null by exiting otherwise.
 */
export function fatalError(errMessage: string): never {
	logger.error(errMessage);
	process.exit(1);
}

/**
 * injects dependency argument as the last argument
 * only works in case of functions which have original default arguments
 * like middleware functions
 */
export function injectDependencyArgument(originalFunc: GroguMiddleware, additionalArg: Dependencies): RequestHandler {
	// Escape hatch (spec §11): the bound dependency arrives first and is moved to
	// the end, so express still sees (req, res, next). The shuffle is untypeable.
	const moveArguments = function (f: (...args: any[]) => any) {
		return function (this: unknown, ...args: any[]) {
			const lastArg = args.shift();
			return f.apply(this, args.concat(lastArg));
		};
	};

	return moveArguments(originalFunc).bind(undefined, additionalArg) as unknown as RequestHandler;
}
