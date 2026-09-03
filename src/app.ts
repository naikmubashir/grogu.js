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
	// Escape hatch (spec §11): the scanner populates these by string key at runtime.
	// The exact registry-backed types exist for consumers of `Services`, not for the
	// code building it, so the builder writes through a permissive bag view and the
	// injected value is the exact type.
	const serviceBag: Record<string, any> = {};
	const Services = serviceBag as ServicesMap;
	const Middlewares: Record<string, GroguMiddleware> = {};

	// Load config which will be a dependency injection.
	// Spread order is preserved from the original: conf can override CONSTANTS.
	const config = {
		CONSTANTS: unwrapDefault<Record<string, unknown>>(require(configDir + "/constants")),
		...unwrapDefault<Record<string, unknown>>(require(configDir + "/conf")),
		rootDir: projectRoot,
	} as unknown as GroguConfig;

	// Load all services by iterating and requiring files inside /services
	utils.dirIterator(servicesDir, function (filename, filepath) {
		const serviceName = filename.charAt(0).toUpperCase() + filename.slice(1);
		serviceBag[serviceName] = unwrapDefault(require(filepath));
	});

	// load async dependencies in services if any and inject the config dependency
	for (const serviceName in serviceBag) {
		serviceBag[serviceName] = await serviceBag[serviceName]({ config: config, Services });
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
			rawModule && typeof rawModule.routes === "function" ? rawModule : unwrapDefault<ControllerModule>(rawModule);

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
