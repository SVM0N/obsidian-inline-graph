'use strict';

const { Plugin } = require('obsidian');

/* ---------- parsing ---------- */

function parseGr(source) {
  // optional first-line directive: height=480
  let height = null;
  const nl = source.indexOf('\n');
  const firstLine = nl === -1 ? source : source.slice(0, nl);
  const hm = firstLine.match(/^\s*height\s*=\s*(\d+)\s*$/);
  if (hm) {
    height = parseInt(hm[1], 10);
    source = nl === -1 ? '' : source.slice(nl + 1);
  }

  let edgePart = source;
  let metaPart = '';

  const open = source.indexOf('[');
  if (open !== -1) {
    edgePart = source.slice(0, open);
    const close = source.lastIndexOf(']');
    metaPart = source.slice(open + 1, close !== -1 ? close : source.length);
  }
  edgePart = edgePart.replace(/:\s*$/m, '');

  const edges = [];
  const ids = new Set();
  // `a-b` is undirected, `a->b` is directed
  const edgeRe = /([A-Za-z0-9_]+)\s*(->|-)\s*([A-Za-z0-9_]+)/g;
  let m;
  while ((m = edgeRe.exec(edgePart))) {
    edges.push({ source: m[1], target: m[3], directed: m[2] === '->' });
    ids.add(m[1]);
    ids.add(m[3]);
  }

  const meta = {};
  const metaRe = /([A-Za-z0-9_]+)\s*:\s*\{([^}]*)\}/g;
  while ((m = metaRe.exec(metaPart))) {
    const props = {};
    const propRe = /([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/g;
    let p;
    while ((p = propRe.exec(m[2]))) props[p[1]] = p[2];
    meta[m[1]] = props;
    ids.add(m[1]);
  }

  if (ids.size === 0) throw new Error('no nodes found');

  const nodes = [...ids].map((id) => ({
    id,
    name: (meta[id] && meta[id].name) || id,
    color: (meta[id] && meta[id].color) || '',
    text: (meta[id] && meta[id].text) || '',
  }));

  return { nodes, edges, height };
}

/* ---------- rendering ---------- */

const NS = 'http://www.w3.org/2000/svg';
const R = 9; // node radius
const HEIGHT = 320;

function svgEl(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

function render(container, nodes, edges, blockHeight) {
  container.empty();
  container.classList.add('inline-graph-container');

  const width = Math.max(container.clientWidth, 300);
  const height = blockHeight || HEIGHT;

  const svg = svgEl('svg', { width: '100%', height });
  svg.classList.add('inline-graph-svg');
  container.appendChild(svg);

  // arrowhead marker for directed edges (unique id per block)
  const markerId = 'gr-arrow-' + Math.random().toString(36).slice(2, 8);
  const defs = svgEl('defs', {});
  const marker = svgEl('marker', {
    id: markerId,
    viewBox: '0 0 10 10',
    refX: 9,
    refY: 5,
    markerWidth: 7,
    markerHeight: 7,
    orient: 'auto',
  });
  marker.appendChild(
    svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--background-modifier-border)' })
  );
  defs.appendChild(marker);
  svg.appendChild(defs);

  // tooltip
  const tip = container.createDiv();
  tip.classList.add('inline-graph-tooltip');

  // initial positions: ring
  nodes.forEach((n, i) => {
    const a = (2 * Math.PI * i) / nodes.length;
    n.x = width / 2 + Math.cos(a) * Math.min(width, height) * 0.25;
    n.y = height / 2 + Math.sin(a) * Math.min(width, height) * 0.25;
    n.vx = 0;
    n.vy = 0;
    n.fixed = false;
  });
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const links = edges
    .map((e) => ({ s: byId[e.source], t: byId[e.target], directed: e.directed }))
    .filter((l) => l.s && l.t);

  // SVG elements
  links.forEach((l) => {
    const line = svgEl('line', {
      stroke: 'var(--background-modifier-border)',
      'stroke-width': 1.5,
    });
    if (l.directed) line.setAttribute('marker-end', `url(#${markerId})`);
    svg.appendChild(line);
    l.el = line;
  });

  const accent = 'var(--interactive-accent)';
  nodes.forEach((n) => {
    const g = svgEl('g', {});
    g.classList.add('inline-graph-node');
    const c = svgEl('circle', { r: R, fill: n.color || accent });
    const label = svgEl('text', {
      y: R + 14,
      'text-anchor': 'middle',
      'font-size': '11px',
      fill: 'var(--text-muted)',
    });
    label.textContent = n.name;
    g.appendChild(c);
    g.appendChild(label);
    svg.appendChild(g);
    n.g = g;
    n.c = c;

    g.addEventListener('pointerenter', () => {
      c.setAttribute('r', R * 1.5);
      if (n.text) {
        tip.textContent = n.text;
        tip.classList.add('is-visible');
        tip.style.left = Math.min(n.x + 14, width - 270) + 'px';
        tip.style.top = n.y + 14 + 'px';
      }
    });
    g.addEventListener('pointerleave', () => {
      c.setAttribute('r', R);
      tip.classList.remove('is-visible');
    });

    // drag
    g.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      g.setPointerCapture(ev.pointerId);
      g.classList.add('is-dragging');
      n.fixed = true;
      const rect = svg.getBoundingClientRect();
      const move = (e) => {
        n.x = e.clientX - rect.left;
        n.y = e.clientY - rect.top;
        alpha = Math.max(alpha, 0.3); // reheat
        if (!running) start();
      };
      const up = (e) => {
        g.releasePointerCapture(e.pointerId);
        g.classList.remove('is-dragging');
        n.fixed = false;
        g.removeEventListener('pointermove', move);
        g.removeEventListener('pointerup', up);
      };
      g.addEventListener('pointermove', move);
      g.addEventListener('pointerup', up);
    });
  });

  /* ---------- force simulation ---------- */

  let alpha = 1;
  let running = false;

  function tick() {
    // repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 1; }
        const f = (2500 / d2) * alpha;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }
    // springs
    const rest = 90;
    links.forEach((l) => {
      const dx = l.t.x - l.s.x, dy = l.t.y - l.s.y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const f = (d - rest) * 0.04 * alpha;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      l.s.vx += fx; l.s.vy += fy;
      l.t.vx -= fx; l.t.vy -= fy;
    });
    // centering + integrate
    nodes.forEach((n) => {
      n.vx += (width / 2 - n.x) * 0.005 * alpha;
      n.vy += (height / 2 - n.y) * 0.005 * alpha;
      if (!n.fixed) {
        n.vx *= 0.85; n.vy *= 0.85;
        n.x += n.vx; n.y += n.vy;
      } else {
        n.vx = 0; n.vy = 0;
      }
      n.x = Math.min(Math.max(n.x, R + 2), width - R - 2);
      n.y = Math.min(Math.max(n.y, R + 2), height - R - 22);
    });
    draw();
    alpha *= 0.97;
  }

  function draw() {
    links.forEach((l) => {
      let x2 = l.t.x;
      let y2 = l.t.y;
      if (l.directed) {
        // stop the line at the circle's edge so the arrowhead is visible
        const dx = l.t.x - l.s.x;
        const dy = l.t.y - l.s.y;
        const d = Math.max(Math.hypot(dx, dy), 1);
        x2 -= (dx / d) * (R + 3);
        y2 -= (dy / d) * (R + 3);
      }
      l.el.setAttribute('x1', l.s.x);
      l.el.setAttribute('y1', l.s.y);
      l.el.setAttribute('x2', x2);
      l.el.setAttribute('y2', y2);
    });
    nodes.forEach((n) => {
      n.g.setAttribute('transform', `translate(${n.x},${n.y})`);
    });
  }

  function start() {
    running = true;
    const loop = () => {
      if (!container.isConnected) { running = false; return; }
      tick();
      if (alpha > 0.005 || nodes.some((n) => n.fixed)) {
        window.requestAnimationFrame(loop);
      } else {
        running = false;
      }
    };
    window.requestAnimationFrame(loop);
  }

  start();
}

/* ---------- plugin ---------- */

module.exports = class InlineGraphPlugin extends Plugin {
  onload() {
    this.registerMarkdownCodeBlockProcessor('gr', (source, el) => {
      try {
        const { nodes, edges, height } = parseGr(source);
        // defer one frame so the container has a measurable width
        window.requestAnimationFrame(() => render(el, nodes, edges, height));
      } catch (e) {
        el.createEl('pre', { text: 'gr error: ' + e.message });
      }
    });
  }
};

// Exposed only so the parser can be smoke-tested in plain node (see
// test/parseGr.test.js); Obsidian only ever uses the default export above
// (the Plugin subclass), so this static property is invisible to it.
module.exports.parseGr = parseGr;
