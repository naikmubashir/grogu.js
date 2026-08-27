export {}; // makes this file a module, which declaration merging requires

/*
 * Project-level types. Augment the registries in ../types and everything that
 * consumes them — Services, config, localMiddlewares — becomes exact.
 * Delete this file and the framework still compiles and runs; you just lose the
 * checking and fall back to the permissive defaults.
 */
declare module "./types" {
	interface ServiceRegistry {
		ExampleService: Awaited<ReturnType<typeof import("./services/ExampleService").default>>;
	}

	interface ConfigRegistry {
		aws: { region: string };
	}

	interface ConstantsRegistry {
		DEFAULT_NULL_VALUE: string;
	}

	// Every key is a filename in src/middlewares/. The value is unused.
	interface MiddlewareRegistry {
		requestLogger: true;
	}
}
