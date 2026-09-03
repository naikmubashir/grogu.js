# Grogu.js → TypeScript Conversion — Design

**Date:** 2026-08-19
**Status:** Approved
**Scope:** Full port of the Grogu boilerplate to TypeScript with identical runtime behavior.

---

## 1. Goal

Rewrite the entire repository in TypeScript without changing what the framework does or how
people author code against it. A user of the boilerplate must still be able to drop a file into
`controllers/`, `services/`, `middlewares/` or `models/` and have it picked up automatically,
with no registration step and no manual wiring.

## 2. Non-goals

- **No move to ESM.** The loader stays CommonJS at runtime (see §5).
- **No behavior changes.** Existing quirks are preserved deliberately (see §12).
- **No refactoring beyond the port.** The convention-based loader keeps its current shape.
- **No new features.** No logging library, no validation layer, no router changes.

## 3. Current architecture

`app.js` is a convention-based loader, ~195 lines, that at boot:

1. Reads `process.argv[2]` to pick an env file, `require`s `dotenv` against `.env.<ENV>`.
2. Derives `rootDir` from `require.main.filename`.
3. Loads `config/apiVersions.js`, falling back to a `v1.0` default if absent.
4. Scans `services/` — each file exports an async factory called with `{ config, Services }`;
   the resolved value replaces the factory in the `Services` map. Keys are PascalCased filenames.
5. Scans `middlewares/` — each file exports a function `(req, res, next, deps)`. Keys are raw filenames.
6. Applies `config/http.js` (an array of server-level middlewares) via `app.use`, if the file exists.
7. Scans `controllers/` — each file exports `routes(deps)` returning a map of route keys to
   definitions, plus an optional `globalMiddlewares` string array. Route keys are either
   `"/path"` (with a `method` property) or `"GET /path"` (method embedded in the key); defining
   both is a fatal error. Each route is mounted at `/<Controller>/<version><path>`.

`utils.js` provides `dirIterator`, `getValidHttpMethod`, `fatalError`, `injectDependencyArgument`
and an ANSI-colored `logger`.

`initTest.js` forks the app, waits for a `"ready"` IPC message, then runs Mocha over `tests/`.

## 4. Target repository layout

Compiling to `dist/` requires source to live under `src/`. The scanner then walks `dist/*` at
runtime exactly as it walks the repo root today.

```
src/
  app.ts
  utils.ts
  types.ts                  # public authoring contracts
  grogu-env.d.ts            # optional project type augmentation (see 8.1)
  initTest.ts
  config/
    conf.ts
    constants.ts
    apiVersions.ts
    http.ts
  controllers/
    Public.ts
  middlewares/.gitkeep
  services/.gitkeep
  models/.gitkeep
  tests/.gitkeep
dist/                       # build output, gitignored
tsconfig.json
package.json
.prettierrc                 # unchanged
eslint.config.js            # replaces the eslint 7 + babel-eslint setup
```

`docs/` and `README.md` stay at the repo root.

## 5. Module system

**Author in ES module syntax, emit CommonJS.**

- Source files use `import` / `export const` / `export default`.
- `tsconfig.json` sets `"module": "commonjs"`, so tsc emits `require()` / `exports.*`.
- The loader continues to call `require(filepath)` with computed paths — the mechanism the
  whole convention depends on.

`export =` is explicitly rejected. It cannot coexist with named exports, forces consumers into
`import x = require(...)`, is not standard JavaScript, and is the one syntax that could not be
flipped to ESM later without rewriting every user-authored file.

Type-only imports (`import type { ... } from "../types"`) are erased at compile time and emit no
`require()`, so authors get full type checking with zero runtime coupling to the framework. They
are optional: a file with no imports at all still loads correctly.

**Future ESM migration** (out of scope) would require: `await import()` in place of `require()`,
`import.meta.url` + `fileURLToPath` in place of `__dirname` / `require.main.filename`, and an
`await` at every scanned module load. Authoring in ESM syntax now means that migration touches
the loader and tsconfig only, not application code.

## 6. Build and run

| Script | Command |
|---|---|
| `build` | `tsc` |
| `dev` | `npm run build && node dist/app.js dev` |
| `start` | `npm run build && node dist/app.js` |
| `test` | `npm run build && node dist/initTest.js` |
| `watch` | `tsc --watch` |

`tsconfig.json`:

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

Sourcemaps are safe for the scanner: `Public.js.map` splits on `.` to an extension of `map`,
which fails the `=== "js"` filter and is skipped.

`dist/` is added to `.gitignore`.

## 7. Root directory semantics

`app.js:7` computes one directory that necessarily becomes two once the code compiles:

```js
const rootDir = require("path").dirname(require.main.filename);
```

| Name | Value | Used for |
|---|---|---|
| `appDir` | `__dirname` (i.e. `dist/`) | scanning `controllers/`, `services/`, `middlewares/`, `config/` |
| `projectRoot` | `path.resolve(__dirname, "..")` | locating `.env`, `.env.dev`, `package.json` |

**`config.rootDir`, injected into every service, middleware and controller, resolves to
`projectRoot`.** This preserves author intent: `rootDir` was the directory holding `.env`,
`package.json` and user assets, and is what application code resolves upload paths and key
files against. This is the single deliberate semantic decision in the port; everything else is
mechanical.

## 8. Public type contracts (`src/types.ts`)

```ts
import type { Request, Response, NextFunction, RequestHandler } from "express";
import type apiVersionConfig from "./config/apiVersions";

export type HttpMethod =
  | "all" | "get" | "post" | "put" | "delete"
  | "trace" | "options" | "connect" | "patch" | "head";

/**
 * Accepted casings for a method prefix. Mirrors the case-insensitive regex in
 * getValidHttpMethod, so "GET", "get" and "Get" all remain valid.
 */
export type MethodPrefix =
  | Uppercase<HttpMethod>
  | Lowercase<HttpMethod>
  | Capitalize<HttpMethod>;

/** Either "GET /test" (method in the key) or "/test" (method in the definition). */
export type RouteKey = `${MethodPrefix} /${string}` | `/${string}`;

/** Derived from config/apiVersions.ts, which is declared `as const`. */
export type AllowedVersion = (typeof apiVersionConfig)["allowedVersions"][number];

/** Augmentable by the consuming project via declaration merging (see §8.1). */
export interface ServicesMap { [serviceName: string]: any; }

/** Augmentable by the consuming project via declaration merging (see §8.1). */
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
  /** Defaults to apiVersions.default when omitted. Checked against allowedVersions. */
  version?: AllowedVersion;
  /** Defaults to true. */
  enabled?: boolean;
  /** Names of files in middlewares/; defaults to []. */
  localMiddlewares?: string[];
  handler: RequestHandler;
}

export type RoutesFactory = (deps: Dependencies) => Record<RouteKey, RouteDefinition>;

/**
 * Controllers use this helper rather than `satisfies RoutesFactory`.
 * RouteKey compiles to pattern index signatures, which ignore keys that match no
 * pattern — so `satisfies` alone lets "GTE /test" through, and skips checking that
 * value's contents entirely. This validates each key and bans excess properties.
 */
export function defineRoutes<T extends Record<string, RouteDefinition>>(
  factory: (deps: Dependencies) => T & ValidateRoutes<T>
): (deps: Dependencies) => T;

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

`ServicesMap` and `GroguConfig` carry index signatures so untyped projects work out of the box,
while a project that wants real types can declaration-merge onto them.

Three of these types exist to close gaps where a mistake would otherwise survive compilation and
fail silently or at boot:

| Type | Catches at compile time | Previously failed |
|---|---|---|
| `RouteKey` | `"GTE /test"`, `"GET test"` | silently mounted nothing |
| `AllowedVersion` | `version: "v9.9"` | `fatalError` at boot |
| `RouteDefinition` | `handlr:`, `middlewares:` | silently mounted nothing |

**All of these require `defineRoutes`.** `satisfies RoutesFactory` does not deliver them: TypeScript
turns `RouteKey` into pattern index signatures, which constrain keys that match a pattern and
silently ignore keys that do not. A malformed key therefore escapes, taking the checks on its whole
value with it. This was found during implementation — the types were correct in isolation but did
not bind in the position an author actually writes.

`config/apiVersions.ts` is therefore declared `as const` so its literal values survive into the
type system:

```ts
export default {
  default: "v1.0",
  allowedVersions: ["v1.0", "v2.0"],
} as const;
```

**Consequence:** `config/apiVersions.ts` becomes required at compile time, where it was optional
at runtime. The loader keeps its `existsSync` fallback for robustness, but `src/types.ts` imports
the file for the `AllowedVersion` union, so deleting it is now a compile error. The file ships
with the boilerplate, so this affects nobody who has not deliberately removed it.

## 8.1 Project-level type augmentation

`Services.UserService.iDoSomething()` cannot be typed by the framework, because the runtime
scanner means nothing statically references the service files. A project closes this itself with
one declaration-merging file, `src/grogu-env.d.ts`:

```ts
export {}; // makes this file a module, which augmentation requires

declare module "./types" {
  interface ServicesMap {
    UserService: Awaited<ReturnType<typeof import("./services/UserService").default>>;
  }
  interface GroguConfig {
    aws: { key: string; secret: string };
  }
}
```

The relative specifier `"./types"` resolves from the containing file, so no `paths` alias and no
tsconfig change is needed. `import type` is erased at compile time, so this adds no runtime
coupling and does not disturb the scanner.

This is **opt-in and hand-maintained**. A project that skips it still compiles and runs; it just
keeps the `any` fallback from the index signatures. Keeping it in sync with the contents of
`services/` is manual — the codegen approach in §19 is what automates it.

### What augmentation does and does not catch

The index signature and typo detection are mutually exclusive, and the index signature wins:

| Expression | Caught? |
|---|---|
| `Services.ExampleService.iDoSomething()` | resolves to `Promise<string>`, not `any` |
| `Services.ExampleService.iDoSomthing()` | **yes** — the service's own type is concrete |
| `Services.ExampleServce` | **no** — the index signature answers every unknown key |
| `config.aws.region` | resolves to `string` |

A misspelled *service name* cannot be caught while `ServicesMap` keeps `[serviceName: string]: any`.
Removing the fallback would catch it, but would also make every service access an error until the
project writes its augmentation — which breaks "works out of the box untyped". The fallback is the
deliberate trade; method-level typos on a known service are still caught, which is where most
mistakes actually happen.

Codegen (§19) does not change this. It automates writing the augmentation, not the index signature
trade-off.

## 9. Authoring conventions

| Kind | Export style | Rationale |
|---|---|---|
| Controller | named: `export const routes`, `export const globalMiddlewares` | two exports; a default object would only re-nest them |
| Service | `export default` | single factory |
| Middleware | `export default` | single function |
| `config/http.ts` | `export default [...]` | single array |
| `config/conf.ts`, `config/constants.ts` | `export default {}` | single object |
| `models/*.ts` | `export default {}` | informative data only |

Example controller:

```ts
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

Example service:

```ts
import type { ServiceFactory } from "../types";

const UserService = (async ({ config, Services }) => ({
  iDoSomething: async () => "hello world",
})) satisfies ServiceFactory;

export default UserService;
```

### Annotate with `satisfies`, never with `:`

`const UserService: ServiceFactory = ...` is **wrong** and must not appear in the codebase or the
docs. A type annotation makes the declared type win, so `ServiceFactory<T = any>` erases the
inferred return shape and `Awaited<ReturnType<typeof UserService>>` collapses to `any` — which
silently defeats the augmentation in §8.1 before it starts.

`satisfies` checks the value against the contract **without widening it**, so the precise object
shape survives for `ReturnType` to recover. The same rule applies to `routes` and to middlewares.

## 10. Loader interop normalization

tsc compiles `export default fn` to `exports.default = fn` plus `exports.__esModule = true`, so
the loader must unwrap it. Precedence is defined explicitly so nothing is ambiguous:

- **Controllers:** use named `routes` / `globalMiddlewares` when present; otherwise fall back to
  `mod.default.routes` / `mod.default.globalMiddlewares`. Named exports win.
- **Services, middlewares, `config/conf`, `config/constants`, `config/apiVersions`,
  `config/http`:** `mod.default ?? mod`.

This is strictly **additive**. Every existing `module.exports = fn` file — including any a user
already wrote against the JS version — continues to work untouched, because `?? mod` falls
through to it.

A single helper implements the unwrap so the rule lives in exactly one place.

## 11. Strictness and escape hatches

`"strict": true` across the codebase. Three genuinely dynamic seams get a localized, commented
`any` / `unknown` cast — nothing wider:

1. **`require()` of a scanned module** — the shape is validated by the loader at runtime, not by
   tsc, since the path is computed.
2. **`injectDependencyArgument`** — shuffles `arguments` via `apply`/`bind` to append the
   dependency object as a trailing parameter. Typed as generically as practical, with a cast at
   the `apply` boundary.
3. **`expressRouter[methodName](...)`** — dynamic dispatch on an express Router by a
   `HttpMethod`-typed key. TypeScript resolves this to a union of call signatures that cannot be
   invoked with spread arguments, so it needs a narrow cast to a callable record type.

**`fatalError` is typed `(msg: string) => never`.** This is load-bearing: it lets TypeScript
understand that the guard at `app.js:110-117` genuinely proves `methodName` is non-null before
`methodName.toUpperCase()` runs at line 114, avoiding a misleading non-null assertion.

Consequent type-driven cleanups that do not change behavior:

- `getValidHttpMethod` returns `HttpMethod | null`; every call site is checked.
- `subRouteConfig.localMiddlewares = subRouteConfig.localMiddlewares || []` mutates an optional
  property; replaced by a local `const localMiddlewares = subRouteConfig.localMiddlewares ?? []`.

## 12. Required fix: missing directories after compile

`tsc` does not copy non-`.ts` files, so `.gitkeep`-only directories produce **no** corresponding
directory in `dist/`. `services/`, `middlewares/`, `models/` and `tests/` are all in this state
in a fresh clone.

`dirIterator` currently calls `fs.readdirSync(dir)` with no guard, which throws `ENOENT` on a
missing directory. Without a fix, a freshly cloned and built repo crashes on boot.

**Fix:** `dirIterator` returns immediately when the directory does not exist, iterating zero
files — behaviorally identical to today's empty-but-present directory. `initTest.ts` applies the
same guard before reading the compiled tests directory.

## 13. Preserved quirks

These are existing behavior and port as-is:

- `dirIterator` names a module by its **first** dot-segment, so `My.Controller.js` registers as
  `My`.
- A route key with no `/` yields `indexOf("/") === -1`, and `substring(-1)` returns the whole
  string.
- `config/http.ts`'s CORS `origin` callback allows every origin through its `else` branch while
  logging a rejection message.
- Route keys are matched case-insensitively for the method prefix via the existing regex.

One **deliberate narrowing**: `MethodPrefix` admits `GET`, `get` and `Get`, but not arbitrary
casing such as `gEt`, which the runtime regex would still accept. This trades an unreachable
edge case for catching real typos in route keys.

## 14. Tests

`src/tests/` compiles to `dist/tests/`. `initTest.ts` forks `./dist/app`, waits for the `"ready"`
IPC message, and runs Mocha over `dist/tests/*.js`. `npm test` builds first.

Mocha runs the **compiled** test files; no ts-node registration is required. Types come from
`@types/mocha`, `@types/chai` and `@types/chai-http`.

## 15. Tooling changes

**Dependencies added:** `typescript`, `@types/node`, `@types/express`, `@types/cors`,
`@types/compression`, `@types/body-parser`, `@types/mocha`, `@types/chai`, `@types/chai-http`.

**Removed:** `babel-eslint` (obsolete — it existed only to parse modern syntax for eslint).

**Linting:** `eslint@7` + `babel-eslint` → `typescript-eslint` with a flat `eslint.config.js`.

**Unchanged:** `.prettierrc` (tabs, width 4, printWidth 120), `.sample.env`, `.env.dev`,
runtime dependencies (`express`, `cors`, `compression`, `body-parser`, `dotenv`).

## 16. Documentation

`docs/index.md` and `README.md` have every example rewritten in TypeScript, covering controllers,
services, middlewares, models, `config/conf`, `config/constants` and `config/http`. For a
boilerplate the documentation is the product, so this is in scope, not follow-up work.

README additionally documents the new build step and the `src/` → `dist/` layout.

## 17. Acceptance criteria

1. `npm run build` completes with zero TypeScript errors under `strict: true`.
2. `npm run dev` boots against `.env.dev` and logs the mounted route table.
3. `GET /Public/v1.0/test` returns `{ "ok": true, "message": "hello world" }`.
4. `npm test` builds, forks the app, and Mocha runs to completion.
5. A freshly cloned repo with empty `services/`, `middlewares/` and `models/` boots without error.
6. Adding a new `.ts` file to `src/controllers/` and rebuilding mounts its routes with no
   registration step anywhere.
7. A legacy `module.exports = fn` service file, compiled or dropped in as `.js`, still loads.
8. No `export =` anywhere in the codebase.
9. No `: ServiceFactory` / `: RoutesFactory` annotations; contracts are applied with `satisfies`.
10. Via `defineRoutes`: `"GTE /test"`, `"GET test"`, `version: "v9.9"`, `handlr:` and `middlewares:`
    each fail `tsc` rather than failing at boot or silently mounting nothing.
11. Adding `src/grogu-env.d.ts` per §8.1 makes `Services.ExampleService.iDoSomething()` resolve to
    `Promise<string>` and makes a misspelled *method* on it a compile error. A misspelled *service
    name* is not caught — see the table in §8.1. Removing the file still compiles and runs.

## 18. Risks

| Risk | Mitigation |
|---|---|
| `rootDir` split silently breaks user file-path code | Documented in §7 and in README; `config.rootDir` deliberately keeps its old meaning |
| Missing `dist/` directories crash boot | Explicit `existsSync` guard, plus acceptance criterion 5 |
| Default-export unwrapping misses an edge case | Single shared helper with defined precedence; acceptance criterion 7 covers legacy shape |
| Strict mode tempts broad `any` usage | Escape hatches enumerated in §11; anything beyond those three needs justification |

## 19. Deferred: generated type registry

§8.1 closes the `Services` / `config` typing gap but is hand-maintained and can drift from the
actual contents of `services/`. The alternative is a codegen step that walks the source
directories at build time and emits `grogu-env.d.ts` automatically, along with a union of
middleware names so `localMiddlewares: ["chekAuth"]` becomes a compile error too.

It is purely additive type metadata — no runtime behavior changes, and the drop-a-file
convention is untouched, since the generator does the bookkeeping instead of the author.

**Status: open, not part of this plan.** Cost is one more build step and one more piece of
tooling to maintain. The types in §8 are designed so this can be layered on later without
reworking them: the generator would emit exactly the augmentation shown in §8.1.
