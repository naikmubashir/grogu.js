/**
 * Public Controller
 * all public endpoints accessible to all will be here
 */
import { defineRoutes } from "../types";
import { logger } from "../utils";

export const routes = defineRoutes(({ Services, config }) => ({
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
}));
