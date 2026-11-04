const SVG_NS = 'http://www.w3.org/2000/svg';
const clamp = value => Math.max(0, Math.min(1, value));
const DRAW_MS = 2400, FILL_DELAY_MS = 120, FILL_MS = 380, INTRO_MS = 4200;
const noise = (seed, step) => {
  const n = Math.sin(seed * 127.1 + step * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

// Cache a slightly uneven pen stroke and a few loose ends at measurement time.
// Geometry stays still while drawing; no animated SVG filters or framewise noise.
function sketchBox({ left, right, top, bottom }, index) {
  const seed = index + 1;
  const scale = Math.max(.6, Math.min(1.15, (bottom - top) / 55));
  const point = (x, y) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  const loose = step => (2.1 + noise(seed, step) * 1.7) * scale;
  const start = [left - loose(0), top];
  const corners = [start, [right, top], [right, bottom], [left, bottom], [left, top], [left + loose(1), top]];
  let outline = `M ${point(...start)}`;
  for (let edge = 1; edge < corners.length; edge++) {
    const [x0, y0] = corners[edge - 1], [x1, y1] = corners[edge];
    const dx = x1 - x0, dy = y1 - y0, length = Math.hypot(dx, dy);
    const count = Math.max(1, Math.ceil(length / (6 * scale)));
    for (let step = 1; step <= count; step++) {
      const t = step / count;
      const wobble = step === count ? 0 : (noise(seed + edge, step) - .5) * .85 * scale;
      outline += ` L ${point(x0 + dx * t - dy / length * wobble, y0 + dy * t + dx / length * wobble)}`;
    }
  }
  const wisps = [
    [[left - .2 * scale, top - loose(2)], [left + .25 * scale, top + loose(3)]],
    [[right - loose(4), top + .3 * scale], [right + loose(5), top - .25 * scale]],
    [[right - .2 * scale, bottom - loose(6)], [right + .35 * scale, bottom + loose(7)]],
    [[left - loose(8), bottom + .3 * scale], [left + loose(9), bottom - .15 * scale]],
    [[left + (right - left) * .18, top - .7 * scale], [left + (right - left) * .62, top - .45 * scale]],
  ];
  return [outline, wisps.map(([a, b]) => `M ${point(...a)} L ${point(...b)}`).join(' ')];
}

/** Draw the construction guides first, then reveal the title on the shared clock. */
export function createTitleGuides(title, { reducedMotion = false } = {}) {
  if (!title?.ownerDocument) throw new TypeError('A title element is required.');
  const doc = title.ownerDocument;
  const view = doc.defaultView;
  const rows = [...title.querySelectorAll('.intro-title-line')];
  const canvas = doc.createElement('canvas');
  let context = null;
  try { context = canvas.getContext('2d'); } catch { /* Text remains usable without Canvas 2D. */ }
  let destroyed = false, progress = 0, valid = false, refreshFrame = 0;
  let paths = [];
  const originalOpacity = rows.map(row => row.style.opacity);
  const originalPosition = title.style.position;
  const ownsPosition = view.getComputedStyle(title).position === 'static';
  if (ownsPosition) title.style.position = 'relative';

  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.classList.add('intro-title-guides');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('preserveAspectRatio', 'none');
  Object.assign(svg.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    overflow: 'visible', pointerEvents: 'none', visibility: 'hidden',
  });
  title.append(svg);

  // An empty inline-block's bottom edge is its alphabetic baseline. It has no
  // ink, width, height or line-height and therefore leaves the title flow alone.
  const probes = rows.map(row => {
    const probe = doc.createElement('span');
    probe.className = 'intro-baseline-probe';
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, {
      display: 'inline-block', position: 'static', width: '0', height: '0',
      padding: '0', margin: '0', border: '0', verticalAlign: 'baseline',
      fontSize: '0', lineHeight: '0', letterSpacing: '0', overflow: 'hidden',
      visibility: 'hidden', pointerEvents: 'none',
    });
    row.append(probe);
    return probe;
  });

  function paint() {
    const elapsed = progress * INTRO_MS;
    const t = reducedMotion ? (progress > 0 ? 1 : 0) : clamp(elapsed / DRAW_MS);
    const fill = reducedMotion ? (progress > 0 ? 1 : 0) : clamp((elapsed - DRAW_MS - FILL_DELAY_MS) / FILL_MS);
    const opacity = String(fill * fill * (3 - 2 * fill));
    rows.forEach(row => { if (row.style.opacity !== opacity) row.style.opacity = opacity; });
    const visible = valid && t > 0;
    svg.style.visibility = visible ? 'visible' : 'hidden';
    for (const path of paths) {
      path.style.visibility = visible ? 'visible' : 'hidden';
      path.style.strokeDashoffset = String(1 - t);
    }
  }

  function refresh() {
    if (destroyed) return;
    if (refreshFrame) { view.cancelAnimationFrame(refreshFrame); refreshFrame = 0; }
    const overlay = svg.getBoundingClientRect();
    valid = !!context && overlay.width > 0 && overlay.height > 0;
    if (!valid) { paint(); return; }
    svg.setAttribute('viewBox', `0 0 ${overlay.width} ${overlay.height}`);
    const boxes = [];
    rows.forEach((row, rowIndex) => {
      const baseline = probes[rowIndex].getBoundingClientRect().top - overlay.top;
      for (const letter of row.querySelectorAll('.intro-letter')) {
        const bounds = letter.getBoundingClientRect();
        if (!(bounds.width > 0 && bounds.height > 0)) continue;
        const style = view.getComputedStyle(letter);
        context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
        context.textAlign = 'left';
        context.textBaseline = 'alphabetic';
        if ('fontKerning' in context) context.fontKerning = style.fontKerning;
        if ('fontStretch' in context) context.fontStretch = style.fontStretch;
        if ('fontVariantCaps' in context) context.fontVariantCaps = style.fontVariantCaps;
        let text = letter.textContent;
        if (style.textTransform === 'uppercase') text = text.toUpperCase();
        if (style.textTransform === 'lowercase') text = text.toLowerCase();
        const metrics = context.measureText(text);
        const values = [metrics.actualBoundingBoxLeft, metrics.actualBoundingBoxRight,
          metrics.actualBoundingBoxAscent, metrics.actualBoundingBoxDescent, baseline];
        if (!values.every(Number.isFinite)) continue;
        const left = bounds.left - overlay.left - metrics.actualBoundingBoxLeft;
        const right = bounds.left - overlay.left + metrics.actualBoundingBoxRight;
        const top = baseline - metrics.actualBoundingBoxAscent;
        const bottom = baseline + metrics.actualBoundingBoxDescent;
        if (!(right > left && bottom > top)) continue;
        // Keep the main stroke just outside the ink; only the loose ends extend.
        boxes.push({ left: left - .65, right: right + .65, top: top - .65, bottom: bottom + .65 });
      }
    });
    const strokes = boxes.flatMap(sketchBox);
    while (paths.length > strokes.length) paths.pop().remove();
    strokes.forEach((stroke, index) => {
      let path = paths[index];
      if (!path) {
        path = doc.createElementNS(SVG_NS, 'path');
        path.setAttribute('class', index % 2 ? 'intro-guide-fray' : 'intro-guide-edge');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--orange, #ff7940)');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        path.setAttribute('pathLength', '1');
        path.style.strokeDasharray = '1';
        path.style.visibility = 'hidden';
        svg.append(path);
        paths.push(path);
      }
      path.setAttribute('d', stroke);
    });
    valid = boxes.length > 0;
    paint();
  }

  function scheduleRefresh() {
    if (!destroyed && !refreshFrame) refreshFrame = view.requestAnimationFrame(() => {
      refreshFrame = 0; refresh();
    });
  }
  const observer = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(scheduleRefresh) : null;
  observer?.observe(title);
  rows.forEach(row => {
    observer?.observe(row);
    row.querySelectorAll('.intro-letter').forEach(letter => observer?.observe(letter));
  });
  view.addEventListener('resize', scheduleRefresh);
  doc.fonts?.addEventListener('loadingdone', scheduleRefresh);
  doc.fonts?.ready.then(() => { if (!destroyed) scheduleRefresh(); });
  refresh();

  return {
    setProgress(value) {
      if (destroyed) return;
      const numeric = Number(value);
      progress = Number.isFinite(numeric) ? clamp(numeric) : 0;
      paint();
    },
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      if (refreshFrame) view.cancelAnimationFrame(refreshFrame);
      refreshFrame = 0;
      view.removeEventListener('resize', scheduleRefresh);
      doc.fonts?.removeEventListener('loadingdone', scheduleRefresh);
      probes.forEach(probe => probe.remove());
      rows.forEach((row, index) => { row.style.opacity = originalOpacity[index]; });
      svg.remove(); paths = [];
      canvas.width = canvas.height = 0; context = null;
      if (ownsPosition && title.style.position === 'relative') title.style.position = originalPosition;
    },
  };
}
