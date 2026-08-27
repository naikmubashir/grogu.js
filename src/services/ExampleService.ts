import type { ServiceFactory } from "../types";

const ExampleService = (async ({ config, Services }) => ({
	iDoSomething: async (): Promise<string> => "hello world",
})) satisfies ServiceFactory;

export default ExampleService;
