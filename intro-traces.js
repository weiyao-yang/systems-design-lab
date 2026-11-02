// Temporary wires use their dialog surface coordinates; the final machine stays
// in its original Three.js canvas and is never replaced or translated.
const SVG_NS = 'http://www.w3.org/2000/svg';
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const smooth = n => n * n * (3 - 2 * n);
const fraction = n => n - Math.floor(n);
const LABEL_NAMES = ['NODE', 'VECTOR', 'LINK', 'FIELD', 'SIGNAL'];
const LABEL_COMPACT = [5.2, 6.5, 8], LABEL_DESKTOP = [5.5, 7.2, 9], LABEL_BRIGHTNESS = [.62, .82, 1];

export function buildIncomingTraceLayout({ width, height, anchors = [] } = {}) {
  width = Number(width); height = Number(height);
  if (!(width > 0 && height > 0)) return [];
  const margin = Math.max(30, Math.min(width, height) * .08);
  const source = anchors.filter(a => Number.isFinite(a?.x) && Number.isFinite(a?.y)).slice(0, 34);
  const offset = Math.ceil(source.length / 4) * 4;
  const lanes = source.map((anchor, order) => ({ ...anchor, sourceIndex: Number.isFinite(anchor.index) ? Math.trunc(anchor.index) : order, lane: 0 }))
    .concat(source.map((anchor, order) => ({ ...anchor, sourceIndex: Number.isFinite(anchor.index) ? Math.trunc(anchor.index) : order, lane: 1 })));
  const traces = lanes.map((anchor, order) => {
    const sourceOrder = order % source.length;
    const index = anchor.sourceIndex + anchor.lane * offset;
    // This order matches the contour anchor field in robot-drawing.js.
    const side = ((index % 4) + 4) % 4; // left, top, right, bottom
    const seed = fraction(index * .61803398875 + .21);
    const cross = .12 + seed * .76;
    const origin = side === 0 ? { x: -margin, y: height * cross }
      : side === 1 ? { x: width * cross, y: -margin }
      : side === 2 ? { x: width + margin, y: height * cross }
      : { x: width * cross, y: height + margin };
    const end = { x: anchor.x, y: anchor.y };
    const dx = end.x - origin.x, dy = end.y - origin.y;
    const bend = (fraction(index * .38196601125 + .37) * 2 - 1) * Math.min(width, height) * .20;
    const c1 = side === 0 || side === 2 ? { x: origin.x + dx * .52, y: origin.y + bend }
      : { x: origin.x + bend, y: origin.y + dy * .52 };
    const c2 = side === 0 || side === 2 ? { x: end.x + (side === 0 ? -1 : 1) * Math.abs(dx) * .18, y: end.y - bend * .45 }
      : { x: end.x - bend * .45, y: end.y + (side === 1 ? -1 : 1) * Math.abs(dy) * .18 };
    const points = [], lengths = [0];
    let length = 0;
    for (let sample = 0; sample <= 40; sample++) {
      const t = sample / 40, s = 1 - t;
      const point = { x: s*s*s*origin.x + 3*s*s*t*c1.x + 3*s*t*t*c2.x + t*t*t*end.x,
        y: s*s*s*origin.y + 3*s*s*t*c1.y + 3*s*t*t*c2.y + t*t*t*end.y };
      if (sample) { const old = points[sample - 1]; length += Math.hypot(point.x-old.x, point.y-old.y); lengths.push(length); }
      points.push(point);
    }
    const baseArrival = clamp(Number.isFinite(anchor.arrival) ? anchor.arrival : .20 + sourceOrder / Math.max(1, anchors.length-1) * .28, .16, .72);
    // Both lanes leave together. The first reaches the real contour when its
    // ink begins; the second keeps feeding it throughout the same single pass.
    // A slow lane must not wait for the fast lane to disappear before starting.
    const arrival = anchor.lane ? .84 + fraction(index * .7548776662) * .16 : baseArrival;
    const trace = { index, sourceIndex: anchor.sourceIndex, lane: anchor.lane, side,
      role: anchor.role === 'internal' ? 'internal' : 'shell', origin, anchor: end, points, lengths,
      length, start: .012 + fraction(index * .41421356237) * .028,
      arrival, drainStart: .055 + fraction(index * .2718281828) * .035,
      finalWave: 0 };
    return trace;
  });
  // Keep one moving head on every side until the exact last frame.
  // A central anchor also avoids choosing a cropped wheel on short phones.
  for (let side = 0; side < 4; side++) {
    const candidates = traces.filter(trace => trace.side === side && trace.lane === 1);
    const score = trace => Math.hypot((trace.anchor.x - width / 2) / width, (trace.anchor.y - height / 2) / height);
    const leader = candidates.reduce((best, trace) => !best || score(trace) < score(best) ? trace : best, null);
    if (leader) leader.arrival = 1;
  }
  // Every wire carries data; size and brightness create a readable hierarchy.
  traces.forEach(trace => { trace.labelTier = trace.index % 7 === 0 ? 2 : trace.index % 3 === 0 ? 1 : 0; });
  return traces;
}

function pointAt(trace, progress, point = {}) {
  const distance = trace.length * progress;
  let low = 1, high = trace.lengths.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (trace.lengths[middle] < distance) low = middle + 1;
    else high = middle;
  }
  const a = trace.points[low - 1], b = trace.points[low];
  const t = clamp((distance - trace.lengths[low - 1]) / Math.max(1e-8, trace.lengths[low] - trace.lengths[low - 1]), 0, 1);
  point.x = a.x + (b.x-a.x)*t; point.y = a.y + (b.y-a.y)*t;
  return point;
}

function sampleTrace(trace, progress, frame = {}) {
  // Head and tail each cross this curve once, monotonically. After contact the
  // tail continues flowing into that same point; nothing fades out and restarts
  // at the screen edge. Linear arc-length travel also avoids a mass ease-out
  // pause just before the last wires arrive.
  const travel = clamp((progress - trace.start) / (trace.arrival - trace.start), 0, 1);
  const drained = clamp((progress - trace.drainStart) / (1 - trace.drainStart), 0, 1);
  const tail = travel * drained;
  const remainingPixels = (travel - tail) * trace.length;
  const fadeIn = smooth(clamp((progress - trace.start) / .018, 0, 1));
  frame.wave = 0; frame.departure = trace.start; frame.contact = trace.arrival; frame.fadeEnd = 1;
  frame.travel = travel; frame.tail = tail; frame.final = true;
  frame.opacity = progress >= 1 ? 0 : fadeIn * clamp(remainingPixels / 2, 0, 1);
  frame.phase = progress <= trace.start ? 'waiting' : progress < trace.arrival ? 'approach' : 'drain';
  return frame;
}

function captionFor(trace, wave) {
  const id = String((trace.index * 37 + wave * 97) % 997).padStart(3, '0');
  const value = ((trace.index * 113 + wave * 227) % 997 / 997).toFixed(3).slice(1);
  return `${LABEL_NAMES[trace.index % LABEL_NAMES.length]}_${id} ${value}`;
}

function sampleLabel(trace, frame, width, height, label = {}) {
  if (trace.labelWave !== frame.wave) {
    trace.labelCaption = captionFor(trace, frame.wave); trace.labelWave = frame.wave;
  }
  const fontSize = (width <= 700 ? LABEL_COMPACT : LABEL_DESKTOP)[trace.labelTier];
  const labelWidth = trace.labelCaption.length * fontSize * .62 + 10;
  const packet = frame.tail + (frame.travel - frame.tail) * (.55 + trace.index % 3 * .09);
  pointAt(trace, packet, label);
  const align = label.x + labelWidth > width - 8 ? 'end' : 'start';
  const left = label.x + (align === 'end' ? -labelWidth + 4 : -4);
  const edgeClearance = Math.min(left - 4, width - 4 - left - labelWidth, label.y - 12, height - 12 - label.y);
  const edgeOpacity = smooth(clamp(edgeClearance / 12, 0, 1));
  const arriving = smooth(clamp((packet - .07) / .13, 0, 1));
  const settling = 1 - smooth(clamp((packet - .86) / .12, 0, 1));
  const stroke = smooth(clamp(((frame.travel - frame.tail) * trace.length - 16) / 28, 0, 1));
  const opacity = edgeOpacity * frame.opacity * arriving * settling * stroke * LABEL_BRIGHTNESS[trace.labelTier];
  label.visible = opacity > .035; label.text = trace.labelCaption; label.opacity = opacity;
  label.width = labelWidth; label.fontSize = fontSize; label.align = align;
  return label;
}

// The positioned dialog owns both renderers: mobile browser chrome must not
// stretch a viewport-sized backing surface inside its smaller 100svh clip.
// getLayout supplies host-local CSS coordinates, measured once on resize.
// One canvas replaces the animated SVG tree on capable browsers. Curves and
// wire captions are prepared once; frames only stroke cached
// paths and copy cached glyphs. The SVG renderer below is a compatibility path.
function createCanvasLayer(host, document) {
  const view = document?.defaultView || globalThis;
  const Path = view.Path2D || globalThis.Path2D;
  if (!host?.append || !document?.createElement || !Path) return null;
  const canvas = document.createElement('canvas');
  let context;
  try { context = canvas.getContext?.('2d', {alpha: true}); } catch { return null; }
  if (!context?.setLineDash || !context.drawImage) return null;
  const atlas = document.createElement('canvas');
  let atlasContext;
  try { atlasContext = atlas.getContext?.('2d', {alpha: true}); } catch { return null; }
  if (!atlasContext?.fillText || !atlasContext.measureText) return null;
  canvas.setAttribute('class', 'intro-incoming-traces intro-incoming-canvas');
  canvas.setAttribute('aria-hidden', 'true'); canvas.setAttribute('data-renderer', 'canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:1;display:none';
  host.append(canvas);
  let width = 0, height = 0, ratio = 1, items = [], displayed = false, frames = 0;
  const dash = [0, 0], cellWidth = 128, cellHeight = 24, columns = 8;
  return {
    resize(nextWidth, nextHeight, traces) {
      width = nextWidth; height = nextHeight; ratio = Math.min(view.devicePixelRatio || 1, 2);
      // Keep logical CSS pixels and the bitmap in step. Percentage sizing
      // stretches old paths when mobile browser chrome changes the host first.
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      canvas.width = Math.max(1, Math.ceil(width * ratio)); canvas.height = Math.max(1, Math.ceil(height * ratio));
      context.setTransform(canvas.width / Math.max(1, width), 0, 0, canvas.height / Math.max(1, height), 0, 0);
      context.lineCap = 'round'; context.lineJoin = 'round';
      canvas.setAttribute('data-count', traces.length); canvas.setAttribute('data-label-count', traces.length);
      const entries = traces.reduce((total, trace) => total + trace.finalWave + 1, 0);
      atlas.width = Math.ceil(columns * cellWidth * ratio);
      atlas.height = Math.max(1, Math.ceil(Math.ceil(entries / columns) * cellHeight * ratio));
      atlasContext.setTransform(ratio, 0, 0, ratio, 0, 0);
      atlasContext.textAlign = 'left'; atlasContext.textBaseline = 'middle';
      let fontFamily = 'monospace';
      try { fontFamily = view.getComputedStyle?.(host).getPropertyValue('--mono').trim() || fontFamily; } catch { /* System monospace fallback. */ }
      let entry = 0;
      items = traces.map(trace => {
        const path = new Path();
        path.moveTo(trace.points[0].x, trace.points[0].y);
        for (let i = 1; i < trace.points.length; i++) path.lineTo(trace.points[i].x, trace.points[i].y);
        const color = trace.role === 'internal' ? '#f27620' : '#165fc9';
        const fontSize = (width <= 700 ? LABEL_COMPACT : LABEL_DESKTOP)[trace.labelTier];
        atlasContext.font = `${fontSize}px ${fontFamily}`; atlasContext.fillStyle = color;
        if ('letterSpacing' in atlasContext) atlasContext.letterSpacing = `${fontSize * .02}px`;
        const captions = [];
        for (let wave = 0; wave <= trace.finalWave; wave++) {
          const x = entry % columns * cellWidth, y = Math.floor(entry / columns) * cellHeight;
          const text = captionFor(trace, wave), advance = atlasContext.measureText(text).width;
          atlasContext.fillText(text, x + 4, y + cellHeight / 2 + .3);
          captions.push({x: x * ratio, y: y * ratio, advance}); entry++;
        }
        return {path, color, captions, frame: {}, tip: {}, label: {}};
      });
    },
    paint(traces, progress, active) {
      const visible = active && progress > 0 && progress < 1;
      if (displayed !== visible) { canvas.style.display = visible ? 'block' : 'none'; displayed = visible; }
      if (!visible) return;
      frames++; context.clearRect(0, 0, width, height);
      for (let i = 0; i < traces.length; i++) {
        const trace = traces[i], item = items[i], frame = sampleTrace(trace, progress, item.frame);
        if (frame.opacity <= 0) continue;
        dash[0] = Math.max(0, trace.length * (frame.travel-frame.tail)); dash[1] = trace.length + 2;
        context.setLineDash(dash); context.lineDashOffset = -trace.length * frame.tail;
        context.strokeStyle = item.color;
        context.globalAlpha = frame.opacity * .065; context.lineWidth = 3.1; context.stroke(item.path);
        context.globalAlpha = frame.opacity * .64; context.lineWidth = .9; context.stroke(item.path);
        const tip = pointAt(trace, frame.travel, item.tip);
        context.globalAlpha = frame.opacity * .78 * (frame.travel >= 1 ? .65 : 1);
        context.fillStyle = item.color; context.beginPath(); context.arc(tip.x, tip.y, 1.45, 0, Math.PI * 2); context.fill();
        const label = sampleLabel(trace, frame, width, height, item.label);
        if (label.visible) {
          const caption = item.captions[frame.wave];
          const x = label.align === 'end' ? label.x - 2 - caption.advance - 4 : label.x + 2 - 4;
          context.globalAlpha = label.opacity;
          context.drawImage(atlas, caption.x, caption.y, cellWidth * ratio, cellHeight * ratio,
            x, label.y - cellHeight / 2, cellWidth, cellHeight);
        }
      }
      context.globalAlpha = 1;
    },
    get frames() { return frames; },
    dispose() { canvas.remove(); canvas.width = atlas.width = 0; canvas.height = atlas.height = 0; items = []; },
  };
}

export function createIncomingTraces({ host, getLayout, reducedMotion = false } = {}) {
  let svg = null, canvasLayer = null, traces = [], groups = [], begun = false, disposed = false, progress = 1, width = 0, height = 0;
  const document = host?.ownerDocument || globalThis.document;
  function make(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    return element;
  }
  function ensureSvg() {
    if (svg || !host?.append || !document?.createElementNS) return;
    svg = make('svg', { class: 'intro-incoming-traces', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none' });
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:1;display:none';
    host.append(svg);
  }
  function rebuild() {
    const layout = getLayout?.() || {};
    width = Number(layout.width) || 0; height = Number(layout.height) || 0;
    traces = buildIncomingTraceLayout(layout);
    canvasLayer ||= createCanvasLayer(host, document);
    if (canvasLayer) { canvasLayer.resize(width, height, traces); return; }
    ensureSvg(); groups = [];
    if (!svg) return;
    svg.style.width = `${width}px`; svg.style.height = `${height}px`;
    svg.setAttribute('viewBox', `0 0 ${Math.max(1,width)} ${Math.max(1,height)}`);
    svg.replaceChildren();
    for (const trace of traces) {
      const color = trace.role === 'internal' ? '#f27620' : '#165fc9';
      const group = make('g', { opacity: 0, 'data-index': trace.index, 'data-side': trace.side,
        'data-source-index': trace.sourceIndex, 'data-lane': trace.lane });
      const points = trace.points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
      const ghost = make('polyline', { points, fill: 'none', stroke: color, 'stroke-width': 3.1, 'stroke-opacity': .065,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' });
      const wire = make('polyline', { points, fill: 'none', stroke: color, 'stroke-width': .9, 'stroke-opacity': .64,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' });
      const tip = make('circle', { r: 1.45, fill: color, 'fill-opacity': .78 });
      group.append(ghost, wire, tip);
      let label = null;
      {
        const node = make('g', {class: 'intro-trace-label', opacity: 0, 'aria-hidden': 'true'});
        const text = make('text', {y: .3, fill: color, 'dominant-baseline': 'central',
          'font-family': 'var(--mono,monospace)', 'letter-spacing': '.02em'});
        node.append(text); group.append(node);
        label = {node, text, wave: null};
      }
      svg.append(group);
      groups.push({ group, ghost, wire, tip, label });
    }
  }
  function paint() {
    if (canvasLayer) { canvasLayer.paint(traces, progress, begun && !reducedMotion); return; }
    if (!svg) return;
    const visible = begun && !reducedMotion && progress > 0 && progress < 1;
    svg.style.display = visible ? 'block' : 'none';
    for (let i=0; i<traces.length; i++) {
      const trace=traces[i], item=groups[i];
      if (!item) continue;
      const frame=sampleTrace(trace,progress), {travel,tail,opacity}=frame;
      const dash=`${Math.max(0,trace.length*(travel-tail)).toFixed(2)} ${(trace.length+2).toFixed(2)}`;
      item.group.setAttribute('opacity', String(visible ? opacity : 0));
      if (item.phase !== frame.phase) {
        item.group.setAttribute('data-phase', frame.phase); item.phase = frame.phase;
      }
      item.ghost.setAttribute('stroke-dasharray',dash); item.wire.setAttribute('stroke-dasharray',dash);
      if (item.tail !== tail) {
        const offset=String(-trace.length*tail);
        item.ghost.setAttribute('stroke-dashoffset',offset); item.wire.setAttribute('stroke-dashoffset',offset);
        item.tail=tail;
      }
      const tip=pointAt(trace,travel); item.tip.setAttribute('cx',tip.x.toFixed(2)); item.tip.setAttribute('cy',tip.y.toFixed(2));
      item.tip.setAttribute('opacity',travel >= 1 ? '.65' : '1');
      if (item.label) {
        const label=sampleLabel(trace,frame,width,height);
        if (item.label.wave !== frame.wave) {
          item.label.text.textContent=label.text;
          item.label.node.setAttribute('data-wave',frame.wave);
          item.label.text.setAttribute('font-size',label.fontSize);
          item.label.wave=frame.wave;
        }
        item.label.node.setAttribute('transform',`translate(${label.x.toFixed(2)} ${label.y.toFixed(2)})`);
        item.label.node.setAttribute('opacity',String(visible && label.visible && opacity>0 ? label.opacity/opacity : 0));
        if (item.label.align !== label.align) {
          item.label.text.setAttribute('text-anchor',label.align);
          item.label.text.setAttribute('x',label.align==='end'?-2:2);
          item.label.align=label.align;
        }
      }
    }
  }
  return {
    begin() { if (disposed) return; begun=true; progress=0; if (!reducedMotion) rebuild(); paint(); },
    setProgress(value) {
      if (disposed) return;
      progress=clamp(Number(value)||0,0,1);
      if (begun && !reducedMotion && (!traces.length || (!canvasLayer && !groups.length))) rebuild();
      paint();
    },
    resize() { if (disposed || !begun || reducedMotion) return; rebuild(); paint(); },
    finish() { if (disposed) return; progress=1; begun=false; paint(); },
    getState() {
      return { active:begun && !reducedMotion && (!!svg || !!canvasLayer) && progress>0 && progress<1, progress, width, height, count:traces.length, renderer:canvasLayer ? 'canvas' : svg ? 'svg' : 'none', canvasFrames:canvasLayer?.frames || 0,
        traces:traces.map(trace=>{const frame=sampleTrace(trace,progress);
          const showing=begun&&!reducedMotion&&progress>0&&progress<1;
          const label=sampleLabel(trace,frame,width,height);
          return {index:trace.index,sourceIndex:trace.sourceIndex,lane:trace.lane,side:trace.side,role:trace.role,origin:{...trace.origin},anchor:{...trace.anchor},start:trace.start,arrival:trace.arrival,length:trace.length,
            ...frame,head:pointAt(trace,frame.travel),opacity:showing?frame.opacity:0,
            label:{...label,visible:showing&&label.visible,opacity:showing?label.opacity:0}};}) };
    },
    dispose() { if (disposed) return; disposed=true; begun=false; canvasLayer?.dispose(); canvasLayer=null; svg?.remove(); svg=null; groups=[]; traces=[]; },
  };
}
