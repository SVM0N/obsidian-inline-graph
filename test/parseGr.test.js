'use strict';

// Smoke test for parseGr(), the only piece of main.js with no DOM
// dependency (see HANDOFF.md's Testing section). main.js still does
// `require('obsidian')` at module load time, so it can't be required
// as-is outside Obsidian; the real `obsidian` npm package doesn't help
// here either, since it ships only .d.ts type declarations and has no
// runtime .js entry point at all. Instead we stub the module resolution
// for the single 'obsidian' request while loading main.js.

const assert = require('node:assert');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'obsidian') {
    return { Plugin: class Plugin {} };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { parseGr } = require('../main.js');
Module._load = originalLoad;

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    failures++;
    console.error(`not ok - ${name}`);
    console.error(err);
  }
}

check('full syntax: height directive, undirected + directed edges, metadata', () => {
  const { nodes, edges, height } = parseGr(
    'height=480\na-b; b->c\n[\na:{name="Alpha",color="red",text="hi"}\n]'
  );
  assert.strictEqual(height, 480);
  assert.strictEqual(edges.length, 2);
  assert.strictEqual(edges[0].directed, false);
  assert.strictEqual(edges[1].directed, true);
  const a = nodes.find((n) => n.id === 'a');
  assert.strictEqual(a.name, 'Alpha');
  assert.strictEqual(a.color, 'red');
  assert.strictEqual(a.text, 'hi');
  const b = nodes.find((n) => n.id === 'b');
  assert.strictEqual(b.name, 'b'); // default: id used as name
});

check('edges only, no metadata block, no height directive', () => {
  const { nodes, edges, height } = parseGr('a-b; b-c');
  assert.strictEqual(height, null);
  assert.strictEqual(edges.length, 2);
  assert.strictEqual(nodes.length, 3);
  nodes.forEach((n) => {
    assert.strictEqual(n.name, n.id);
    assert.strictEqual(n.color, '');
    assert.strictEqual(n.text, '');
  });
});

check('id only present in metadata becomes a standalone node', () => {
  const { nodes, edges } = parseGr('a-b [ c:{name="Solo"} ]');
  assert.strictEqual(edges.length, 1);
  assert.strictEqual(nodes.length, 3);
  const c = nodes.find((n) => n.id === 'c');
  assert.strictEqual(c.name, 'Solo');
});

check('throws when no nodes parse', () => {
  assert.throws(() => parseGr('   '), /no nodes found/);
});

if (failures > 0) {
  console.error(`\n${failures} parseGr smoke test(s) failed`);
  process.exit(1);
} else {
  console.log('\nall parseGr smoke tests passed');
}
