import eslint from "@eslint/js";

export default [
  eslint.configs.recommended,
  {
    files: ["scripts/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        process: "readonly",
        URL: "readonly",
      },
    },
  },
];
