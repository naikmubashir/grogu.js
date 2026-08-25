# Grogu.js (light weight express boilerplate)

A convention-over-configuration Express boilerplate, written in TypeScript. Drop a file into
`src/controllers/`, `src/services/` or `src/middlewares/` and it is wired up automatically — there
is no registry to update.

## Requirements

Node.js >= 18 (the build targets ES2022).

## Usage Documentation

Click [here](./docs/index.md) for usage documentation.

## Project layout

Source lives in `src/` and compiles to `dist/`. The entry point is `src/app.ts`, which builds to
`dist/app.js`.

The loader scans the **compiled** output, so a new controller takes effect only after a build.
`npm run dev` and `npm start` build first; use `npm run watch` while developing.

`.env` and `.env.dev` are read from the **project root**, not from `dist/`. The same applies to
`config.rootDir`, which is injected into every controller, service and middleware.

## Scripts

| Script | What it does |
|---|---|
| `npm run build` | Compiles `src/` to `dist/` (clears `dist/` first) |
| `npm run watch` | Rebuilds on change |
| `npm run dev` | Builds, then runs against `.env.dev` |
| `npm start` | Builds, then runs against `.env` |
| `npm test` | Builds, boots the server, runs integration tests |
| `npm run test:unit` | Builds, runs unit tests only — no server |
| `npm run lint` | Lints `src/` |

## How to run the app

### For Running in Dev

```sh
npm run dev # This will run the project in development environment
```

For running the above command a `.env.dev` file should exist in the project root.

### For Running in Prod

```sh
npm start # This will run the project in prod environment
```

For running the above command a `.env` file should exist in the project root.

## Testing

`npm run test:unit` runs the fast unit tests in `src/tests/unit/` with no server involved.

`npm test` builds, forks the server, waits for it to report ready, then runs the integration tests
in `src/tests/` against it.

Type-level assertions live in `src/tests/typecheck/`. They are never executed — they are enforced by
`npm run build`, using `@ts-expect-error` as the assertion.
