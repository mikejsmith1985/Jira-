// eslint.config.js — Article IV enforced by the linter rather than by review.
//
// Two custom rules carry real weight here. Single-letter identifiers are banned
// except for loop counters, and booleans must announce themselves with is/has/
// can/should/was — because a reader who cannot tell a boolean from a value has
// to go and look, which is the cost this project exists to remove.

import js from "@eslint/js";
import typescriptEslint from "typescript-eslint";

/** Identifiers a single letter long that remain acceptable, per Article IV. */
const ALLOWED_SINGLE_LETTER_NAMES = ["i", "j", "k", "_"];

/** Prefixes a boolean variable, property or function must start with. */
const BOOLEAN_NAME_PATTERN = "^(is|has|can|should|was|does|will)[A-Z]";

export default typescriptEslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/*.min.js",
      ".specify/**",
      "specs/**",
    ],
  },
  js.configs.recommended,
  ...typescriptEslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    // The boolean-naming rule needs to know which identifiers ARE booleans, so
    // it needs type information. Without this the rule cannot run at all, and a
    // rule that silently does not run is worse than no rule.
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "id-length": [
        "error",
        { min: 2, exceptions: ALLOWED_SINGLE_LETTER_NAMES, properties: "never" },
      ],
      "@typescript-eslint/naming-convention": [
        "error",
        {
          selector: ["variable", "parameter"],
          types: ["boolean"],
          format: ["camelCase"],
          custom: { regex: BOOLEAN_NAME_PATTERN, match: true },
        },
        {
          selector: "typeProperty",
          types: ["boolean"],
          format: ["camelCase"],
          custom: { regex: BOOLEAN_NAME_PATTERN, match: true },
        },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      // A leading underscore marks a parameter kept deliberately: it documents
      // the shape a function receives even where this implementation ignores it.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-magic-numbers": [
        "warn",
        { ignore: [0, 1, -1], ignoreArrayIndexes: true, enforceConst: true },
      ],
      "max-lines-per-function": ["warn", { max: 40, skipComments: true, skipBlankLines: true }],
    },
  },
  {
    // Article IV's forty-line rule exists to stop LOGIC growing past the point a
    // reader can hold it. A React component's length is mostly markup, which is
    // declarative and reads top-to-bottom, so counting it the same way turns the
    // rule into noise — and a rule that always fires stops being read.
    //
    // So components get a larger allowance, and the rule keeps its meaning
    // everywhere else. Where a component genuinely does too much, the fix is to
    // extract a component with its own name and purpose, not to compress the
    // markup: HygieneView's fix panel and drill-through were extracted for
    // exactly that reason.
    files: ["**/*.tsx"],
    rules: {
      "max-lines-per-function": ["warn", { max: 120, skipComments: true, skipBlankLines: true }],
    },
  },
  {
    files: ["**/test/**/*.ts", "**/test/**/*.tsx"],
    rules: {
      "no-magic-numbers": "off",
      "max-lines-per-function": "off",
      "id-length": "off",
    },
  },
  {
    files: ["packages/server/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        URL: "readonly",
        URLSearchParams: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
      },
    },
    rules: { "no-magic-numbers": "off" },
  },
);
