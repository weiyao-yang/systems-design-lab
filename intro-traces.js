// Temporary incoming wires use viewport coordinates; the final machine stays
// in its original Three.js canvas and is never replaced or translated.
const SVG_NS = 'http://www.w3.org/2000/svg';
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const smooth = n => n * n * (3 - 2 * n);
const fraction = n => n - Math.floor(n);

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
    const arrival = baseArrival + (anchor.lane ? .035 + fraction(index * .2718281828) * .035 : 0);
    const trace = { index, sourceIndex: anchor.sourceIndex, lane: anchor.lane, side,
      role: anchor.role === 'internal' ? 'internal' : 'shell', origin, anchor: end, points, lengths,
      length, start: Math.max(.015, arrival - .20), arrival, fadeEnd: arrival + .065,
      cycleTravel: .185 + fraction(index * .38196601125) * .025,
      cycleRest: .055 };
    const period = trace.cycleTravel + trace.cycleRest;
    // Extend an already scheduled wave instead of restarting the path when
    // the ending begins. Its outside tail will follow it into the machine.
    trace.finalDeparture = trace.fadeEnd + Math.max(0, Math.floor((.82 - trace.fadeEnd) / period)) * period;
    trace.finalWave = 1 + Math.round((trace.finalDeparture - trace.fadeEnd) / period);
    trace.finalContact = .985 + fraction(index * .7548776662) * .015;
    return trace;
  });
  // Keep one visible final arrival on every side until the exact last frame.
  // A central anchor also avoids choosing a cropped wheel on short phones.
  for (let side = 0; side < 4; side++) {
    const candidates = traces.filter(trace => trace.side === side);
    const score = trace => Math.hypot((trace.anchor.x - width / 2) / width, (trace.anchor.y - height / 2) / height);
    const leader = candidates.reduce((best, trace) => !best || score(trace) < score(best) ? trace : best, null);
    if (leader) leader.finalContact = 1;
  }
  // Every wire carries data; size and brightness create a readable hierarchy.
  traces.forEach(trace => { trace.labelTier = trace.index % 7 === 0 ? 2 : trace.index % 3 === 0 ? 1 : 0; });
  return traces;
}

function pointAt(trace, progress) {
  const distance = trace.length * progress;
  let end = 1;
  while (end < trace.lengths.length - 1 && trace.lengths[end] < distance) end++;
  const a = trace.points[end - 1], b = trace.points[end];
  const t = clamp((distance - trace.lengths[end - 1]) / Math.max(1e-8, trace.lengths[end] - trace.lengths[end - 1]), 0, 1);
  return { x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t };
}

function sampleTrace(trace, progress) {
  let departure = trace.start, contact = trace.arrival, fadeEnd = trace.fadeEnd, wave = 0;
  if (progress >= trace.finalDeparture) {
    departure = trace.finalDeparture; contact = trace.finalContact; wave = trace.finalWave;
    const travel = smooth(clamp((progress - departure) / (contact - departure), 0, 1));
    const drainStart = Math.max(departure, contact - .20);
    const drained = smooth(clamp((progress - drainStart) / (1 - drainStart), 0, 1));
    const tail = travel * drained;
    const remainingPixels = (travel - tail) * trace.length;
    // The opacity follows the physical shrinking stroke, rather than hiding
    // the entire field in one short fade. Both tail and head arrive at rest.
    const opacity = progress >= 1 ? 0 : smooth(clamp(remainingPixels / 12, 0, 1));
    return { wave, departure, contact, fadeEnd: 1, travel, tail, final: true, opacity,
      phase: progress < drainStart ? 'approach' : 'drain' };
  }
  if (progress > trace.fadeEnd) {
    const period = trace.cycleTravel + trace.cycleRest;
    wave = 1 + Math.floor((progress - trace.fadeEnd) / period);
    departure = trace.fadeEnd + (wave - 1) * period;
    contact = departure + trace.cycleTravel;
    fadeEnd = departure + period;
  }
  const travel = smooth(clamp((progress - departure) / (contact - departure), 0, 1));
  const tail = 1 - smooth(clamp((progress - contact - .012) / (fadeEnd - contact - .012), 0, 1));
  return { wave, departure, contact, fadeEnd, travel, tail: 0, final: false,
    opacity: progress <= departure || progress >= 1 ? 0 : tail,
    phase: progress <= departure ? 'waiting' : progress < contact ? 'approach' : progress < contact + .012 ? 'contact' : 'fade' };
}

function sampleLabel(trace, frame, width, height) {
  if (trace.labelWave !== frame.wave) {
    const names = ['NODE', 'VECTOR', 'LINK', 'FIELD', 'SIGNAL'];
    const id = String((trace.index * 37 + frame.wave * 97) % 997).padStart(3, '0');
    const value = ((trace.index * 113 + frame.wave * 227) % 997 / 997).toFixed(3).slice(1);
    trace.labelCaption = `${names[trace.index % names.length]}_${id} ${value}`;
    trace.labelWave = frame.wave;
  }
  const fontSize = (width <= 700 ? [5.2, 6.5, 8] : [5.5, 7.2, 9])[trace.labelTier];
  const labelWidth = trace.labelCaption.length * fontSize * .62 + 10;
  const position = pointAt(trace, Math.max(frame.tail, frame.travel - .035 - trace.index % 3 * .018));
  const align = position.x + labelWidth > width - 8 ? 'end' : 'start';
  const left = position.x + (align === 'end' ? -labelWidth + 4 : -4);
  const edgeClearance = Math.min(left - 4, width - 4 - left - labelWidth, position.y - 12, height - 12 - position.y);
  const edgeOpacity = smooth(clamp(edgeClearance / 12, 0, 1));
  const arriving = smooth(clamp((frame.travel - .07) / .13, 0, 1));
  const settling = 1 - smooth(clamp((frame.travel - .77) / .16, 0, 1));
  const stroke = smooth(clamp(((frame.travel - frame.tail) * trace.length - 16) / 28, 0, 1));
  const opacity = edgeOpacity * frame.opacity * arriving * settling * stroke * [.62, .82, 1][trace.labelTier];
  return {visible: opacity > .035, text: trace.labelCaption, x: position.x, y: position.y,
    opacity, width: labelWidth, fontSize, align};
}

export function createIncomingTraces({ host, getLayout, reducedMotion = false } = {}) {
  let svg = null, traces = [], groups = [], begun = false, disposed = false, progress = 1, width = 0, height = 0;
  const document = host?.ownerDocument || globalThis.document;
  function make(tag, attributes = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
    return element;
  }
  function ensureSvg() {
    if (svg || !host?.append || !document?.createElementNS) return;
    svg = make('svg', { class: 'intro-incoming-traces', 'aria-hidden': 'true', focusable: 'false', preserveAspectRatio: 'none' });
    svg.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:1;display:none';
    host.append(svg);
  }
  function rebuild() {
    const layout = getLayout?.() || {};
    width = Number(layout.width) || 0; height = Number(layout.height) || 0;
    traces = buildIncomingTraceLayout(layout);
    ensureSvg(); groups = [];
    if (!svg) return;
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
      if (begun && !reducedMotion && !groups.length) rebuild();
      paint();
    },
    resize() { if (disposed || !begun || reducedMotion) return; rebuild(); paint(); },
    finish() { if (disposed) return; progress=1; begun=false; paint(); },
    getState() {
      return { active:begun && !reducedMotion && !!svg && progress>0 && progress<1, progress, width, height, count:traces.length,
        traces:traces.map(trace=>{const frame=sampleTrace(trace,progress);
          const showing=begun&&!reducedMotion&&progress>0&&progress<1;
          const label=sampleLabel(trace,frame,width,height);
          return {index:trace.index,sourceIndex:trace.sourceIndex,lane:trace.lane,side:trace.side,role:trace.role,origin:{...trace.origin},anchor:{...trace.anchor},start:trace.start,arrival:trace.arrival,length:trace.length,
            ...frame,head:pointAt(trace,frame.travel),opacity:showing?frame.opacity:0,
            label:{...label,visible:showing&&label.visible,opacity:showing?label.opacity:0}};}) };
    },
    dispose() { if (disposed) return; disposed=true; begun=false; svg?.remove(); svg=null; groups=[]; traces=[]; },
  };
}
