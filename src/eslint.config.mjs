// ESLint flat config mínimo compatible con TS strict (@typescript-eslint)
import plugin from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**/*", ".lock/**/*", ".git/**/*", "node_modules/**/*"],
  },
  {
    files: ["**/*.{ts,js,mjs,cjs}"],
    plugins: { "@typescript-eslint": plugin },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parser,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": 0,
      "@typescript-eslint/no-extraneous-class": 0,
    },
  },
];
