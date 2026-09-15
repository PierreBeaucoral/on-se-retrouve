import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist/**", "public/**", "node_modules/**", ".next/**", ".vinext/**", ".wrangler/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules, "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // Vendored shadcn primitives are kept verbatim.
    files: ["components/ui/**/*.tsx"],
    rules: { "@typescript-eslint/no-unused-vars": "off", "react-hooks/purity": "off", "react-hooks/set-state-in-effect": "off" },
  },
);
