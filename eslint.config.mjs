import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tsparser from "@typescript-eslint/parser";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  {
    // The recommended config only wires JSON-language linting up for
    // package.json; manifest.json (the file the community-store review
    // bot and obsidianmd's own validate-manifest rule actually care
    // about) isn't covered by any of its file globs, so add it here.
    // validate-manifest's own test suite (validateManifest.test.js)
    // exercises it through @typescript-eslint/rule-tester, i.e. parsed
    // as a plain JS expression (a top-level `{ "a": 1 }` unambiguously
    // parses as an ObjectExpression, not a block, because quoted keys
    // can't be statement labels) — not through the dedicated `json/json`
    // language plugin, which produces a differently-shaped AST the rule
    // doesn't recognize (confirmed empirically: language:"json/json"
    // silently never reports anything, even for a manifestly-bad
    // description). So this block deliberately omits `language` and
    // falls back to default JS parsing, matching how the rule is tested.
    files: ["manifest.json"],
    plugins: { obsidianmd },
    languageOptions: {
      parser: tsparser,
    },
    rules: {
      "obsidianmd/validate-manifest": "warn",
    },
  },
  {
    // main.js is the plugin's sole entry point. It is deliberately plain
    // CommonJS (require('obsidian') / module.exports = ...) because this
    // repo has no bundler and no build step (see HANDOFF.md) — Obsidian
    // loads main.js directly. `require` and `module` are real globals in
    // that environment (Obsidian's plugin loader provides them on every
    // platform, not just desktop), but the base config only adds Node
    // globals when `isDesktopOnly` is true in manifest.json, so declare
    // them explicitly here instead.
    files: ["main.js"],
    languageOptions: {
      globals: {
        require: "readonly",
        module: "readonly",
      },
    },
    rules: {
      // Requires a bundler (esbuild/rollup) to convert to ESM `import`,
      // which this project intentionally does not have. See HANDOFF.md:
      // "No framework, no bundler, no dependencies... until then, do not."
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // The smoke test runs under plain Node (not inside Obsidian), so it
    // legitimately needs real Node/CommonJS globals and `require`. It is
    // dev-only tooling, never shipped or loaded by Obsidian (only
    // manifest.json/main.js/styles.css are), so the mobile-API and
    // no-console rules below — which exist to police code that runs
    // inside the app — don't apply to it.
    files: ["test/**/*.js"],
    languageOptions: {
      globals: {
        require: "readonly",
        module: "readonly",
        process: "readonly",
        console: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
]);
