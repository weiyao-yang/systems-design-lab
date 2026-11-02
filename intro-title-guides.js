const SVG_NS = 'http://www.w3.org/2000/svg';
const clamp = value => Math.max(0, Math.min(1, value));

/** Ink-tight title construction boxes, driven only by the robot's shared clock. */
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
    const t = reducedMotion ? (progress > 0 ? 1 : 0) : clamp(progress * 4200 / 2400);
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
        // Half a CSS pixel outside the ink puts the inside of the 1px stroke
        // exactly on the glyph bounds, without covering any of its fill.
        boxes.push({ left: left - .5, right: right + .5, top: top - .5, bottom: bottom + .5 });
      }
    });
    while (paths.length > boxes.length) paths.pop().remove();
    boxes.forEach((box, index) => {
      let path = paths[index];
      if (!path) {
        path = doc.createElementNS(SVG_NS, 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'var(--orange, #ff7940)');
        path.setAttribute('stroke-width', '1');
        path.setAttribute('stroke-linecap', 'butt');
        path.setAttribute('stroke-linejoin', 'miter');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        path.setAttribute('pathLength', '1');
        path.style.strokeDasharray = '1';
        path.style.visibility = 'hidden';
        svg.append(path);
        paths.push(path);
      }
      path.setAttribute('d', `M ${box.left} ${box.top} H ${box.right} V ${box.bottom} H ${box.left} Z`);
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
      svg.remove(); paths = [];
      canvas.width = canvas.height = 0; context = null;
      if (ownsPosition && title.style.position === 'relative') title.style.position = originalPosition;
    },
  };
}
