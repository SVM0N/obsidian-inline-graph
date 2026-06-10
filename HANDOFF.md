# HANDOFF

Developer notes for anyone (including future me) picking this up.

## What this is

A minimal Obsidian plugin that registers a markdown code block processor for the language `gr` and renders the block's content as an interactive force-directed SVG graph. No framework, no bundler, no dependencies. The entire plugin is two files.

## File map

```
inline-graph/manifest.json   Obsidian plugin manifest (id: inline-graph)
inline-graph/main.js         Everything: parser, force simulation, SVG renderer, plugin class
versions.json                minAppVersion mapping, required if submitted to the community plugin store
README.md, HANDOFF.md, LICENSE, .gitignore   repo docs
```

The runtime files live in the `inline-graph/` subfolder so the folder can be copy-pasted directly into `Vault/.obsidian/plugins/`. Caveat: BRAT and the community plugin store both expect `manifest.json` at the **repo root** (and pull `main.js`/`manifest.json` from GitHub release assets). Manual installs are unaffected, but before submitting to the store or relying on BRAT, either move/duplicate `manifest.json` to the root or attach both files as release assets (release assets are sufficient for BRAT).

`main.js` is plain CommonJS (`require('obsidian')`, `module.exports`). Obsidian loads it directly, which is why there is no build step. If you ever add npm dependencies you will need to introduce esbuild/rollup and bundle to `main.js`; until then, do not.

## main.js structure

Three sections, top to bottom:

### 1. `parseGr(source)`

Regex-based, intentionally forgiving. Splits the block at the first `[` into an edge part and a metadata part.

- Edge regex: `([A-Za-z0-9_]+)\s*-\s*([A-Za-z0-9_]+)` applied globally. Separators between pairs (`;`, newlines, whitespace) are never matched, so they need no handling.
- Metadata regex: `id:{...}` entries, with `key="value"` pairs inside.
- Every id seen in either section becomes a node. Defaults: `name` = id, `color` = empty string (renderer falls back to `var(--interactive-accent)`), `text` = empty (no tooltip).
- Throws if zero nodes parse; the processor catches and renders the error message in a `<pre>`.

Known limitation: ids are `\w`-only, so no spaces/CJK in ids (use `name` for display). Quotes inside `text` values are not escapable.

### 2. Renderer + simulation (`render(container, nodes, edges)`)

- Builds one `<svg>` (100% width, fixed 320px height, constant `HEIGHT`) plus an absolutely positioned tooltip `<div>` inside the block container.
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

## Things deliberately not done

- No settings tab. All tuning is constants in `main.js`.
- No click action on nodes.
- No directed edges / arrowheads.
- No `styles.css` (everything is inline styles or SVG attributes; fine at this size).

## Likely next features, in order of ask

1. **Click to open note**: in the node setup, add a `click` handler that calls `app.workspace.openLinkText(n.name, '')` (or a dedicated `link="..."` property). Guard against firing after a drag (track movement distance on pointerup). ~10 lines.
2. **Directed edges**: accept `a->b` in the edge regex, add an SVG `<marker>` arrowhead, set `marker-end` on those lines.
3. **Per-block height**: support a first-line directive like `height=480`.

## Release process (if submitting to the community plugin store)

1. Bump `version` in `manifest.json` and add the entry to `versions.json`.
2. Create a GitHub release whose tag exactly matches the version (no `v` prefix), attaching `manifest.json` and `main.js` as release assets.
3. First-time only: PR your plugin entry to `obsidianmd/obsidian-releases` (`community-plugins.json`).
4. Obsidian's review guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines

Until then, BRAT installs work straight from the repo as long as releases carry the two files.

## Testing

There is no test harness. The parser can be smoke-tested in plain node (it has no Obsidian or DOM dependencies); the renderer requires a DOM, so testing is manual in a vault. Keep a scratch note with a few `gr` blocks covering: full syntax, edges-only, unknown ids in metadata, and a parse error case.
