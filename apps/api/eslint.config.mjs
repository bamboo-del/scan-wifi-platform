import rootConfig from "../../eslint.config.mjs";

export default [
  ...rootConfig,
  {
    files: ["test/**/*.ts"],
    // In-memory repositories implement Promise-based production interfaces but intentionally perform no I/O.
    rules: { "@typescript-eslint/require-await": "off" },
  },
];
