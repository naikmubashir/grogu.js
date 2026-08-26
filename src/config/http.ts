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
