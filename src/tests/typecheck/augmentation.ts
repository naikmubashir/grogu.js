import type { ServicesMap, GroguConfig, MiddlewareName } from "../../types";

declare const Services: ServicesMap;
declare const config: GroguConfig;

// Resolves to Promise<string>, not any, once ServiceRegistry is augmented.
const result: Promise<string> = Services.ExampleService.iDoSomething();

// @ts-expect-error a misspelled service NAME does not compile.
const nameTypo = Services.ExampleServce;

// @ts-expect-error a misspelled METHOD on a known service does not compile.
const methodTypo = Services.ExampleService.iDoSomthing();

// Config comes from ConfigRegistry.
const region: string = config.aws.region;
// @ts-expect-error a misspelled config key does not compile.
const configTypo = config.aws.regoin;

// Constants come from ConstantsRegistry.
const nullValue: string = config.CONSTANTS.DEFAULT_NULL_VALUE;
// @ts-expect-error a misspelled constant does not compile.
const constantTypo = config.CONSTANTS.DEFAULT_NUL_VALUE;

// rootDir is always present regardless of augmentation.
const root: string = config.rootDir;

// MiddlewareRegistry is augmented, so names are a union of the files in middlewares/.
const knownMiddleware: MiddlewareName[] = ["requestLogger"];
// @ts-expect-error a middleware that does not exist does not compile.
const unknownMiddleware: MiddlewareName[] = ["notYetDeclared"];

export const _assertions = [
	result,
	nameTypo,
	methodTypo,
	region,
	configTypo,
	nullValue,
	constantTypo,
	root,
	knownMiddleware,
	unknownMiddleware,
];
