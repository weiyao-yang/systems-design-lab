const SVG_NS = 'http://www.w3.org/2000/svg';
const clamp = value => Math.max(0, Math.min(1, value));
export const TITLE_SEQUENCE_MS = 4200;
const DRAW_MS = 2400, TITLE_START_MS = DRAW_MS, TITLE_REVEAL_MS = 1200;
const TITLE_START_SPREAD_MS = 720, TITLE_FINISH_SPREAD_MS = 480;
const BYLINE_START_MS = TITLE_START_MS + TITLE_REVEAL_MS;
const BYLINE_REVEAL_MS = TITLE_SEQUENCE_MS - BYLINE_START_MS;
const BYLINE_START_SPREAD_MS = 360, BYLINE_FINISH_SPREAD_MS = 240;
const noise = (seed, step) => {
  const n = Math.sin(seed * 127.1 + step * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

function revealPlans(elements, duration, startSpread, finishSpread, seed) {
  const normalized = salt => {
    const weights = elements.map((_, index) => noise(salt, index + 1));
    const min = Math.min(...weights), range = Math.max(...weights) - min;
    return weights.map(weight => range > 0 ? (weight - min) / range : 0);
  };
  const starts = normalized(seed), finishes = normalized(seed + 19);
  const leaders = starts.map((weight, index) => ({ weight, index }))
    .filter(({ index }) => /[A-Za-z]/.test(elements[index].textContent))
    .sort((a, b) => a.weight - b.weight).slice(0, 2).map(entry => entry.index);
  const directions = [];
  // A stable shuffle distributes all four reveal edges across each text group.
  elements.map((_, index) => ({ index, key: noise(seed + 37, index + 1) }))
    .sort((a, b) => a.key - b.key)
    .forEach(({ index }, rank) => { directions[index] = rank % 4; });
  return elements.map((_, index) => {
    let delay = starts[index] * startSpread;
    let end = duration - (elements.length > 1 ? finishSpread : 0) + finishes[index] * finishSpread;
    if (index === leaders[0]) { delay = 0; end = duration * .72; }
    else if (index === leaders[1]) { delay = 0; end = duration; }
    end = Math.min(duration, Math.max(end, delay + duration * .28));
    return { delay, duration: Math.max(1, end - delay), direction: directions[index] };
  });
}

// Each visual line shares one uninterrupted cap line and one baseline.
// Adjacent letters share dividers; only straight endpoint overhangs vary.
function constructionRow({ boxes, em }, index) {
  boxes.sort((a, b) => a.left - b.left);
  const left = boxes[0].left, right = boxes.at(-1).right;
  const top = Math.min(...boxes.map(box => box.top));
  const bottom = Math.max(...boxes.map(box => box.bottom));
  const seed = index + 1;
  const scale = Math.max(.6, Math.min(1.15, (bottom - top) / 55));
  const point = (x, y) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  const overhang = step => (1.4 + Math.pow(noise(seed, step), 1.4) * 5.8) * scale;
  const rules = `M ${point(left, top)} H ${right.toFixed(2)} M ${point(left, bottom)} H ${right.toFixed(2)}`;
  const dividers = [left];
  for (let i = 1; i < boxes.length; i++) {
    const previous = boxes[i - 1].right, next = boxes[i].left;
    if (next - previous > em * .15) dividers.push(previous, next);
    else dividers.push((previous + next) / 2);
  }
  dividers.push(right);
  const extensions = [
    `M ${point(left, top)} H ${(left - overhang(0)).toFixed(2)}`,
    `M ${point(right, top)} H ${(right + overhang(1)).toFixed(2)}`,
    `M ${point(right, bottom)} H ${(right + overhang(2)).toFixed(2)}`,
    `M ${point(left, bottom)} H ${(left - overhang(3)).toFixed(2)}`,
  ];
  dividers.forEach((x, column) => {
    extensions.push(`M ${point(x, top)} V ${(top - overhang(4 + column * 2)).toFixed(2)}`,
      `M ${point(x, bottom)} V ${(bottom + overhang(5 + column * 2)).toFixed(2)}`);
  });
  const extensionLengths = extensions.map(segment => {
    const match = /M ([-\d.]+) ([-\d.]+) ([HV]) ([-\d.]+)/.exec(segment);
    return Math.abs(Number(match[4]) - Number(match[match[3] === 'H' ? 1 : 2]));
  });
  return [
    // SVG restarts its dash pattern at each M. Normalize to a single segment,
    // otherwise the paired horizontal rules finish halfway through the clock.
    { className: 'intro-guide-rule', d: rules, pathLength: 2 },
    { className: 'intro-guide-divider', d: dividers.map(x => `M ${point(x, top)} V ${bottom.toFixed(2)}`).join(' '), pathLength: dividers.length },
    { className: 'intro-guide-extension', d: extensions.join(' '), pathLength: extensionLengths.reduce((sum, value) => sum + value, 0) / Math.max(...extensionLengths) },
  ];
}

/** Draw the construction guides first, then reveal the title on the shared clock. */
export function createTitleGuides(title, { reducedMotion = false } = {}) {
  if (!title?.ownerDocument) throw new TypeError('A title element is required.');
  const doc = title.ownerDocument;
  const view = doc.defaultView;
  const rows = [...title.querySelectorAll('.intro-title-line')];
  const letters = rows.flatMap(row => [...row.querySelectorAll('.intro-letter')]);
  const byline = title.querySelector('.intro-byline');
  const originalBylineNodes = byline ? [...byline.childNodes] : [];
  const bylineLetters = [];
  if (byline) {
    const fragment = doc.createDocumentFragment();
    for (const character of byline.textContent) {
      const span = doc.createElement('span');
      const space = /\s/.test(character);
      span.className = space ? 'intro-byline-space' : 'intro-byline-letter';
      span.textContent = character;
      if (!space) bylineLetters.push(span);
      fragment.append(span);
    }
    byline.replaceChildren(fragment);
  }
  // Every glyph has its own cached start and duration, independent of reading
  // order. The overlapping reveals remain continuous and repeat predictably.
  const letterPlans = revealPlans(letters, TITLE_REVEAL_MS, TITLE_START_SPREAD_MS, TITLE_FINISH_SPREAD_MS, 41);
  const bylinePlans = revealPlans(bylineLetters, BYLINE_REVEAL_MS, BYLINE_START_SPREAD_MS, BYLINE_FINISH_SPREAD_MS, 73);
  const canvas = doc.createElement('canvas');
  let context = null;
  try { context = canvas.getContext('2d'); } catch { /* Text remains usable without Canvas 2D. */ }
  let destroyed = false, progress = 0, valid = false, refreshFrame = 0;
  let paths = [];
  const glyphInk = new Map();
  const originalOpacity = rows.map(row => row.style.opacity);
  const originalLetterStyles = letters.map(letter => ({ opacity: letter.style.opacity, clipPath: letter.style.clipPath }));
  const originalBylineOpacity = byline?.style.opacity;
  const originalBylineClip = byline?.style.clipPath;
  const originalBylineOffset = byline?.style.getPropertyValue('--intro-byline-offset');
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
  const probes = (byline ? [...rows, byline] : rows).map(row => {
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
    const elapsed = progress * TITLE_SEQUENCE_MS;
    const instant = reducedMotion && progress > 0;
    const t = reducedMotion ? (instant ? 1 : 0) : clamp(elapsed / DRAW_MS);
    const rowOpacity = instant || elapsed >= TITLE_START_MS ? '1' : '0';
    rows.forEach(row => { if (row.style.opacity !== rowOpacity) row.style.opacity = rowOpacity; });
    function reveal(element, raw, direction) {
      if (!element) return;
      const active = raw >= 0, amount = clamp(raw);
      const opacity = active ? '1' : '0';
      const edges = ['0', '0', '0', '0'];
      const side = [1, 3, 2, 0][direction];
      if (!active) edges[side] = '100%';
      else if (amount < 1) {
        const ink = glyphInk.get(element) || { width: 100, height: 100, left: 0, right: 100, top: 0, bottom: 100 };
        const extent = direction < 2 ? ink.right - ink.left : ink.bottom - ink.top;
        // Start with a real, opaque ink sliver, not blank font side bearings
        // plus a slow fade. The leading glyphs are visible on the handoff frame.
        const lead = Math.min(extent, Math.max(1.25, extent * .05));
        const length = lead + (extent - lead) * amount;
        const hidden = [ink.width - ink.left - length, ink.right - length,
          ink.height - ink.top - length, ink.bottom - length][direction];
        edges[side] = `${(100 * Math.max(0, hidden) / (direction < 2 ? ink.width : ink.height)).toFixed(3)}%`;
      }
      const clip = `inset(${edges.join(' ')})`;
      if (element.style.opacity !== opacity) element.style.opacity = opacity;
      if (element.style.clipPath !== clip) element.style.clipPath = clip;
    }
    letters.forEach((letter, index) => reveal(letter, instant ? 1 : (elapsed - TITLE_START_MS - letterPlans[index].delay) / letterPlans[index].duration, letterPlans[index].direction));
    if (byline) {
      const opacity = instant || elapsed >= BYLINE_START_MS ? '1' : '0';
      if (byline.style.opacity !== opacity) byline.style.opacity = opacity;
    }
    bylineLetters.forEach((letter, index) => reveal(letter, instant ? 1 : (elapsed - BYLINE_START_MS - bylinePlans[index].delay) / bylinePlans[index].duration, bylinePlans[index].direction));
    const visible = valid && t > 0;
    svg.style.visibility = visible ? 'visible' : 'hidden';
    for (const path of paths) {
      const visibility = visible ? 'visible' : 'hidden', offset = String(1 - t);
      if (path.style.visibility !== visibility) path.style.visibility = visibility;
      if (path.style.strokeDashoffset !== offset) path.style.strokeDashoffset = offset;
    }
  }

  function refresh() {
    if (destroyed) return;
    if (refreshFrame) { view.cancelAnimationFrame(refreshFrame); refreshFrame = 0; }
    const overlay = svg.getBoundingClientRect();
    valid = !!context && overlay.width > 0 && overlay.height > 0;
    if (!valid) { paint(); return; }
    svg.setAttribute('viewBox', `0 0 ${overlay.width} ${overlay.height}`);
    glyphInk.clear();
    const groups = [];
    let firstInkLeft = null;
    rows.forEach((row, rowIndex) => {
      const baseline = probes[rowIndex].getBoundingClientRect().top - overlay.top;
      let group = groups.find(entry => Math.abs(entry.baseline - baseline) < .5);
      if (!group) { group = { baseline, boxes: [], em: 0 }; groups.push(group); }
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
        glyphInk.set(letter, { width: bounds.width, height: bounds.height,
          left: -metrics.actualBoundingBoxLeft, right: metrics.actualBoundingBoxRight,
          top: overlay.top + top - bounds.top, bottom: overlay.top + bottom - bounds.top });
        if (firstInkLeft === null) firstInkLeft = left;
        group.em = Number.parseFloat(style.fontSize);
        // Keep the main stroke just outside the ink; only the loose ends extend.
        group.boxes.push({ left: left - .65, right: right + .65, top: top - .65, bottom: bottom + .65 });
      }
    });
    if (byline && firstInkLeft !== null) {
      const style = view.getComputedStyle(byline);
      context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const bearing = context.measureText(byline.textContent).actualBoundingBoxLeft;
      byline.style.setProperty('--intro-byline-offset', `${firstInkLeft + (Number.isFinite(bearing) ? bearing : 0)}px`);
      const baseline = probes[rows.length].getBoundingClientRect().top;
      for (const letter of bylineLetters) {
        const bounds = letter.getBoundingClientRect();
        const metrics = context.measureText(letter.textContent);
        if (bounds.width > 0 && bounds.height > 0) glyphInk.set(letter, {
          width: bounds.width, height: bounds.height, left: -metrics.actualBoundingBoxLeft,
          right: metrics.actualBoundingBoxRight, top: baseline - metrics.actualBoundingBoxAscent - bounds.top,
          bottom: baseline + metrics.actualBoundingBoxDescent - bounds.top });
      }
    }
    const strokes = groups.filter(group => group.boxes.length).flatMap(constructionRow);
    while (paths.length > strokes.length) paths.pop().remove();
    strokes.forEach((stroke, index) => {
      let path = paths[index];
      if (!path) {
        path = doc.createElementNS(SVG_NS, 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--orange, #ff7940)');
        path.setAttribute('stroke-linecap', 'butt');
        path.setAttribute('stroke-linejoin', 'miter');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        path.style.strokeDasharray = '1';
        path.style.visibility = 'hidden';
        svg.append(path);
        paths.push(path);
      }
      path.setAttribute('class', stroke.className);
      path.setAttribute('d', stroke.d);
      path.setAttribute('pathLength', String(stroke.pathLength));
    });
    valid = strokes.length > 0;
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
      letters.forEach((letter, index) => {
        letter.style.opacity = originalLetterStyles[index].opacity;
        letter.style.clipPath = originalLetterStyles[index].clipPath;
      });
      if (byline) {
        byline.replaceChildren(...originalBylineNodes);
        byline.style.opacity = originalBylineOpacity;
        byline.style.clipPath = originalBylineClip;
        if (originalBylineOffset) byline.style.setProperty('--intro-byline-offset', originalBylineOffset);
        else byline.style.removeProperty('--intro-byline-offset');
      }
      svg.remove(); paths = [];
      glyphInk.clear();
      canvas.width = canvas.height = 0; context = null;
      if (ownsPosition && title.style.position === 'relative') title.style.position = originalPosition;
    },
  };
}
