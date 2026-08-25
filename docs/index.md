# Framework Documentation

<!-- This contains documentation for the express based custom framework that has been written. -->

# Concepts and Usage

---

## Project layout

Source lives in `src/` and compiles to `dist/`. The loader scans the **compiled** directories at
runtime, so a new controller only takes effect after a build. `npm run dev` and `npm start` build
first; `npm run watch` rebuilds on change.

```
src/
  app.ts            # the loader — you rarely touch this
  types.ts          # authoring contracts you import types from
  grogu-env.d.ts    # optional: types for your Services and config
  config/           # conf, constants, apiVersions, http
  controllers/      # dropped in, auto-mounted
  services/         # dropped in, auto-injected
  middlewares/      # dropped in, referenced by name
  models/           # informative schema files
  tests/            # integration tests; tests/unit/ for unit tests
```

You never register anything. Dropping a file into `controllers/`, `services/` or `middlewares/` is
all that is required — the only import you write is a **type-only** import, which is erased at
compile time and adds no runtime coupling.

---

## Applying contracts

Controllers use the `defineRoutes` helper. Services and middlewares use `satisfies`.

Controllers need the helper because route keys are template-literal patterns, and a plain
`satisfies` cannot reject a key that matches no pattern — `"GTE /test"` would compile and then
silently mount nothing. `defineRoutes` checks each key and each definition.

For services and middlewares, `satisfies` is enough — but it must be `satisfies`, never a `:`
annotation:

```ts
// WRONG — the declared type wins and the inferred return shape is erased,
// which collapses ReturnType to `any` and breaks the typing in "Typing Services and config".
const UserService: ServiceFactory = async () => ({ iDoSomething: async () => "hi" });

// RIGHT — checks the value against the contract without widening it.
const UserService = (async () => ({ iDoSomething: async () => "hi" })) satisfies ServiceFactory;
```

---

## Controllers

The quickest way to get started writing a controller is to create a `.ts` file inside
`src/controllers`. A controller file is a PascalCased file which exports `routes` and, optionally,
`globalMiddlewares`. For example, a `User` controller at `src/controllers/User.ts`:

```ts
import { defineRoutes } from "../types";

// if globalMiddlewares is not exported the default is an empty array, i.e. no middlewares
export const globalMiddlewares = ["middlewareA"];

export const routes = defineRoutes(({ Services, config }) => ({
	"/hello": {
		method: "get", // http method definition
		// version: "v2.0", // api version; defaults to apiVersions.default if omitted
		handler: async (req, res) => {
			// request handler
			res.json({ message: await Services.UserService.iDoSomething() });
		},
		enabled: true, // optional, defaults to true
		localMiddlewares: ["middlewareB"], // route specific middlewares; defaults to none
	},

	/*
	 * alternatively you can define the route and method in the string key itself as shown below.
	 * in this case the "method" property is to be skipped.
	 * if both exist it will throw an error.
	 */
	"POST /hello": {
		version: "v2.0",
		handler: async (req, res) => {
			res.json({ message: await Services.UserService.iDoSomething() });
		},
		enabled: true,
		localMiddlewares: ["middlewareB"],
	},
}));
```

`defineRoutes` is an identity function — it returns the factory unchanged and adds no runtime
behavior. It exists so TypeScript can check your route keys and definitions. It is **not**
registration: the loader still finds the file by scanning the directory.

`globalMiddlewares` is a list of middleware names defined in `src/middlewares` to be applied to all
routes in `User.ts` — see [Middlewares](#middlewares). <br>
`routes` is a function returning a key/value map of routes to their definitions. It receives
[Services](#services) and [config](#config) as dependency arguments.

The example above creates `GET localhost:<PORT>/User/v1.0/hello` and
`POST localhost:<PORT>/User/v2.0/hello`.

### What the types catch

Route keys and versions are checked at compile time rather than at boot:

| Mistake | Result |
|---|---|
| `"GTE /test"` | compile error — previously mounted nothing, silently |
| `"GET test"` (no leading slash) | compile error |
| `version: "v9.9"` | compile error — must be in `config/apiVersions.ts` |
| `handlr:` instead of `handler:` | compile error — previously ignored |
| `middlewares:` instead of `localMiddlewares:` | compile error — previously ignored |

All five require `defineRoutes`. With `satisfies RoutesFactory` the last four are missed whenever
the route key itself is malformed.

Method prefixes are accepted as `GET`, `get` or `Get`.

---

## Services

Services divide the core logic of the app. Create a `.ts` file inside `src/services` exporting a
default factory that returns an object of related functions. For example
`src/services/UserService.ts`:

```ts
import type { ServiceFactory } from "../types";

const UserService = (async ({ config, Services }) => ({
	iDoSomething: async (): Promise<string> => "hello world",
})) satisfies ServiceFactory;

export default UserService;
```

Like controller routes, the factory receives [config](#config) and [Services](#services), which
enables cross-usage between service files.

These functions are then called as `Services.UserService.iDoSomething()` inside
[Controllers](#controllers) and [Middlewares](#middlewares).

---

## Middlewares

Middlewares are express middlewares applied to route definitions, defined as `.ts` files in
`src/middlewares`. A middleware named `checkSomething` is created at
`src/middlewares/checkSomething.ts`:

```ts
import type { GroguMiddleware } from "../types";

const checkSomething = ((req, res, next, { Services, config }) => {
	next();
}) satisfies GroguMiddleware;

export default checkSomething;
```

The middleware signature has [config](#config) and [Services](#services) injected as a fourth
argument. Middlewares are referenced by **filename** from a controller's `localMiddlewares` or
`globalMiddlewares`.

---

## config

Config variables and constants are available directly inside [Services](#services),
[Middlewares](#middlewares) and [Controllers](#controllers). The root config file is
`src/config/conf.ts`:

```ts
export default {
	aws: {
		key: process.env.AWS_KEY,
		secret: process.env.AWS_SECRET,
		ses: {
			from: {
				default: "noreply@abc.in",
			},
			region: "us-west-2",
		},
	},
};
```

and constants are defined in `src/config/constants.ts`:

```ts
export default {
	DEFAULT_NULL_VALUE: "_NULL_",
};
```

These are coupled together and used as `config.aws.key` and
`config.CONSTANTS.DEFAULT_NULL_VALUE` wherever the config dependency is available.

`config.rootDir` is also injected. It resolves to the **project root** — the directory holding
`.env` and `package.json` — not to `dist/`. Resolve upload paths and key files against it.

---

## Typing request and response bodies

By default express types `req.body`, `req.params` and `res.json()` as `any` — the framework cannot
know what a given route accepts or returns. The `route` helper declares it per route:

```ts
import { defineRoutes, route } from "../types";

interface CreateUser {
	email: string;
	age: number;
}
interface UserView {
	id: string;
	email: string;
}

export const routes = defineRoutes(({ Services, config }) => ({
	"POST /users/:org": route<{ body: CreateUser; res: UserView; params: { org: string } }>({
		handler: async (req, res) => {
			req.body.email; // string
			req.body.age; // number
			req.params.org; // string
			res.json({ id: "1", email: req.body.email }); // checked against UserView
		},
	}),
}));
```

All four keys are optional — pass only what you need, e.g. `route<{ res: UserView }>({ ... })`.
A route with no generic behaves exactly as before, and `route()` can be omitted entirely.

Once declared, each of these is a compile error:

| Mistake | Caught |
|---|---|
| `req.body.emial` | yes |
| `const n: number = req.body.email` | yes |
| `res.json({ id: "1" })` — missing `email` | yes |
| `res.json({ ..., extra: true })` — unknown field | yes |
| `req.params.orgg` | yes |

`route` is an identity function and adds no runtime behavior.

---

## Typing Services, config and middleware names

`Services`, `config` and middleware names cannot be typed by the framework, because the loader
discovers files at runtime and nothing statically references them. A project declares them in one
file, `src/grogu-env.d.ts`:

```ts
export {}; // makes this file a module, which declaration merging requires

declare module "./types" {
	interface ServiceRegistry {
		UserService: Awaited<ReturnType<typeof import("./services/UserService").default>>;
	}

	interface ConfigRegistry {
		aws: { key: string; secret: string };
	}

	interface ConstantsRegistry {
		DEFAULT_NULL_VALUE: string;
	}

	// Every key is a filename in src/middlewares/. The value is unused.
	interface MiddlewareRegistry {
		checkAuth: true;
	}
}
```

Each registry starts empty. **While a registry is empty the matching type stays permissive**, so a
project that never writes this file compiles and runs exactly as before. The moment you declare one
member, that type becomes exact:

| Expression | Registry empty | Registry augmented |
|---|---|---|
| `Services.UserService.iDoSomething()` | `any` | `Promise<string>` |
| `Services.UserServce` | allowed | **compile error** |
| `Services.UserService.iDoSomthing()` | allowed | **compile error** |
| `config.aws.key` | `any` | `string` |
| `config.CONSTANTS.DEFAULT_NULL_VALUE` | `unknown` | `string` |
| `localMiddlewares: ["chekAuth"]` | allowed | **compile error** |

`config.rootDir` and `config.CONSTANTS` are always present regardless.

This is why services must use `satisfies` rather than a `:` annotation — an annotation erases the
inferred return type, so `ReturnType` in `ServiceRegistry` would collapse to `any`.

---

## Models

A collection of TypeScript files describing the schema of tables and indexes. These live in
`src/models/` and are informative only. For a table `users` in a database `example`, create
`src/models/example.ts`:

```ts
export default {
	collections: ["users"],
	schema: {
		users: { username: "string", password: "string" },
	},
	indexes: {
		users: [
			[{ username: 1, _id: 1 }, { unique: true }],
			[{ username: 1 }, { unique: true }],
		],
	},
};
```

Alternatively this configuration can be used to initialize indexes or tables.

---

## API versions

Allowed versions are declared in `src/config/apiVersions.ts`:

```ts
export default {
	default: "v1.0",
	allowedVersions: ["v1.0", "v2.0"],
} as const;
```

The `as const` is required — it is what lets the `version` property on a route be checked at compile
time. Adding a version here is what makes it usable in a controller.

---

## HTTP server middlewares

These are http server level middlewares, defined in `src/config/http.ts`:

```ts
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

Mainly `body-parser`, `cors` and other such http server level middlewares are defined here.

> Note: the `else` branch above allows every origin through while logging a rejection message. That
> is the shipped default, carried over from the original. Tighten it before going to production.
