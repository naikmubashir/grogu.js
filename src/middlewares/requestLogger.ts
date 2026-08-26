/**
 * requestLogger
 * Example middleware. Reference it by filename from a controller's
 * `localMiddlewares` or `globalMiddlewares`. It is not attached to any route
 * by default.
 */
import type { GroguMiddleware } from "../types";
import { logger } from "../utils";

const requestLogger = ((req, res, next, { Services, config }) => {
	logger.debug(`${req.method} ${req.originalUrl}`);
	next();
}) satisfies GroguMiddleware;

export default requestLogger;
