import type { RouteDefinition, RouteKey, AllowedVersion } from "../../types";
import { defineRoutes } from "../../types";

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
export const _assertions = [
	validKey,
	lowerKey,
	capKey,
	bareKey,
	typoKey,
	noSlashKey,
	validVersion,
	badVersion,
	validRoute,
	misspelled,
];

/*
 * The types above are correct in isolation, but what matters is whether they bind
 * in the position an author actually writes. `satisfies RoutesFactory` does not
 * catch a malformed key, because RouteKey becomes a pattern index signature and
 * non-matching keys are ignored. defineRoutes does. These assertions pin that.
 */

// Valid: compiles, and req/res are contextually typed with no annotations.
export const validRoutes = defineRoutes(({ Services, config }) => ({
	"GET /test": {
		handler: async (req, res) => {
			res.json({ ok: true, path: req.path });
		},
	},
	"/bare": {
		method: "post",
		version: "v2.0",
		localMiddlewares: ["requestLogger"],
		enabled: false,
		handler: async (_req, res) => {
			res.json({ ok: true });
		},
	},
}));

export const badRouteKey = defineRoutes(() => ({
	// @ts-expect-error "GTE" is not an HTTP method.
	"GTE /test": {
		handler: async (_req, res) => {
			res.json({});
		},
	},
}));

export const badRouteVersion = defineRoutes(() => ({
	"GET /test": {
		// @ts-expect-error "v9.9" is not in config/apiVersions.ts allowedVersions.
		version: "v9.9",
		handler: async (_req, res) => {
			res.json({});
		},
	},
}));

export const excessProperty = defineRoutes(() => ({
	"GET /test": {
		handler: async (_req, res) => {
			res.json({});
		},
		// @ts-expect-error the property is `localMiddlewares`, not `middlewares`.
		middlewares: ["requestLogger"],
	},
}));

export const missingHandler = defineRoutes(() => ({
	"GET /test": {
		// @ts-expect-error `handlr` is a typo, so the required `handler` is missing.
		handlr: async () => {},
	},
}));

// MiddlewareRegistry is augmented in grogu-env.d.ts, so names are checked.
export const badMiddlewareName = defineRoutes(() => ({
	"GET /test": {
		// @ts-expect-error "requestLoger" is not a file in src/middlewares/.
		localMiddlewares: ["requestLoger"],
		handler: async (_req, res) => {
			res.json({});
		},
	},
}));
