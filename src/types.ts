import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { ParamsDictionary, Query } from "express-serve-static-core";
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

/*
 * Registries. Each is empty here and augmented by the project in grogu-env.d.ts.
 *
 * The conditional types below are what make this work: while a registry is empty
 * the derived type stays permissive, so an un-augmented project compiles and runs
 * exactly as before. The moment a project declares even one member, the derived
 * type becomes exact and typos start failing to compile.
 *
 * This is why these are not plain interfaces with an index signature — an index
 * signature answers every unknown key, so it can never reject a misspelling.
 */

/** Augment with your services: `interface ServiceRegistry { UserService: ... }` */
export interface ServiceRegistry {}
/** Augment with your middlewares: `interface MiddlewareRegistry { checkAuth: true }` */
export interface MiddlewareRegistry {}
/** Augment with your config shape: `interface ConfigRegistry { aws: { key: string } }` */
export interface ConfigRegistry {}
/** Augment with your constants: `interface ConstantsRegistry { DEFAULT_NULL: string }` */
export interface ConstantsRegistry {}

/** Exact once ServiceRegistry is augmented; permissive until then. */
export type ServicesMap = [keyof ServiceRegistry] extends [never] ? Record<string, any> : ServiceRegistry;

/** A union of your middleware filenames once MiddlewareRegistry is augmented. */
export type MiddlewareName = [keyof MiddlewareRegistry] extends [never]
	? string
	: keyof MiddlewareRegistry & string;

/** Exact once ConstantsRegistry is augmented; permissive until then. */
export type Constants = [keyof ConstantsRegistry] extends [never] ? Record<string, unknown> : ConstantsRegistry;

/** Always carries CONSTANTS and rootDir; the rest comes from ConfigRegistry. */
export type GroguConfig = {
	CONSTANTS: Constants;
	/** The project root — where .env and package.json live, not dist/. */
	rootDir: string;
} & ([keyof ConfigRegistry] extends [never] ? Record<string, any> : ConfigRegistry);

export interface Dependencies {
	Services: ServicesMap;
	config: GroguConfig;
}

export interface RouteDefinition<P = ParamsDictionary, ResBody = any, ReqBody = any, ReqQuery = Query> {
	/** Omitted when the method is embedded in the route key, e.g. "GET /test". */
	method?: MethodPrefix;
	/** Defaults to apiVersions.default when omitted. */
	version?: AllowedVersion;
	/** Defaults to true. */
	enabled?: boolean;
	/** Names of files in middlewares/; defaults to []. Checked once MiddlewareRegistry is augmented. */
	localMiddlewares?: MiddlewareName[];
	handler: RequestHandler<P, ResBody, ReqBody, ReqQuery>;
}

/** Shape of the generic argument to `route()`. Every field is optional. */
export interface RouteShape {
	params?: unknown;
	body?: unknown;
	query?: unknown;
	res?: unknown;
}

type Pick_<T extends RouteShape, K extends keyof RouteShape, Fallback> = K extends keyof T
	? T[K] extends undefined
		? Fallback
		: T[K]
	: Fallback;

/**
 * Types a single route's request and response.
 *
 * Without it `req.body`, `req.params` and `res.json()` are all `any` — express's
 * defaults. With it they are checked:
 *
 *   "POST /users": route<{ body: CreateUser; res: UserView }>({
 *     handler: async (req, res) => {
 *       req.body.email;        // string, checked
 *       res.json({ id: "1" }); // must match UserView
 *     },
 *   })
 *
 * It is an identity function; it adds no runtime behavior.
 */
export function route<T extends RouteShape = Record<string, never>>(
	def: RouteDefinition<
		Pick_<T, "params", ParamsDictionary>,
		Pick_<T, "res", any>,
		Pick_<T, "body", any>,
		Pick_<T, "query", Query>
	>
): RouteDefinition<
	Pick_<T, "params", ParamsDictionary>,
	Pick_<T, "res", any>,
	Pick_<T, "body", any>,
	Pick_<T, "query", Query>
> {
	return def;
}

export type RoutesFactory = (deps: Dependencies) => Record<RouteKey, RouteDefinition<any, any, any, any>>;

/** Surfaced in the error message when a route key is malformed. */
type InvalidRouteKey = {
	__invalidRouteKey: 'Route keys must look like "GET /path" or "/path"';
};

/**
 * Validates a routes object key by key.
 *
 * A plain `Record<RouteKey, RouteDefinition>` is not enough: RouteKey is a set of
 * template-literal patterns, which TypeScript turns into pattern index signatures.
 * Those constrain keys that MATCH a pattern and silently ignore keys that do not,
 * so a typo like "GTE /test" slips through — and any excess property inside such a
 * value goes unchecked with it. This mapped type rejects non-matching keys outright
 * and bans properties RouteDefinition does not declare.
 */
type ValidateRoutes<T> = {
	[K in keyof T]: K extends RouteKey
		? RouteDefinition<any, any, any, any> &
				Record<Exclude<keyof T[K], keyof RouteDefinition<any, any, any, any>>, never>
		: InvalidRouteKey;
};

/**
 * Wraps a controller's routes factory so its keys and definitions are checked at
 * compile time. Use this instead of `satisfies RoutesFactory`, which cannot catch
 * malformed keys — see ValidateRoutes above.
 *
 * The `T extends Record<string, RouteDefinition>` constraint is what gives `req`
 * and `res` their contextual types inside each handler.
 */
export function defineRoutes<T extends Record<string, RouteDefinition<any, any, any, any>>>(
	factory: (deps: Dependencies) => T & ValidateRoutes<T>
): (deps: Dependencies) => T {
	return factory;
}

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
