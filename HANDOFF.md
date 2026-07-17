# HANDOFF

Developer notes for anyone (including future me) picking this up.

## What this is

A minimal Obsidian plugin that registers a markdown code block processor for the language `gr` and renders the block's content as an interactive force-directed SVG graph. No framework, no bundler, no runtime dependencies. The shipped plugin is three files: `main.js`, `manifest.json`, `styles.css`.

(There is now an `npm`-managed dev-tooling layer — eslint for linting and a plain-node smoke test — but nothing from it is bundled into or shipped with the plugin; see "Dev tooling" below. `main.js` is still hand-written, unbundled CommonJS.)

## File map

```
manifest.json     Obsidian plugin manifest (id: inline-graph), repo root
main.js           Everything: parser, force simulation, SVG renderer, plugin class, repo root
styles.css        CSS classes toggled from main.js (see "Dev tooling" re: why this exists), repo root
versions.json     minAppVersion mapping, required if submitted to the community plugin store
package.json      Dev tooling only (eslint, smoke test) — not part of the shipped plugin
eslint.config.mjs Lint config (eslint-plugin-obsidianmd's recommended rules)
test/             Plain-node smoke test for parseGr()
README.md, HANDOFF.md, LICENSE, .gitignore   repo docs
```

`manifest.json` and `main.js` live at the **repo root** (moved here from a former `inline-graph/` subfolder). This matches what BRAT and the community plugin store expect: the obsidian-releases review bot fetches `manifest.json` directly from the repo root via a raw GitHub URL on the default branch, and BRAT can install straight from the repo root too. GitHub release assets (`manifest.json`, `main.js`) are still what the Obsidian plugin installer and BRAT actually download at install time — see "Release process" below.

For manual installs, copy `manifest.json` and `main.js` into a folder named `inline-graph` inside `Vault/.obsidian/plugins/` (the destination folder name is what matters to Obsidian, not the source repo layout) — see README.md for exact steps.

We deliberately chose "move" over "duplicate" (keeping a second copy under `inline-graph/` in sync with the root copy) because a duplicate is a drift hazard: every future version bump would require remembering to update both copies, and a stale duplicate would fail store validation silently. A single root copy has no such failure mode.

`main.js` is plain CommonJS (`require('obsidian')`, `module.exports`). Obsidian loads it directly, which is why there is no build step. If you ever add npm dependencies you will need to introduce esbuild/rollup and bundle to `main.js`; until then, do not.

## main.js structure

Three sections, top to bottom:

### 1. `parseGr(source)`

Regex-based, intentionally forgiving. Splits the block at the first `[` into an edge part and a metadata part.

- Optional first-line directive `height=NNN` is consumed before anything else and returned as `height` (null if absent). It must be alone on the first line; `height=` anywhere else is treated as ordinary content.
- Edge regex: `([A-Za-z0-9_]+)\s*(->|-)\s*([A-Za-z0-9_]+)` applied globally; `->` marks a directed edge (the alternation tries `->` first, so ordering matters). Separators between pairs (`;`, newlines, whitespace) are never matched, so they need no handling.
- Metadata regex: `id:{...}` entries, with `key="value"` pairs inside.
- Every id seen in either section becomes a node. Defaults: `name` = id, `color` = empty string (renderer falls back to `var(--interactive-accent)`), `text` = empty (no tooltip).
- Throws if zero nodes parse; the processor catches and renders the error message in a `<pre>`.

Known limitation: ids are `\w`-only, so no spaces/CJK in ids (use `name` for display). Quotes inside `text` values are not escapable.

### 2. Renderer + simulation (`render(container, nodes, edges)`)

- Builds one `<svg>` (100% width; height = per-block `height` directive or the `HEIGHT` constant, 320px) plus an absolutely positioned tooltip `<div>` inside the block container.
- A `<defs><marker>` arrowhead is created per block with a randomized id (`url(#id)` resolves document-wide, so a fixed id would clash when a note has several graphs). Directed lines get `marker-end`, and `draw()` shortens their target endpoint by `R + 3` so the arrowhead sits at the circle's edge instead of underneath it.
- Initial node positions on a ring to avoid degenerate overlaps.
- Simulation per tick:
  - Pairwise repulsion, force `2500 / d²` (constant inline)
  - Edge springs, rest length `90`, stiffness `0.04`
  - Weak centering pull `0.005`
  - Velocity damping `0.85`, global `alpha` cooling `*= 0.97`, loop stops below `0.005`
  - Positions clamped to the SVG bounds (extra 20px bottom margin for labels)
- These constants are the tuning surface. If graphs look too cramped, raise repulsion or rest length.
- Drag: pointer events with `setPointerCapture`, drags pin the node (`fixed = true`) and reheat `alpha` to 0.3 so neighbors react. Coordinates are 1:1 with client pixels (no viewBox scaling), so `clientX - rect.left` is safe. Do not add a `viewBox` without also fixing the drag math.
- Hover: grows circle radius 1.5x and positions the tooltip near the node, clamped to the right edge.
- The rAF loop checks `container.isConnected` each frame and self-terminates when the block leaves the DOM, so no explicit teardown is needed.
- Theming uses Obsidian CSS variables only: `--interactive-accent`, `--background-modifier-border`, `--text-muted`, `--background-primary`, `--text-normal`. No hardcoded colors except user-provided ones.

### 3. Plugin class

`registerMarkdownCodeBlockProcessor('gr', ...)`. Rendering is deferred one `requestAnimationFrame` because the container often has zero width at processor time; `render` measures `container.clientWidth` (floor 300).

## Dev tooling (added for community-store submission)

`npm install` pulls in `eslint`, `eslint-plugin-obsidianmd`, and `@typescript-eslint/parser` as devDependencies — nothing here is bundled into `main.js` or shipped; it exists purely to run `npm run lint` locally. `eslint-plugin-obsidianmd`'s recommended config is what pushed two real changes into `main.js`:

- **`styles.css` exists now** because the linter's `no-static-styles-assignment` rule (an error, not a warning) flags any `element.style.x = '<literal>'`. All the static/toggle-style assignments (`position: relative`, `display: block/none`, cursor `grab`/`grabbing`) moved to CSS classes (`inline-graph-container`, `inline-graph-svg`, `inline-graph-tooltip` + `.is-visible`, `inline-graph-node` + `.is-dragging`) toggled via `classList`. Truly dynamic, per-frame values (`tip.style.left/top`, computed from node position) are untouched — those aren't literals and the rule doesn't flag them.
- **`require('obsidian')` and `module.exports` are declared as explicit globals** for `main.js` in `eslint.config.mjs`, and `@typescript-eslint/no-require-imports` is turned off for that file. The base recommended config only adds Node/CommonJS globals when `manifest.json`'s `isDesktopOnly` is `true`; ours is `false` (this plugin works on mobile), but `require`/`module` are provided by Obsidian's own plugin loader on every platform, not just desktop — that's a gap in the linter's assumptions, not a reason to introduce a bundler.

`npm run lint` is standalone; there's no CI wiring beyond that (none existed before).

## Things deliberately not done

- No settings tab. All tuning is constants in `main.js`.
- No click action on nodes.

## Likely next features, in order of ask

1. **Click to open note**: in the node setup, add a `click` handler that calls `app.workspace.openLinkText(n.name, '')` (or a dedicated `link="..."` property). Guard against firing after a drag (track movement distance on pointerup). ~10 lines.

Implemented in 0.2.0: directed edges (`a->b`) and the per-block `height=NNN` directive.

## Release process (if submitting to the community plugin store)

1. Bump `version` in `manifest.json` (repo root) and `package.json`, and add the entry to `versions.json`.
2. Run `npm run lint` and `npm test`; both should be clean.
3. Create a GitHub release whose tag exactly matches the version (no `v` prefix), attaching `manifest.json`, `main.js`, and `styles.css` as release assets.
4. First-time only: PR your plugin entry to `obsidianmd/obsidian-releases` (`community-plugins.json`).
5. Obsidian's review guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines

Until then, BRAT installs work straight from the repo as long as releases carry all three files.

## Testing

`npm test` runs `test/parseGr.test.js`, a dependency-free smoke test covering: full syntax (height directive + undirected/directed edges + metadata), edges-only with no metadata, an id that only appears in the metadata block, and the zero-nodes parse-error case.

`main.js` does `require('obsidian')` at module load time, so it can't be required as-is outside Obsidian, and the official `obsidian` npm package won't help — it ships only `.d.ts` type declarations with no runtime `.js` at all. The test works around this by temporarily intercepting `Module._load` so the single `require('obsidian')` call resolves to a trivial stub (`{ Plugin: class {} }`) while `main.js` loads, then restores normal resolution. `parseGr` itself is exposed as `module.exports.parseGr` (a static property on the exported `Plugin` subclass) purely for this test; Obsidian only ever uses the default export (the class itself) to instantiate the plugin, so this is invisible to it.

The renderer requires a DOM, so testing that remains manual in a vault. Keep a scratch note with a few `gr` blocks covering the same cases above, plus drag and hover interaction.
