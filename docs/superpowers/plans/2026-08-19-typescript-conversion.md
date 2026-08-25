# Grogu.js TypeScript Conversion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the entire Grogu boilerplate to TypeScript with identical runtime behavior, keeping the zero-registration convention where dropping a file into `controllers/`, `services/` or `middlewares/` is all that is required.

**Architecture:** Source moves to `src/`, compiles to `dist/` via `tsc` with `"module": "commonjs"`. The runtime directory scanner is preserved and continues to call `require()` with computed paths against `dist/`. Authors write ES module syntax; a small `unwrapDefault` helper in the loader bridges `exports.default` back to the shape the scanner expects, which keeps legacy `module.exports = fn` files working unchanged.

**Tech Stack:** TypeScript 5, Express 4, Mocha 8 + Chai 4 (existing), typescript-eslint 8, Prettier (existing config, unchanged).

**Spec:** `docs/superpowers/specs/2026-08-19-typescript-conversion-design.md` — section references below (§7, §8.1, …) point into it.

## Global Constraints

- **Node >= 18.** `target: ES2022` in tsconfig requires it.
- **`strict: true`** in tsconfig. Exactly three escape hatches are permitted, each with a comment saying why: the `require()` of a scanned module, the `arguments` shuffling in `injectDependencyArgument`, and the dynamic `expressRouter[methodName]` dispatch (spec §11). Any fourth needs justification.
- **No `export =` anywhere.** Ever. Authors use `export default` / `export const` (spec §5).
- **Apply contracts with `satisfies`, never with a `:` annotation.** `const X: ServiceFactory = …` erases the inferred return shape and collapses `ReturnType` to `any`, which silently defeats the augmentation in spec §8.1.
- **Behavior is preserved.** The quirks in spec §13 (first-dot-segment module naming, `substring(-1)`, permissive CORS `else` branch) are deliberate and must not be "fixed".
- **Indentation is tabs, width 4, printWidth 120.** `.prettierrc` is unchanged; match it.
- **`config.rootDir` resolves to the project root**, not `dist/` (spec §7).
- **Do not commit.** The repo owner commits manually. Each task ends by staging its files and stopping for review — never run `git commit`.
- **Branch:** all work happens on `typescript-conversion`. Never commit to `master`.

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/types.ts` | Every public authoring contract. No runtime code — types only. |
| `src/utils.ts` | `logger`, `dirIterator`, `getValidHttpMethod`, `fatalError`, `injectDependencyArgument`. Pure, unit-testable. |
| `src/app.ts` | The loader: env bootstrap, scanning, dependency injection, route mounting, `listen`. |
| `src/config/apiVersions.ts` | `as const` version config. Feeds the `AllowedVersion` type. |
| `src/config/conf.ts`, `src/config/constants.ts` | User config objects. |
| `src/config/http.ts` | Server-level middleware array. |
| `src/controllers/Public.ts` | The one shipped example controller. |
| `src/grogu-env.d.ts` | Optional project type augmentation (spec §8.1). |
| `src/initTest.ts` | Forks the built app, runs Mocha over `dist/tests/`. |
| `src/tests/unit/*.test.ts` | Fast unit tests. No server. Run by `npm run test:unit`. |
| `src/tests/*.test.ts` | Integration tests against the running server. Run by `npm test`. |
| `src/tests/typecheck/*.ts` | Compile-time type assertions. Enforced by `npm run build`, never executed. |

Unit tests live in `src/tests/unit/` rather than `src/tests/` deliberately: `initTest` filters directory entries with `file.indexOf(".js") > -1`, so the subdirectory `unit` is excluded and unit tests do not require booting a server.

---

## Task 1: Toolchain and skeleton

**Files:**
- Create: `tsconfig.json`, `eslint.config.js`
- Create: `src/`, `src/config/`, `src/controllers/`, `src/services/.gitkeep`, `src/middlewares/.gitkeep`, `src/models/.gitkeep`, `src/tests/unit/.gitkeep`, `src/tests/typecheck/.gitkeep`
- Modify: `package.json`, `.gitignore`
- Delete: none yet — the legacy `.js` files stay until their replacements work.

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm run build` that every later task depends on; the npm scripts `build`, `dev`, `start`, `test`, `test:unit`, `watch`, `lint`.

- [ ] **Step 1: Install the toolchain**

```bash
npm install --save-dev typescript @types/node @types/express @types/cors \
  @types/compression @types/body-parser @types/mocha @types/chai @types/chai-http \
  typescript-eslint eslint@^9
npm uninstall babel-eslint
```

`@types/chai@^4` is required — the project is on Chai 4, and `@types/chai@5` targets Chai 5.

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "commonjs",
		"moduleResolution": "node",
		"lib": ["ES2022"],
		"rootDir": "src",
		"outDir": "dist",
		"strict": true,
		"esModuleInterop": true,
		"resolveJsonModule": true,
		"forceConsistentCasingInFileNames": true,
		"skipLibCheck": true,
		"sourceMap": true,
		"declaration": false
	},
	"include": ["src/**/*"],
	"exclude": ["node_modules", "dist"]
}
```

`noUncheckedIndexedAccess` is deliberately left off. Turning it on would force non-null assertions throughout `dirIterator` and the `Middlewares` lookups for no real safety gain, since those are guarded at runtime.

- [ ] **Step 3: Write `eslint.config.js`**

```js
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
	{ ignores: ["dist/**", "node_modules/**"] },
	...tseslint.configs.recommended,
	{
		languageOptions: { parserOptions: { project: "./tsconfig.json" } },
		rules: {
			// The loader's three documented escape hatches need `any` (spec §11).
			"@typescript-eslint/no-explicit-any": "off",
		},
	}
);
```

- [ ] **Step 4: Update `package.json` scripts**

Replace the `scripts` block with:

```json
"scripts": {
	"build": "tsc",
	"watch": "tsc --watch",
	"dev": "npm run build && node dist/app.js dev",
	"start": "npm run build && node dist/app.js",
	"test": "npm run build && node dist/initTest.js",
	"test:unit": "npm run build && mocha \"dist/tests/unit/**/*.test.js\"",
	"lint": "eslint src"
},
"main": "dist/app.js",
```

- [ ] **Step 5: Add `dist/` to `.gitignore`**

Append a `dist/` line to `.gitignore`.

- [ ] **Step 6: Create the directory skeleton**

```bash
mkdir -p src/config src/controllers src/services src/middlewares src/models src/tests/unit src/tests/typecheck
touch src/services/.gitkeep src/middlewares/.gitkeep src/models/.gitkeep src/tests/unit/.gitkeep src/tests/typecheck/.gitkeep
```

- [ ] **Step 7: Verify the toolchain builds**

Run: `npx tsc --noEmit`
Expected: exits 0 with no output. An empty `src/` compiles cleanly.

- [ ] **Step 8: Checkpoint — stage and hand off**

```bash
git add tsconfig.json eslint.config.js package.json package-lock.json .gitignore src/
git status
```

Stop here. The repo owner reviews and commits.

---

## Task 2: Type contracts and `apiVersions`

**Files:**
- Create: `src/types.ts`, `src/config/apiVersions.ts`, `src/tests/typecheck/contracts.ts`
- Delete: `config/apiVersions.js`

**Interfaces:**
- Consumes: the tsconfig from Task 1.
- Produces: `HttpMethod`, `MethodPrefix`, `RouteKey`, `AllowedVersion`, `ServicesMap`, `GroguConfig`, `Dependencies`, `RouteDefinition`, `RoutesFactory`, `ControllerModule`, `ServiceFactory`, `GroguMiddleware`, `ApiVersionConfig` — all exported from `src/types.ts`. Every later task imports from here.

- [ ] **Step 1: Write `src/config/apiVersions.ts`**

`as const` is what makes the literal values survive into the type system.

```ts
export default {
	default: "v1.0",
	allowedVersions: ["v1.0", "v2.0"],
} as const;
```

- [ ] **Step 2: Write the failing type test at `src/tests/typecheck/contracts.ts`**

This file is never executed. `@ts-expect-error` is the assertion: if the error it claims does not occur, `tsc` fails with "Unused '@ts-expect-error' directive". That is the failing test.

```ts
import type { RouteDefinition, RouteKey, AllowedVersion, RoutesFactory } from "../../types";

// A valid route key with the method embedded.
const validKey: RouteKey = "GET /test";
// Lowercase and capitalized prefixes stay valid — the runtime regex is case-insensitive.
const lowerKey: RouteKey = "get /test";
const capKey: RouteKey = "Get /test";
// A bare path with no method prefix is valid too.
const bareKey: RouteKey = "/test";

// @ts-expect-error "GTE" is not an HTTP method — this used to mount nothing, silently.
const typoKey: RouteKey = "GTE /test";
// @ts-expect-error a method prefix with no leading slash on the path is invalid.
const noSlashKey: RouteKey = "GET test";

const validVersion: AllowedVersion = "v2.0";
// @ts-expect-error "v9.9" is not in config/apiVersions.ts allowedVersions.
const badVersion: AllowedVersion = "v9.9";

const validRoute: RouteDefinition = {
	handler: async (_req, res) => {
		res.json({ ok: true });
	},
};

const misspelled: RouteDefinition = {
	handler: async (_req, res) => {
		res.json({ ok: true });
	},
	// @ts-expect-error the property is `localMiddlewares`; `middlewares` was silently ignored before.
	middlewares: ["checkAuth"],
};

// Silence unused-variable noise; this file exists only for its type errors.
export const _assertions = [validKey, lowerKey, capKey, bareKey, typoKey, noSlashKey, validVersion, badVersion, validRoute, misspelled];
```

- [ ] **Step 3: Run the type test to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL with `Cannot find module '../../types'`. The contracts do not exist yet.

- [ ] **Step 4: Write `src/types.ts`**

```ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type apiVersionConfig from "./config/apiVersions";

export type HttpMethod =
	| "all"
	| "get"
	| "post"
	| "put"
	| "delete"
	| "trace"
	| "options"
	| "connect"
	| "patch"
	| "head";

/**
 * Accepted casings for a method prefix. Mirrors the case-insensitive regex in
 * getValidHttpMethod, so "GET", "get" and "Get" are all valid.
 */
export type MethodPrefix = Uppercase<HttpMethod> | Lowercase<HttpMethod> | Capitalize<HttpMethod>;

/** Either "GET /test" (method in the key) or "/test" (method in the definition). */
export type RouteKey = `${MethodPrefix} /${string}` | `/${string}`;

/** Derived from config/apiVersions.ts, which is declared `as const`. */
export type AllowedVersion = (typeof apiVersionConfig)["allowedVersions"][number];

/** Augmentable by the consuming project via declaration merging (spec §8.1). */
export interface ServicesMap {
	[serviceName: string]: any;
}

/** Augmentable by the consuming project via declaration merging (spec §8.1). */
export interface GroguConfig {
	CONSTANTS: Record<string, unknown>;
	rootDir: string;
	[key: string]: any;
}

export interface Dependencies {
	Services: ServicesMap;
	config: GroguConfig;
}

export interface RouteDefinition {
	/** Omitted when the method is embedded in the route key, e.g. "GET /test". */
	method?: MethodPrefix;
	/** Defaults to apiVersions.default when omitted. */
	version?: AllowedVersion;
	/** Defaults to true. */
	enabled?: boolean;
	/** Names of files in middlewares/; defaults to []. */
	localMiddlewares?: string[];
	handler: RequestHandler;
}

export type RoutesFactory = (deps: Dependencies) => Record<RouteKey, RouteDefinition>;

export interface ControllerModule {
	routes: RoutesFactory;
	globalMiddlewares?: string[];
}

export type ServiceFactory<T = any> = (deps: Dependencies) => T | Promise<T>;

export type GroguMiddleware = (
	req: Request,
	res: Response,
	next: NextFunction,
	deps: Dependencies
) => void | Promise<void>;

export interface ApiVersionConfig {
	default: string;
	/** readonly, because config/apiVersions.ts is declared `as const`. */
	allowedVersions: readonly string[];
}
```

- [ ] **Step 5: Run the type test to verify it passes**

Run: `npx tsc --noEmit`
Expected: exits 0. Every `@ts-expect-error` is now consumed by a real error, and the valid declarations all check.

If instead you see `Unused '@ts-expect-error' directive`, a type is too loose — the assertion it guards is not being caught. Fix the type, not the test.

- [ ] **Step 6: Delete the legacy file**

```bash
git rm config/apiVersions.js
```

- [ ] **Step 7: Checkpoint — stage and hand off**

```bash
git add src/types.ts src/config/apiVersions.ts src/tests/typecheck/contracts.ts
git status
```

Stop here for review.

---

## Task 3: `utils.ts`

**Files:**
- Create: `src/utils.ts`, `src/tests/unit/utils.test.ts`
- Delete: `utils.js`

**Interfaces:**
- Consumes: `HttpMethod`, `GroguMiddleware`, `Dependencies` from `src/types.ts`.
- Produces:
  - `logger: { debug, info, error, warn }`, each `(...args: unknown[]) => void`
  - `dirIterator(dir: string, f: (name: string, filepath: string) => void): void`
  - `getValidHttpMethod(str: string | undefined | null): HttpMethod | null`
  - `fatalError(errMessage: string): never`
  - `injectDependencyArgument(originalFunc: GroguMiddleware, additionalArg: Dependencies): RequestHandler`

- [ ] **Step 1: Write the failing unit tests at `src/tests/unit/utils.test.ts`**

```ts
import { expect } from "chai";
import fs from "fs";
import os from "os";
import path from "path";
import { dirIterator, getValidHttpMethod } from "../../utils";

describe("getValidHttpMethod", () => {
	it("extracts a lowercase method from an uppercase key", () => {
		expect(getValidHttpMethod("GET /test")).to.equal("get");
	});

	it("accepts a bare method name", () => {
		expect(getValidHttpMethod("post")).to.equal("post");
	});

	it("is case-insensitive", () => {
		expect(getValidHttpMethod("Delete /thing")).to.equal("delete");
	});

	it("returns null for an unknown method", () => {
		expect(getValidHttpMethod("GTE /test")).to.equal(null);
	});

	it("returns null for a bare path", () => {
		expect(getValidHttpMethod("/test")).to.equal(null);
	});

	it("returns null for empty and nullish input", () => {
		expect(getValidHttpMethod("")).to.equal(null);
		expect(getValidHttpMethod(undefined)).to.equal(null);
		expect(getValidHttpMethod(null)).to.equal(null);
	});

	it("is not stateful across calls", () => {
		expect(getValidHttpMethod("GET /a")).to.equal("get");
		expect(getValidHttpMethod("GET /b")).to.equal("get");
	});
});

describe("dirIterator", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = fs.mkdtempSync(path.join(os.tmpdir(), "grogu-"));
	});

	afterEach(() => {
		fs.rmSync(tmp, { recursive: true, force: true });
	});

	it("iterates zero files when the directory does not exist", () => {
		const seen: string[] = [];
		dirIterator(path.join(tmp, "definitely-absent"), (name) => seen.push(name));
		expect(seen).to.deep.equal([]);
	});

	it("yields only .js files", () => {
		fs.writeFileSync(path.join(tmp, "One.js"), "");
		fs.writeFileSync(path.join(tmp, "Two.ts"), "");
		fs.writeFileSync(path.join(tmp, "Three.js.map"), "");
		const seen: string[] = [];
		dirIterator(tmp, (name) => seen.push(name));
		expect(seen).to.deep.equal(["One"]);
	});

	it("names a module by its first dot-segment", () => {
		fs.writeFileSync(path.join(tmp, "My.Controller.js"), "");
		const seen: string[] = [];
		dirIterator(tmp, (name) => seen.push(name));
		expect(seen).to.deep.equal(["My"]);
	});

	it("skips directories and extensionless files", () => {
		fs.mkdirSync(path.join(tmp, "nested"));
		fs.writeFileSync(path.join(tmp, ".gitkeep"), "");
		const seen: string[] = [];
		dirIterator(tmp, (name) => seen.push(name));
		expect(seen).to.deep.equal([]);
	});

	it("passes the full path as the second argument", () => {
		fs.writeFileSync(path.join(tmp, "One.js"), "");
		const seen: string[] = [];
		dirIterator(tmp, (_name, filepath) => seen.push(filepath));
		expect(seen).to.deep.equal([tmp + "/One.js"]);
	});
});
```

The `.gitkeep` case matters: `".gitkeep".split(".")` is `["", "gitkeep"]`, length 2, so it passes the length guard and is rejected only by the extension check. That is existing behavior and the test pins it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. `tsc` errors first with `Cannot find module '../../utils'`.

- [ ] **Step 3: Write `src/utils.ts`**

```ts
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
```

Note on `bind(undefined, …)`: the original bound `this` to `module.exports`. Compiled TypeScript modules are strict-mode, so `this` inside a middleware is `undefined` rather than the module object. No middleware can meaningfully have used that binding, and nothing in the repo does.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS, 12 passing (7 for getValidHttpMethod, 5 for dirIterator).

- [ ] **Step 5: Delete the legacy file**

```bash
git rm utils.js
```

- [ ] **Step 6: Checkpoint — stage and hand off**

```bash
git add src/utils.ts src/tests/unit/utils.test.ts
git status
```

Stop here for review.

---

## Task 4: Config files

**Files:**
- Create: `src/config/conf.ts`, `src/config/constants.ts`, `src/config/http.ts`
- Delete: `config/conf.js`, `config/constants.js`, `config/http.js`

**Interfaces:**
- Consumes: nothing beyond express and the existing runtime dependencies.
- Produces: three default-exported modules. `app.ts` loads all three through `unwrapDefault`.

- [ ] **Step 1: Write `src/config/conf.ts`**

```ts
/**
 * conf.ts
 * this is the main config file and can be accessed through the "config" dependency
 * which is injected in both controllers and middlewares
 */
export default {};
```

- [ ] **Step 2: Write `src/config/constants.ts`**

```ts
/**
 * constants.ts
 * this is the file where server wide constants are defined and are referenced
 * using "config.CONSTANTS"
 */
export default {};
```

- [ ] **Step 3: Write `src/config/http.ts`**

The CORS `else` branch allows every origin through while logging a rejection. That is existing behavior (spec §13) — port it verbatim, do not tighten it.

```ts
/**
 * http.ts
 * Here server level middlewares are defined
 */
import bodyParser from "body-parser";
import compression from "compression";
import cors from "cors";
import type { CorsOptions } from "cors";
import type { RequestHandler } from "express";

const jsonParser = bodyParser.json({ limit: "50mb" });

/* This whitelist can only filter requests from the browser clients */
const whitelist = ["http://localhost:3000"];

const corsOptions: CorsOptions = {
	origin: function (origin, callback) {
		if (!origin) {
			callback(null, true);
		} else if (whitelist.indexOf(origin) !== -1) {
			callback(null, true);
		} else if (origin == null) {
			callback(null, true);
		} else if (origin.indexOf("chrome-extension") >= 0) {
			callback(null, true);
		} else {
			console.log("[Not allowed by CORS] but allowed temporarily", origin);
			callback(null, true);
		}
		return;
	},
};

const middlewares: RequestHandler[] = [jsonParser, compression(), cors(corsOptions)];

export default middlewares;
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exits 0.

- [ ] **Step 5: Delete the legacy files**

```bash
git rm config/conf.js config/constants.js config/http.js
```

- [ ] **Step 6: Checkpoint — stage and hand off**

```bash
git add src/config/
git status
```

Stop here for review.

---

## Task 5: The loader (`app.ts`)

**Files:**
- Create: `src/app.ts`
- Delete: `app.js`

**Interfaces:**
- Consumes: everything from `src/utils.ts` and `src/types.ts`; the config modules from Task 4.
- Produces: a bootable server. Emits the IPC message `"ready"` once listening, which `initTest.ts` in Task 6 waits on.

- [ ] **Step 1: Write `src/app.ts`**

```ts
import express from "express";
import type { RequestHandler } from "express";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import * as utils from "./utils";
import { logger, fatalError } from "./utils";
import type {
	ApiVersionConfig,
	ControllerModule,
	GroguConfig,
	GroguMiddleware,
	HttpMethod,
	RouteDefinition,
	ServicesMap,
} from "./types";

const app = express();

/** Where the compiled code lives (dist/). Scanned for controllers/services/etc. */
const appDir = __dirname;
/** Project root: holds .env files, package.json and user assets (spec §7). */
const projectRoot = path.resolve(__dirname, "..");

// dotenv for .env variable injection
if (process.argv.length >= 3) {
	const ENV = process.argv[2];
	if (!fs.existsSync(projectRoot + "/.env." + ENV)) {
		fatalError(`.env.${ENV} environment not provided`);
	}
	dotenv.config({ path: projectRoot + "/.env." + ENV });
} else {
	if (!fs.existsSync(projectRoot + "/.env")) {
		fatalError("Default .env file environment not provided");
	}
	dotenv.config({ path: projectRoot + "/.env" });
}

// Controller dir path
const controllersDir = appDir + "/controllers";
// Services dir path
const servicesDir = appDir + "/services";
// Middleware dir path
const middlewaresDir = appDir + "/middlewares";
// Config dir path
const configDir = appDir + "/config";

const port = process.env.PORT ? Number(process.env.PORT) : 3000;

/**
 * tsc compiles `export default x` to `exports.default = x`. Unwrap it so both
 * modern (`export default`) and legacy (`module.exports = x`) files load (spec §10).
 */
function unwrapDefault<T>(mod: any): T {
	return (mod?.default ?? mod) as T;
}

// Escape hatch (spec §11): a scanned module's path is computed, so its shape is
// validated by this loader at runtime rather than by tsc.
// prettier-ignore
const apiVersionConfig: ApiVersionConfig = fs.existsSync(configDir + "/apiVersions.js")
	? unwrapDefault<ApiVersionConfig>(require(configDir + "/apiVersions.js"))
	: {
		default: "v1.0",
		allowedVersions: ["v1.0"],
	};
if (!apiVersionConfig.default || !apiVersionConfig.allowedVersions) {
	utils.fatalError("apiVersion config is invalid please check config/apiVersions.js");
}

// function to load the app
const load = async function (): Promise<void> {
	// Services and Middleware objects to store all the required functions
	const Services: ServicesMap = {};
	const Middlewares: Record<string, GroguMiddleware> = {};

	// Load config which will be a dependency injection.
	// Spread order is preserved from the original: conf can override CONSTANTS.
	const config = {
		CONSTANTS: unwrapDefault<Record<string, unknown>>(require(configDir + "/constants")),
		...unwrapDefault<Record<string, unknown>>(require(configDir + "/conf")),
		rootDir: projectRoot,
	} as GroguConfig;

	// Load all services by iterating and requiring files inside /services
	utils.dirIterator(servicesDir, function (filename, filepath) {
		const serviceName = filename.charAt(0).toUpperCase() + filename.slice(1);
		Services[serviceName] = unwrapDefault(require(filepath));
	});

	// load async dependencies in services if any and inject the config dependency
	for (const serviceName in Services) {
		Services[serviceName] = await Services[serviceName]({ config: config, Services });
	}

	// Load all middlewares by iterating and requiring files inside /middlewares
	utils.dirIterator(middlewaresDir, function (filename, filepath) {
		Middlewares[filename] = unwrapDefault<GroguMiddleware>(require(filepath));
	});

	// Load all server level middlewares only if /config/http.js exists
	if (fs.existsSync(configDir + "/http.js")) {
		const httpMiddlewares = unwrapDefault<RequestHandler[]>(require(configDir + "/http"));
		httpMiddlewares.forEach((item) => {
			app.use(item);
		});
	}

	// Loading all controllers in an express Router
	utils.dirIterator(controllersDir, function (filename, filepath) {
		const expressRouter = express.Router();
		const rawModule = require(filepath);
		// Named exports win; fall back to a default-exported controller object (spec §10).
		const controllerConfig: ControllerModule =
			rawModule && typeof rawModule.routes === "function"
				? rawModule
				: unwrapDefault<ControllerModule>(rawModule);

		// The filename in class case is the base route path
		const baseRoute = filename.charAt(0).toUpperCase() + filename.slice(1);

		// Get subroute routes and inject the Services and config dependency.
		// Cast to a plain string map so the pattern-keyed Record can be iterated.
		const routeConfig = controllerConfig.routes({ Services, config: config }) as Record<string, RouteDefinition>;

		for (let subRouteName in routeConfig) {
			const subRouteConfig = routeConfig[subRouteName];

			// If localMiddlewares dont exist then keep default no middlewares
			const localMiddlewares = subRouteConfig.localMiddlewares ?? [];

			const keyMethodName = utils.getValidHttpMethod(subRouteName);
			let methodName = utils.getValidHttpMethod(subRouteConfig.method);

			if (keyMethodName && methodName)
				fatalError(`Dual HTTP method definition at controllers/${filename} at route: "${subRouteName}"`);

			if (keyMethodName) {
				const routeIndex = subRouteName.indexOf("/");
				subRouteName = subRouteName.substring(routeIndex);
				methodName = keyMethodName;
			}

			// Equivalent to the original `!methodName && !keyMethodName`: whenever
			// keyMethodName is truthy, methodName was just assigned from it, so the
			// second conjunct can never decide the outcome. Dropping it lets
			// TypeScript narrow methodName to HttpMethod below.
			if (!methodName) {
				fatalError(
					`Invalid HTTP method: "${subRouteConfig.method}" at controllers/${filename} at route: "${subRouteName}"`
				);
			}

			// If route is disabled by default all routes are enabled
			if (subRouteConfig.enabled === false) {
				logger.warn(
					`Disabled endpoint HTTP method: "${methodName.toUpperCase()}" at controllers/${filename} at route: "${subRouteName}"`
				);
				logger.info("_______________________________________________________");
				continue;
			}

			if (!subRouteConfig.version) {
				subRouteName = "/" + apiVersionConfig.default + subRouteName;
			} else {
				if (!apiVersionConfig.allowedVersions.includes(subRouteConfig.version)) {
					fatalError(
						`Invalid api version: "${subRouteConfig.version}" at controllers/${filename} at route: "${subRouteName}"`
					);
				} else {
					subRouteName = "/" + subRouteConfig.version + subRouteName;
				}
			}

			// Escape hatch (spec §11): indexing Router by a dynamic HttpMethod key
			// yields a union of call signatures TypeScript will not invoke with
			// spread arguments.
			const routerMethod = (expressRouter as unknown as Record<HttpMethod, (...args: any[]) => unknown>)[
				methodName
			];
			routerMethod.call(
				expressRouter,
				subRouteName,
				// get the actual middleware functions from the name references in the config
				localMiddlewares.map((e) => {
					if (!Middlewares[e]) {
						// if a middleware name reference does not exist
						utils.fatalError(
							`Invalid middleware name: "${e}" at controllers/${filename} at route: "${subRouteName}"`
						);
					}
					// inject Services and config as a dependency to middleware
					return utils.injectDependencyArgument(Middlewares[e], { Services, config: config });
				}),
				subRouteConfig.handler
			);

			logger.info(`Added | \t ${methodName.toUpperCase()}  /${baseRoute}${subRouteName}`);
			logger.info("_______________________________________________________");
		}

		// attach global middlewares to the baseRoute
		controllerConfig.globalMiddlewares &&
			controllerConfig.globalMiddlewares.forEach((middlewareName) => {
				if (!Middlewares[middlewareName]) {
					// if a middleware name reference does not exist
					utils.fatalError(`Invalid middleware name: "${middlewareName}" at controllers/${filename}`);
				}
				// inject Services and config as a dependency to middleware
				app.use(
					"/" + baseRoute,
					utils.injectDependencyArgument(Middlewares[middlewareName], { Services, config: config })
				);
			});

		// attach router to the baseRoute through app
		app.use("/" + baseRoute, expressRouter);
	});
};

process.on("unhandledRejection", (error) => {
	console.log("unhandledRejection : ", error);
});

load()
	.then(() => {
		// start listening
		app.listen(port, function () {
			logger.info(`Listening on ${port}`);
			if (process.send) {
				process.send("ready");
			}
		});
	})
	.catch((error) => {
		console.log("Error while intializing : ", error);
	});
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: exits 0.

If `methodName.toUpperCase()` reports "possibly null", the `if (!methodName)` guard is wrong or `fatalError` is not typed `never` — fix the guard, never reach for `!`.

- [ ] **Step 3: Delete the legacy file**

```bash
git rm app.js
```

The app cannot boot yet — there is no controller in `src/`. Task 6 makes it runnable.

- [ ] **Step 4: Checkpoint — stage and hand off**

```bash
git add src/app.ts
git status
```

Stop here for review.

---

## Task 6: Example controller, test harness, first green boot

**Files:**
- Create: `src/controllers/Public.ts`, `src/initTest.ts`, `src/tests/public.test.ts`
- Delete: `controllers/Public.js`, `initTest.js`, `controllers/.gitkeep`, `middlewares/.gitkeep`, `models/.gitkeep`, `services/.gitkeep`, `tests/.gitkeep`

**Interfaces:**
- Consumes: `RoutesFactory` and `logger`; the loader from Task 5.
- Produces: a running server exposing `GET /Public/v1.0/test`, and `npm test` as a working integration harness.

- [ ] **Step 1: Write the failing integration test at `src/tests/public.test.ts`**

```ts
import chai from "chai";
import chaiHttp from "chai-http";

chai.use(chaiHttp);
const expect = chai.expect;

const BASE_URL = "http://localhost:" + (process.env.PORT ? process.env.PORT : "3000");

describe("Public controller", () => {
	it("serves GET /Public/v1.0/test", async () => {
		const res = await chai.request(BASE_URL).get("/Public/v1.0/test");
		expect(res).to.have.status(200);
		expect(res.body).to.deep.equal({ ok: true, message: "hello world" });
	});

	it("does not serve the route without the version prefix", async () => {
		const res = await chai.request(BASE_URL).get("/Public/test");
		expect(res).to.have.status(404);
	});
});
```

- [ ] **Step 2: Write `src/initTest.ts`**

```ts
import { fork } from "child_process";
import Mocha from "mocha";
import fs from "fs";
import path from "path";

// Instantiate a Mocha instance.
const mocha = new Mocha();

const appProc = fork("./dist/app", process.argv.length >= 3 ? [process.argv[2]] : []);

appProc.on("message", function (message) {
	if (message == "ready") {
		console.log("Server Running");

		const testDir = "./dist/tests";

		// The compiled tests directory can be absent if src/tests holds no .ts files.
		if (fs.existsSync(testDir)) {
			// Add each .js file to the mocha instance
			fs.readdirSync(testDir)
				.filter(function (file) {
					// Only keep the .js files
					return file.indexOf(".js") > -1;
				})
				.forEach(function (file) {
					mocha.addFile(path.join(testDir, file));
				});
		}

		// Run the tests.
		mocha
			.run(function (failures) {
				appProc.exitCode = failures ? 1 : 0;
				process.exit(failures ? 1 : 0);
			})
			.on("end", function () {
				console.log("Tests finished");
			});
	}
});

appProc.on("error", function (err) {
	console.error("Error occured on the server", err.message);
	process.exit(1);
});

appProc.on("exit", function () {
	const msg = "Server exited before tests";
	console.error(msg);
	process.exit(1);
});

appProc.on("SIGTERM", function () {
	process.exit(1);
});
```

The `readdirSync` filter keeps `.js.map` files out only incidentally — `"public.test.js.map".indexOf(".js")` is greater than -1, so sourcemaps *would* be added to Mocha. Set `"sourceMap": false` if this causes trouble; with `mocha.addFile` on a `.map` the file is loaded as JS and silently contributes no tests, which is harmless. Leave sourcemaps on.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL. The server exits before tests, because `src/controllers/` holds no controller and `dist/controllers` does not exist — plus `.env.dev` is not loaded without an argument, so `fatalError` fires on the missing default `.env`.

Run instead: `npm run build && node dist/initTest.js dev`
Expected: FAIL with a 404 on `/Public/v1.0/test`.

- [ ] **Step 4: Write `src/controllers/Public.ts`**

```ts
/**
 * Public Controller
 * all public endpoints accessible to all will be here
 */
import type { RoutesFactory } from "../types";
import { logger } from "../utils";

export const routes = (({ Services, config }) => ({
	"GET /test": {
		handler: async (req, res) => {
			try {
				res.json({ ok: true, message: "hello world" });
			} catch (e) {
				res.json({ ok: true, message: (e as Error).message });
				logger.error(e);
			}
		},
	},
})) satisfies RoutesFactory;
```

- [ ] **Step 5: Point `npm test` at the dev environment**

The repo has `.env.dev` but no `.env`, so the harness must pass the env argument through. Update the `test` script in `package.json`:

```json
"test": "npm run build && node dist/initTest.js dev",
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 2 passing, then `Tests finished`. The boot log lists `Added | 	 GET  /Public/v1.0/test`.

- [ ] **Step 7: Verify the app runs standalone**

Run: `npm run dev`
Expected: the route table prints and `Listening on 3000` appears.

In another shell: `curl -s localhost:3000/Public/v1.0/test`
Expected: `{"ok":true,"message":"hello world"}`

- [ ] **Step 8: Delete the legacy files**

```bash
git rm controllers/Public.js initTest.js
git rm controllers/.gitkeep middlewares/.gitkeep models/.gitkeep services/.gitkeep tests/.gitkeep
rmdir controllers middlewares models services tests config docs 2>/dev/null || true
```

`docs/` must survive — it holds the documentation rewritten in Task 8. The `rmdir` only removes directories that are already empty, so `docs/` is safe.

- [ ] **Step 9: Checkpoint — stage and hand off**

```bash
git add -A src package.json
git status
```

Stop here for review.

---

## Task 7: Project type augmentation

**Files:**
- Create: `src/grogu-env.d.ts`, `src/services/ExampleService.ts`, `src/tests/typecheck/augmentation.ts`
- Modify: `src/tests/unit/` — none.

**Interfaces:**
- Consumes: `ServiceFactory`, `ServicesMap`, `GroguConfig` from `src/types.ts`.
- Produces: a worked example proving spec §8.1 functions, including that `satisfies` preserves the inferred shape.

This task exists to prove the augmentation mechanism works end to end. `ExampleService.ts` is a real service the loader will pick up.

- [ ] **Step 1: Write `src/services/ExampleService.ts`**

Note `satisfies`, not `: ServiceFactory`. An annotation here would collapse the return type to `any` and Step 4's assertions would silently pass for the wrong reason.

```ts
import type { ServiceFactory } from "../types";

const ExampleService = (async ({ config, Services }) => ({
	iDoSomething: async (): Promise<string> => "hello world",
})) satisfies ServiceFactory;

export default ExampleService;
```

- [ ] **Step 2: Write the failing type test at `src/tests/typecheck/augmentation.ts`**

```ts
import type { ServicesMap, GroguConfig } from "../../types";

declare const Services: ServicesMap;
declare const config: GroguConfig;

// Resolves only once ServicesMap is augmented.
const result: Promise<string> = Services.ExampleService.iDoSomething();

// @ts-expect-error a misspelled service name must not compile once augmented.
const typo = Services.ExampleServce.iDoSomething();

// @ts-expect-error a misspelled method on a known service must not compile.
const methodTypo = Services.ExampleService.iDoSomthing();

const region: string = config.aws.region;

export const _assertions = [result, typo, methodTypo, region];
```

- [ ] **Step 3: Run the type test to verify it fails**

Run: `npx tsc --noEmit`
Expected: FAIL with three `Unused '@ts-expect-error' directive` errors. The index signature on `ServicesMap` currently makes every access legal, so nothing is caught.

- [ ] **Step 4: Write `src/grogu-env.d.ts`**

```ts
export {}; // makes this file a module, which declaration merging requires

declare module "./types" {
	interface ServicesMap {
		ExampleService: Awaited<ReturnType<typeof import("./services/ExampleService").default>>;
	}

	interface GroguConfig {
		aws: { region: string };
	}
}
```

- [ ] **Step 5: Run the type test to verify it passes**

Run: `npx tsc --noEmit`
Expected: exits 0. All three `@ts-expect-error` directives are now consumed.

If `Services.ExampleService.iDoSomething()` still reports `any`, `ExampleService.ts` was annotated with `:` instead of `satisfies` — fix the service, not the test.

- [ ] **Step 6: Verify the service still loads at runtime**

Run: `npm test`
Expected: PASS, 2 passing. The augmentation is types-only and must not affect the boot.

- [ ] **Step 7: Checkpoint — stage and hand off**

```bash
git add src/grogu-env.d.ts src/services/ExampleService.ts src/tests/typecheck/augmentation.ts
git status
```

Stop here for review.

---

## Task 8: Documentation and final verification

**Files:**
- Modify: `README.md`, `docs/index.md`

**Interfaces:**
- Consumes: everything built so far.
- Produces: documentation whose examples compile, and a verified run against all of spec §17.

- [ ] **Step 1: Rewrite `docs/index.md` examples in TypeScript**

Every fenced `js` block becomes `ts`. Convert each of the six examples:

Controller — note `satisfies` and the type-only import:

```ts
import type { RoutesFactory } from "../types";

export const globalMiddlewares = ["middlewareA"];

export const routes = (({ Services, config }) => ({
	"/hello": {
		method: "get",
		handler: async (req, res) => {
			res.json({ message: await Services.UserService.iDoSomething() });
		},
		enabled: true,
		localMiddlewares: ["middlewareB"],
	},
	"POST /hello": {
		version: "v2.0",
		handler: async (req, res) => {
			res.json({ message: await Services.UserService.iDoSomething() });
		},
		enabled: true,
		localMiddlewares: ["middlewareB"],
	},
})) satisfies RoutesFactory;
```

The existing doc uses `version: "v2.2"`, which is not in `allowedVersions` and would now fail to compile. Change it to `"v2.0"` and update the surrounding prose, which currently claims the route mounts at `/User/v2.2/hello`.

Service:

```ts
import type { ServiceFactory } from "../types";

const UserService = (async ({ config, Services }) => ({
	iDoSomething: async (): Promise<string> => "hello world",
})) satisfies ServiceFactory;

export default UserService;
```

Middleware:

```ts
import type { GroguMiddleware } from "../types";

const checkSomething = ((req, res, next, { Services, config }) => {
	next();
}) satisfies GroguMiddleware;

export default checkSomething;
```

`config/conf.ts`, `config/constants.ts` and `config/http.ts` blocks become the Task 4 files verbatim. The `models/` example becomes `export default { … };`.

- [ ] **Step 2: Add a section to `docs/index.md` on typing `Services` and `config`**

Document `src/grogu-env.d.ts` using the Task 7 file as the worked example, and state plainly that it is optional and hand-maintained: skipping it still compiles and runs, you just keep the `any` fallback.

Add a short note that contracts are applied with `satisfies`, never `:`, and why — an annotation erases the inferred return type and breaks `ReturnType` in the augmentation.

- [ ] **Step 3: Update `README.md`**

Document the build step, the `src/` → `dist/` layout, the new scripts (`build`, `watch`, `dev`, `start`, `test`, `test:unit`, `lint`), and the Node >= 18 floor. State that `npm run dev` and `npm start` build first. Note that `.env.dev` and `.env` are read from the project root, not from `dist/`.

- [ ] **Step 4: Run the full verification against spec §17**

Run each and confirm the expected result:

```bash
npm run build        # 1. zero errors under strict
npm run lint         # no errors
npm run test:unit    # 12 passing
npm test             # 2 passing
npm run dev          # 2. boots on .env.dev, prints the route table
curl -s localhost:3000/Public/v1.0/test    # 3. {"ok":true,"message":"hello world"}
```

Criterion 5 — a fresh clone with empty directories boots:

```bash
rm -rf dist && mv src/services/ExampleService.ts /tmp/ && npm run build && node dist/app.js dev
```
Expected: boots cleanly with no `ENOENT`, proving the `dirIterator` guard from Task 3. Then restore: `mv /tmp/ExampleService.ts src/services/`.

Criterion 6 — a new controller needs no registration:

```bash
printf 'import type { RoutesFactory } from "../types";\nexport const routes = (() => ({ "GET /ping": { handler: async (_req, res) => { res.json({ pong: true }); } } })) satisfies RoutesFactory;\n' > src/controllers/Ping.ts
npm run build && node dist/app.js dev &
curl -s localhost:3000/Ping/v1.0/ping    # {"pong":true}
```
Then remove it: `rm src/controllers/Ping.ts dist/controllers/Ping.js`

Criterion 7 — a legacy `module.exports` file still loads:

```bash
mkdir -p dist/services && printf 'module.exports = async function () { return { legacy: () => true }; };\n' > dist/services/LegacyService.js
node dist/app.js dev
```
Expected: boots with no error, proving the `?? mod` fallback in `unwrapDefault`. Then: `rm dist/services/LegacyService.js`

Criterion 8 — no `export =`:

```bash
grep -rn "export =" src/ || echo "clean"
```
Expected: `clean`

Criterion 9 — contracts use `satisfies`:

```bash
grep -rnE ": (ServiceFactory|RoutesFactory|GroguMiddleware) =" src/ || echo "clean"
```
Expected: `clean`

- [ ] **Step 5: Confirm no legacy JavaScript remains**

```bash
git ls-files "*.js" | grep -v "^eslint.config.js$" || echo "clean"
```
Expected: `clean`. Only `eslint.config.js` is legitimately JavaScript.

- [ ] **Step 6: Checkpoint — stage and hand off**

```bash
git add -A
git status
```

Stop here. The repo owner reviews the full diff and commits.

---

## Rollback

Every task is additive until its final `git rm`, and the legacy `.js` file is deleted only after its TypeScript replacement is verified working. If a task fails review, `git checkout -- .` restores the tree to the last commit the repo owner made, since nothing is committed by the implementer.

---

## Implementation deltas

Recorded during execution. Each is a place the plan was wrong and the code is right.

| # | Plan said | Reality |
|---|---|---|
| 1 | TypeScript 5, `moduleResolution: "node"` | TS 6.0.3 installed; `node10` resolution is deprecated and errors. Switched to `"module": "node16"`, which still emits CommonJS because package.json has no `"type": "module"`. |
| 2 | `@types` auto-included | TS 6 did not pick up `@types/mocha`; `"types": ["node", "mocha"]` is set explicitly. |
| 3 | `@types/chai-http` needed | chai-http 4.3.0 ships its own types; the stub package is deprecated and was removed. |
| 4 | `appProc.exitCode = …` ported as-is | Read-only in current `@types/node`. The assignment was inert (nothing reads it before `process.exit`), so it was dropped with a comment. |
| 5 | Mocha's `indexOf(".js") > -1` filter is harmless | It matches `.js.map`, so Mocha loaded a JSON sourcemap as JavaScript. Changed to `endsWith(".js")`. |
| 6 | initTest exits cleanly | The forked server was never killed. The orphan held the inherited stdout pipe open, so `npm test` never returned. Added a `shutdown()` that kills the child, guarded by a `serverReady` flag so it is not misreported as a crash. |
| 7 | `tsc` output is clean | `tsc` does not remove stale output. Added a `prebuild` script that clears `dist/`. |
| 8 | `const Services: ServicesMap = {}` | Augmenting `ServicesMap` makes members required, so the empty literal fails. Changed to `{} as ServicesMap`. |
| 9 | §8.1 makes a misspelled service name a compile error | It cannot. The index signature that lets un-augmented projects work answers every unknown key. Misspelled *methods* on a known service are caught; misspelled *service names* are not. Spec §8.1 corrected. |
| 10 | `satisfies RoutesFactory` enforces route keys | It does not. `RouteKey` becomes pattern index signatures, which ignore non-matching keys — and skip checking those values entirely. Added `defineRoutes`, a generic identity helper that validates keys and bans excess properties while preserving contextual typing for `req`/`res`. This was the largest deviation. |
| 11 | eslint runs clean on the ported code | `no-require-imports`, `no-unused-expressions` and `no-unused-vars` all fire on deliberate framework idioms. Scoped off for `src/app.ts`, plus `args: "none"` globally, since `{ Services, config }` is a contract not every handler uses. |
