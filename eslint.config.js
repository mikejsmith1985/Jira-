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
      "no-magic-numbers": [
        "warn",
        { ignore: [0, 1, -1], ignoreArrayIndexes: true, enforceConst: true },
      ],
      "max-lines-per-function": ["warn", { max: 40, skipComments: true, skipBlankLines: true }],
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
      sourceType: "commonjs",
      globals: { require: "readonly", module: "writable", process: "readonly", __dirname: "readonly", console: "readonly" },
    },
    rules: { "no-magic-numbers": "off" },
  },
);
