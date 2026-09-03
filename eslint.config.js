const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
	{ ignores: ["dist/**", "node_modules/**"] },
	...tseslint.configs.recommended,
	{
		languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
		rules: {
			// The loader's three documented escape hatches need `any` (spec §11).
			"@typescript-eslint/no-explicit-any": "off",
			// Handlers, service factories and middlewares receive { Services, config }
			// as part of the public contract. Not using them is normal, not a defect.
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
		},
	},
	{
		// The registry interfaces in types.ts are deliberately empty — a project
		// fills them in via declaration merging, and emptiness is what keeps the
		// derived types permissive until it does.
		files: ["src/types.ts"],
		rules: { "@typescript-eslint/no-empty-object-type": "off" },
	},
	{
		// app.ts is the runtime loader. require() with a computed path is the
		// mechanism the whole convention rests on, and the `cond && arr.forEach()`
		// idiom is carried over verbatim from the JavaScript original.
		files: ["src/app.ts"],
		rules: {
			"@typescript-eslint/no-require-imports": "off",
			"@typescript-eslint/no-unused-expressions": "off",
		},
	}
);
