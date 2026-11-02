// The dialog is a real occluder: near links stay behind its right edge, while
// the complete elbow/forearm/tool subtree can pass in front of that edge.
export function createModalRig(THREE, {
  camera, scene, renderer, arm, shoulder, elbow, wrist, upperLink, forearmLink,
  shoulderTransmission, contactAnchor, getViewport, prepareContact, reducedMotion = false,
} = {}) {
  let enabled = false, active = null, pending = null, phase = 'hidden', layer = 'behind', wanted = false;
  let prepared = false, elapsed = 0, duration = 0, startProgress = 0, edgeProgress = 0, reachProgress = 0;
  let contactPixel = null, errorPixels = null, scale = 1, layout = null, fitKey = '';
  let distalBounds = null, proximalBounds = null, visibleBounds = null;
  let pressRequested = false, pendingPress = false, pressProgress = 0;
  let returningPress = null;
  // Keep the edge detour short enough to feel attached to a hover gesture.
  const timing = reducedMotion
    ? { emerge: .025, reach: .045, withdraw: .035, tuck: .025 }
    : { emerge: .08, reach: .16, withdraw: .10, tuck: .07 };
  const compactTiming = reducedMotion
    ? { emerge: .025, reach: .045, precontact: .020, press: .040 }
    : { emerge: .080, reach: .240, precontact: .050, press: .080 };
  const fittedLayouts = new Map();
  const homeScale = arm.scale.clone(), homePosition = arm.position.clone();
  const raycaster = new THREE.Raycaster(), plane = new THREE.Plane();
  const normal = new THREE.Vector3(), origin = new THREE.Vector3(), hit = new THREE.Vector3();
  const world = new THREE.Vector3(), projected = new THREE.Vector3(), inverseArm = new THREE.Matrix4();
  const oldScissor = new THREE.Vector4(), cornerCache = new WeakMap();
  const screenBounds = new WeakMap();
  const screenPoints = new WeakMap();
  const distal = [], proximal = [], drawables = [];
  const distalSet = new Set();
  elbow.traverse(object => { if (object.geometry?.attributes?.position) distalSet.add(object); });
  scene.traverse(object => {
    if (!object.geometry?.attributes?.position || !object.visible) return;
    drawables.push(object); (distalSet.has(object) ? distal : proximal).push(object);
  });
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const smooth = value => value * value * (3 - 2 * value);
  const copy = value => value ? { ...value } : null;
  const viewport = () => { const v = getViewport(); return { width: Math.max(1, v.width), height: Math.max(1, v.height) }; };
  const union = (a, b) => !a ? copy(b) : !b ? copy(a) : ({ left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) });
  function intersect(bounds, rectangle) {
    if (!bounds) return null;
    const result = { left: Math.max(bounds.left, rectangle.left), right: Math.min(bounds.right, rectangle.right), top: Math.max(bounds.top, rectangle.top), bottom: Math.min(bounds.bottom, rectangle.bottom) };
    return result.right > result.left && result.bottom > result.top ? result : null;
  }
  function specification(input) {
    if (!input?.target || !input?.panel || !input?.gate) return null;
    const result = {
      kind: input.kind === 'next' ? 'next' : 'close',
      mobileNext: input.kind === 'next' && input.mobileNext === true,
      target: { x: Number(input.target.x), y: Number(input.target.y) },
      panel: { left: Number(input.panel.left), right: Number(input.panel.right), top: Number(input.panel.top), bottom: Number(input.panel.bottom) },
      gate: { left: Number(input.gate.left), top: Number(input.gate.top), bottom: Number(input.gate.bottom) },
    };
    return [...Object.values(result.target), ...Object.values(result.panel), ...Object.values(result.gate)].every(Number.isFinite) ? result : null;
  }
  function corners(geometry) {
    if (cornerCache.has(geometry)) return cornerCache.get(geometry);
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox, result = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) result.push(new THREE.Vector3(x, y, z));
    cornerCache.set(geometry, result); return result;
  }
  function boundsOf(objects) {
    const { width, height } = viewport();
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const object of objects) {
      const bounds = screenBounds.get(object) || {};
      const points = active?.mobileNext && distalSet.has(object) ? (screenPoints.get(object) || []) : null;
      let pointIndex = 0;
      bounds.left = Infinity; bounds.right = -Infinity; bounds.top = Infinity; bounds.bottom = -Infinity;
      for (const corner of corners(object.geometry)) {
        projected.copy(corner).applyMatrix4(object.matrixWorld).project(camera);
        if (!Number.isFinite(projected.x + projected.y)) continue;
        const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
        if (points) {
          const point = points[pointIndex] || (points[pointIndex] = {});
          point.x = x; point.y = y; pointIndex++;
        }
        bounds.left = Math.min(bounds.left, x); bounds.right = Math.max(bounds.right, x);
        bounds.top = Math.min(bounds.top, y); bounds.bottom = Math.max(bounds.bottom, y);
      }
      screenBounds.set(object, bounds);
      if (points) { points.length = pointIndex; screenPoints.set(object, points); }
      left = Math.min(left, bounds.left); right = Math.max(right, bounds.right);
      top = Math.min(top, bounds.top); bottom = Math.max(bottom, bounds.bottom);
    }
    return Number.isFinite(left) ? { left, right, top, bottom } : null;
  }
  // Clip each projected part's convex hull. A long diagonal rail's enclosing
  // rectangle includes empty offscreen space and cannot measure its silhouette.
  function clippedDistalBounds(rectangle, precise = false) {
    let result = null;
    const measuredLines = new Map();
    const clipMatrix = new THREE.Matrix4(), vertexA = new THREE.Vector3(), vertexB = new THREE.Vector3();
    const cross = (a, b, c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    for (const object of distal) {
      const bounds = screenBounds.get(object);
      if (!intersect(bounds, rectangle)) continue;
      if (precise && object.material?.colorWrite === false) continue;
      // A technical-drawing batch can contain disconnected shapes. Clip its
      // real line segments during fitting, rather than its empty convex hull.
      if (precise && object.isLineSegments) {
        if (measuredLines.get(object.geometry)?.equals(object.matrixWorld)) continue;
        measuredLines.set(object.geometry,object.matrixWorld);
        clipMatrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse).multiply(object.matrixWorld);
        const positions=object.geometry.attributes.position,index=object.geometry.index,count=index ? index.count : positions.count;
        const {width,height}=viewport();
        for (let i=0;i+1<count;i+=2) {
          vertexA.fromBufferAttribute(positions,index ? index.getX(i) : i).applyMatrix4(clipMatrix);
          vertexB.fromBufferAttribute(positions,index ? index.getX(i+1) : i+1).applyMatrix4(clipMatrix);
          const ax=(vertexA.x+1)*width/2,ay=(1-vertexA.y)*height/2,bx=(vertexB.x+1)*width/2,by=(1-vertexB.y)*height/2,dx=bx-ax,dy=by-ay;
          let from=0,to=1,valid=true;
          for (let edge=0;edge<4;edge++) {
            const p=edge===0?-dx:edge===1?dx:edge===2?-dy:dy;
            const q=edge===0?ax-rectangle.left:edge===1?rectangle.right-ax:edge===2?ay-rectangle.top:rectangle.bottom-ay;
            if (Math.abs(p)<1e-12) { if (q<0) {valid=false;break;} continue; }
            const t=q/p;
            if (p<0) from=Math.max(from,t); else to=Math.min(to,t);
            if (from>to) {valid=false;break;}
          }
          if (valid) {
            const x1=ax+dx*from,x2=ax+dx*to,y1=ay+dy*from,y2=ay+dy*to;
            const left=Math.min(x1,x2),right=Math.max(x1,x2),top=Math.min(y1,y2),bottom=Math.max(y1,y2);
            if (!result) result={left,right,top,bottom};
            else { result.left=Math.min(result.left,left);result.right=Math.max(result.right,right);result.top=Math.min(result.top,top);result.bottom=Math.max(result.bottom,bottom); }
          }
        }
        continue;
      }
      if (bounds.left >= rectangle.left && bounds.right <= rectangle.right && bounds.top >= rectangle.top && bounds.bottom <= rectangle.bottom) {
        result = union(result, bounds); continue;
      }
      const points = (screenPoints.get(object) || []).slice().sort((a,b) => a.x-b.x || a.y-b.y);
      if (!points.length) continue;
      const lower = [], upper = [];
      for (const p of points) { while (lower.length > 1 && cross(lower.at(-2),lower.at(-1),p) <= 0) lower.pop(); lower.push(p); }
      for (const p of points.slice().reverse()) { while (upper.length > 1 && cross(upper.at(-2),upper.at(-1),p) <= 0) upper.pop(); upper.push(p); }
      let polygon = lower.slice(0,-1).concat(upper.slice(0,-1));
      for (const [axis, limit, sign] of [['x',rectangle.left,1],['x',rectangle.right,-1],['y',rectangle.top,1],['y',rectangle.bottom,-1]]) {
        const clipped = [];
        for (let i=0; i<polygon.length; i++) {
          const a=polygon[i], b=polygon[(i+1)%polygon.length];
          const insideA=(a[axis]-limit)*sign >= 0, insideB=(b[axis]-limit)*sign >= 0;
          if (insideA) clipped.push(a);
          if (insideA !== insideB) { const t=(limit-a[axis])/(b[axis]-a[axis]); clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}); }
        }
        polygon = clipped;
      }
      if (polygon.length) result=union(result,{left:Math.min(...polygon.map(p=>p.x)),right:Math.max(...polygon.map(p=>p.x)),top:Math.min(...polygon.map(p=>p.y)),bottom:Math.max(...polygon.map(p=>p.y))});
    }
    return result;
  }
  function refreshBounds() {
    distalBounds = boundsOf(distal);
    // The compact reach deliberately conceals the chassis and upper arm.
    // Avoid projecting their many hidden parts on every mobile frame.
    proximalBounds = active?.mobileNext ? null : boundsOf(proximal);
    const { width, height } = viewport();
    const screen = { left: 0, right: width, top: 0, bottom: height };
    const outside = { ...screen, left: active?.panel.right ?? width };
    if (active?.mobileNext) { visibleBounds = clippedDistalBounds(layer === 'foreground' ? screen : outside); return; }
    visibleBounds = layer === 'foreground'
      ? union(intersect(proximalBounds, outside), intersect(distalBounds, screen))
      : intersect(union(proximalBounds, distalBounds), outside);
  }
  function localOnPlane(pixel, z) {
    const { width, height } = viewport();
    origin.set(0, 0, z); arm.localToWorld(origin);
    plane.setFromNormalAndCoplanarPoint(normal, origin);
    raycaster.setFromCamera(new THREE.Vector2(pixel.x / width * 2 - 1, 1 - pixel.y / height * 2), camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return hit.clone().applyMatrix4(inverseArm);
  }
  function translated(pose, x) {
    return { contact: { x: pose.contact.x + x, y: pose.contact.y }, elbow: { x: pose.elbow.x + x, y: pose.elbow.y }, phi: pose.phi };
  }
  function blend(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
  function edgePose(t) {
    return { contact: blend(layout.tucked.contact, layout.outer.contact, t), elbow: blend(layout.tucked.elbow, layout.outer.elbow, t), phi: layout.tucked.phi + (layout.outer.phi - layout.tucked.phi) * t };
  }
  function reachPose(t) {
    const a = layout.outer.contact, d = active.mobileNext ? blend(layout.precontact.contact, layout.final.contact, pressProgress) : layout.final.contact, direction = active.kind === 'close' ? 1 : -1;
    const b = { x: a.x, y: d.y + direction * 30 }, c = { x: active.panel.right + 16, y: d.y };
    const s = 1 - t;
    return {
      contact: { x: s*s*s*a.x + 3*s*s*t*b.x + 3*s*t*t*c.x + t*t*t*d.x, y: s*s*s*a.y + 3*s*s*t*b.y + 3*s*t*t*c.y + t*t*t*d.y },
      elbow: blend(layout.outer.elbow, layout.final.elbow, t),
      phi: layout.outer.phi + (layout.final.phi - layout.outer.phi) * t,
    };
  }
  function applyPose(offset, amount = 0, candidate = layout, route = null) {
    const { width, height } = viewport();
    scale = homeScale.x;
    let yaw = Math.atan2(camera.position.x - arm.position.x, camera.position.z - arm.position.z);
    if (active.kind === 'next') {
      // Turn from the actual shoulder toward a contact in front of it, as on
      // the homepage. The base stays put while the links extend around it.
      raycaster.setFromCamera(new THREE.Vector2(active.target.x / width * 2 - 1, 1 - active.target.y / height * 2), camera);
      let distance = -raycaster.ray.origin.z / raycaster.ray.direction.z;
      if (raycaster.ray.direction.y < 0) distance = Math.min(distance, (-1.30 - raycaster.ray.origin.y) / raycaster.ray.direction.y);
      const contact = raycaster.ray.at(Math.max(.5, distance), new THREE.Vector3()).sub(arm.position);
      const radius = Math.hypot(contact.x, contact.z);
      yaw = Math.asin(clamp(offset.z / Math.max(radius, Math.abs(offset.z) + 1e-5), -1, 1)) - Math.atan2(contact.z, contact.x);
    }
    arm.rotation.y = yaw; arm.scale.copy(homeScale); arm.updateWorldMatrix(true, false);
    normal.set(Math.sin(yaw), 0, Math.cos(yaw)); inverseArm.copy(arm.matrixWorld).invert();
    const target = localOnPlane(route?.contact || { x: active.target.x + amount, y: active.target.y }, offset.z);
    const hinge = localOnPlane(route?.elbow || { x: candidate.elbow.x + amount, y: candidate.elbow.y }, 0);
    if (!target || !hinge) return null;
    // NEXT extends the forearm and tool along one line; a forced horizontal
    // claw on a downward forearm would put a sharp kink at the wrist.
    const phi = active.kind === 'next' ? Math.atan2(target.y - hinge.y, target.x - hinge.x) : route?.phi ?? Math.PI;
    const wristX = target.x - offset.x * Math.sin(phi) - offset.y * Math.cos(phi);
    const wristY = target.y + offset.x * Math.cos(phi) - offset.y * Math.sin(phi);
    const requestedL2 = Math.hypot(hinge.x - wristX, hinge.y - wristY);
    if (route) for (let i = 0; i < 4; i++) {
      const first = Math.hypot(hinge.x, hinge.y);
      if (first < 1.52) { hinge.x *= 1.52 / Math.max(first, 1e-8); hinge.y *= 1.52 / Math.max(first, 1e-8); }
      const dx = hinge.x - wristX, dy = hinge.y - wristY, second = Math.hypot(dx, dy);
      if (second < 1.36) { hinge.x = wristX + dx * 1.36 / Math.max(second, 1e-8); hinge.y = wristY + dy * 1.36 / Math.max(second, 1e-8); }
    }
    const q1 = Math.atan2(hinge.y, hinge.x), q2 = Math.atan2(wristY - hinge.y, wristX - hinge.x) - q1;
    const l1 = Math.hypot(hinge.x, hinge.y), l2 = Math.hypot(wristX - hinge.x, wristY - hinge.y);
    shoulder.rotation.z = q1 - Math.PI / 2; elbow.rotation.z = q2; wrist.rotation.z = phi - q1 - q2;
    elbow.position.y = l1; wrist.position.y = l2;
    upperLink.setLength(l1); forearmLink.setLength(l2); shoulderTransmission.update();
    arm.updateWorldMatrix(true, true);
    contactAnchor.getWorldPosition(world).project(camera);
    contactPixel = { x: (world.x + 1) * width / 2, y: (1 - world.y) * height / 2 };
    errorPixels = Math.hypot(contactPixel.x - active.target.x, contactPixel.y - active.target.y);
    return { l1, l2, requestedL2 };
  }
  function fit(offset) {
    const { width, height } = viewport(), gutter = Math.max(10, width - active.panel.right);
    // Both reaches remain attached to the homepage shoulder and base.
    arm.position.copy(homePosition);
    const projection = camera.projectionMatrix.elements;
    const key = [Number(active.mobileNext), width, height, projection[0], projection[5], projection[8], projection[9], ...arm.position.toArray(), ...Object.values(active.panel), active.target.x, active.target.y, offset.x, offset.y, offset.z].map(n => String(Number(n.toFixed(5)))).join(',');
    if (key === fitKey && layout) return false;
    if (fittedLayouts.has(key)) {
      layout = fittedLayouts.get(key); fitKey = key;
      return true;
    }
    const unitPixels = height * projection[5] * homeScale.x / (2 * camera.position.distanceTo(arm.position));
    const fitted = {
      scale: homeScale.x,
      elbow: {
        x: active.panel.right + gutter * (active.kind === 'next' ? .55 : .60),
        y: clamp(active.target.y + (active.kind === 'close' ? Math.max(50, 1.8 * unitPixels) : -Math.min(360, Math.max(140, height * .38))), 12, height - 12),
      },
    };
    const direction = active.kind === 'close' ? 1 : -1;
    // Keep the home's full-size parts. Screen edges may crop the reaching arm;
    // the width of the dialog gutter must never shrink the model itself.
    layout = fitted;
    if (active.mobileNext) {
      const screen = {left:0,right:width,top:0,bottom:height};
      const desiredHeight = Math.min(height*.26, Math.max(height*.22, 200*height/844));
      let best = null;
      // Move the elbow offscreen rather than changing the machine's scale.
      for (let i=0; i<9; i++) {
        const candidate = {x:width*(1.25+i*.05),y:height*.60};
        layout.elbow=candidate;
        applyPose(offset,0); refreshBounds();
        const bounds=clippedDistalBounds(screen,true);
        if (!bounds) continue;
        const score=Math.abs(bounds.bottom-bounds.top-desiredHeight)+Math.abs(bounds.right-bounds.left-width*.20)*.5;
        if (!best || score<best.score) best={score,elbow:candidate};
      }
      if (best) layout.elbow=best.elbow;
    }
    applyPose(offset, 0); refreshBounds();
    layout.final = { contact: copy(active.target), elbow: copy(layout.elbow), phi: Math.PI };
    if (active.mobileNext) {
      layout.footprintBounds=clippedDistalBounds({left:0,right:width,top:0,bottom:height},true);
      const dx=active.target.x-layout.elbow.x,dy=active.target.y-layout.elbow.y,distance=Math.max(1,Math.hypot(dx,dy));
      layout.precontact={contact:{x:active.target.x-dx/distance*8,y:active.target.y-dy/distance*8},elbow:copy(layout.elbow),phi:Math.PI};
    }
    let outer = {
      contact: { x: active.panel.right + clamp(gutter * .2, 18, 30), y: clamp(active.target.y + direction * Math.max(85, 120 * scale), 28, height - 28) },
      elbow: { x: Math.max(layout.elbow.x, active.panel.right + gutter * .95), y: clamp(layout.elbow.y + direction * Math.max(100, 135 * scale), 12, height - 12) },
      phi: Math.PI - direction * (reducedMotion ? .20 : .50),
    };
    for (let i = 0; i < 8; i++) {
      const lengths = applyPose(offset, 0, layout, outer);
      if (lengths.requestedL2 >= 1.36 * 1.05) break;
      outer.elbow.y = clamp(outer.elbow.y + direction * 16, 12, height - 12);
    }
    const leftAt = x => { applyPose(offset, 0, layout, translated(outer, x)); refreshBounds(); return distalBounds.left; };
    let outerLow = -64, outerHigh = 64;
    for (let i = 0; i < 10 && leftAt(outerLow) >= active.panel.right + 6; i++) outerLow *= 2;
    for (let i = 0; i < 10 && leftAt(outerHigh) < active.panel.right + 6; i++) outerHigh *= 2;
    for (let i = 0; i < 24; i++) {
      const middle = (outerLow + outerHigh) / 2;
      if (leftAt(middle) >= active.panel.right + 6) outerHigh = middle; else outerLow = middle;
    }
    outer = translated(outer, outerHigh); layout.outer = outer;
    const tucked = {
      contact: { x: outer.contact.x - 160, y: clamp(outer.contact.y + direction * 30, 28, height - 28) },
      elbow: { x: outer.elbow.x - 90, y: clamp(outer.elbow.y + direction * 10, 12, height - 12) },
      phi: Math.PI - direction * (reducedMotion ? .28 : .92),
    };
    const rightAt = x => {
      applyPose(offset, 0, layout, translated(tucked, x)); refreshBounds();
      return active.mobileNext ? distalBounds.right : Math.max(distalBounds.right, proximalBounds.right);
    };
    let low = -64, high = 64;
    for (let i = 0; i < 10 && rightAt(low) > active.panel.right - 3; i++) low *= 2;
    for (let i = 0; i < 10 && rightAt(high) <= active.panel.right - 3; i++) high *= 2;
    for (let i = 0; i < 24; i++) {
      const middle = (low + high) / 2;
      if (rightAt(middle) <= active.panel.right - 3) low = middle; else high = middle;
    }
    layout.tucked = translated(tucked, low); fitKey = key;
    fittedLayouts.set(key, layout);
    if (fittedLayouts.size > 4) fittedLayouts.delete(fittedLayouts.keys().next().value);
    return true;
  }
  function begin(next, seconds) {
    phase = next; elapsed = 0;
    if (next === 'precontact') { startProgress=0; duration=seconds; return; }
    if (next === 'press') { startProgress=pressProgress; duration=seconds*(1-pressProgress); return; }
    startProgress = next === 'emerge' || next === 'tuck' ? edgeProgress : reachProgress;
    const destination = next === 'emerge' || next === 'reach' ? 1 : 0;
    // Reversing a partial reach only takes the remaining distance's time.
    duration = seconds * Math.abs(destination - startProgress);
    if (next === 'reach' && active?.mobileNext && returningPress > 0) duration=Math.max(duration,compactTiming.press);
  }
  function enter(spec, requested = false) { active = spec; pending = null; wanted = true; prepared = false; fitKey = ''; layer = 'behind'; phase = 'prepare'; pressRequested=requested; pendingPress=false; pressProgress=0; returningPress=null; }
  function setMode(value) {
    enabled = Boolean(value);
    if (!enabled) {
      active = null; pending = null; wanted = false; prepared = false; phase = 'hidden'; layer = 'behind';
      contactPixel = null; errorPixels = null; distalBounds = null; proximalBounds = null; visibleBounds = null;
      arm.scale.copy(homeScale);
      arm.position.copy(homePosition);
      pressRequested=false; pendingPress=false; pressProgress=0;
      returningPress=null;
      prepareContact?.(null);
    }
  }
  function retreat() {
    if (!active || phase === 'tuck' || phase === 'withdraw') return;
    begin(layer === 'foreground' ? 'withdraw' : 'tuck', layer === 'foreground' ? timing.withdraw : timing.tuck);
  }
  function aimAt(input) {
    if (!enabled) return;
    const spec = specification(input); if (!spec) return;
    if (!active) { enter(spec); return; }
    if (spec.kind === active.kind && spec.mobileNext === active.mobileNext) {
      active = spec; pending = null; wanted = true;
      if (phase === 'withdraw') {
        if (active.mobileNext) { returningPress=pressProgress; pressRequested=false; }
        begin('reach', active.mobileNext ? compactTiming.reach : timing.reach);
      } else if (phase === 'tuck') {
        if (active.mobileNext) { pressProgress=0; returningPress=null; pressRequested=false; }
        begin('emerge', active.mobileNext ? compactTiming.emerge : timing.emerge);
      }
      return;
    }
    if (pending?.kind !== spec.kind || pending?.mobileNext !== spec.mobileNext) pendingPress=false;
    pending = spec; wanted = false; retreat();
  }
  function requestPress(input) {
    const spec=specification(input);
    if (!enabled || !spec?.mobileNext) return false;
    if (active?.kind === 'next' && active.mobileNext) pressRequested=true;
    else if (pending?.kind === 'next' && pending.mobileNext) pendingPress=true;
    else { aimAt(spec); if (active?.mobileNext) pressRequested=true; else pendingPress=true; }
    return true;
  }
  function updateLayout(input) {
    const spec = specification(input); if (!spec) return;
    if (active?.kind === spec.kind) active = spec;
    if (pending?.kind === spec.kind) pending = spec;
  }
  function resetAim() { pending = null; wanted = false; pressRequested=false; pendingPress=false; retreat(); }
  function completeAim(input, offset) {
    const spec = specification(input);
    if (!enabled || !spec) return false;
    // On a very slow touch frame, present the exact contact pose before the
    // button action instead of letting a timeout bypass its visual feedback.
    enter(spec,true); offset=prepareContact?.(active) || offset; fit(offset);
    prepared = true; layer = 'foreground'; phase = 'hold';
    edgeProgress = 1; reachProgress = 1; elapsed = 0; duration = 0;
    pressProgress=active.mobileNext ? 1 : 0;
    applyPose(offset, 0, layout, layout.final); refreshBounds();
    return Boolean(visibleBounds);
  }
  function prepare(offset) {
    edgeProgress = 0; reachProgress = 0; layer = 'behind'; prepared = true;
    applyPose(offset, 0, layout, layout.tucked); refreshBounds();
    begin(wanted ? 'emerge' : 'tuck', wanted ? (active.mobileNext ? compactTiming.emerge : timing.emerge) : timing.tuck);
  }
  function update(dt, offset) {
    if (!enabled || !active) return;
    offset=prepareContact?.(active) || offset;
    fit(offset);
    if (!prepared) {
      prepare(offset);
      // Preparation starts fully occluded, then follows the same edge route
      // immediately; don't add a blank frame to every hover or target swap.
    }
    // Hidden tabs supply dt=0. Visible slow frames consume their actual wall
    // time so the gesture never becomes a multi-second animation queue.
    let remainingDt = Math.max(0, dt);
    for (let transition = 0; transition < 8; transition++) {
      elapsed += remainingDt;
      if (phase === 'precontact') {
        applyPose(offset,0,layout,reachPose(1)); refreshBounds();
        if (!pressRequested) { elapsed=Math.min(elapsed,duration); return; }
        if (elapsed<duration) return;
        remainingDt=Math.max(0,elapsed-duration); begin('press',compactTiming.press);
        if (!remainingDt) return;
        continue;
      }
      if (phase === 'press') {
        const progress=duration ? clamp(elapsed/duration,0,1) : 1;
        pressProgress=startProgress+(1-startProgress)*smooth(progress);
        applyPose(offset,0,layout,reachPose(1)); refreshBounds();
        if (progress<1) return;
        phase='hold'; return;
      }
      const progress = duration ? clamp(elapsed / duration, 0, 1) : 1;
      const edgePhase = phase === 'emerge' || phase === 'tuck';
      const destination = phase === 'reach' || phase === 'hold' || phase === 'emerge' ? 1 : 0;
      const amount = phase === 'hold' ? 1 : startProgress + (destination - startProgress) * smooth(progress);
      if (phase === 'reach' && active.mobileNext && returningPress !== null) pressProgress=returningPress*(1-smooth(progress));
      if (edgePhase) edgeProgress = amount; else reachProgress = amount;
      applyPose(offset, 0, layout, edgePhase ? edgePose(edgeProgress) : reachPose(reachProgress)); refreshBounds();
      if (progress < 1 || phase === 'hold') return;
      remainingDt = Math.max(0, elapsed - duration);
      if (phase === 'emerge') {
        if (distalBounds.left < active.panel.right + 3) return;
        layer = 'foreground'; reachProgress = 0; begin('reach', active.mobileNext ? compactTiming.reach : timing.reach); refreshBounds();
      } else if (phase === 'reach') {
        if (active.mobileNext) { pressProgress=0; returningPress=null; begin('precontact',compactTiming.precontact); }
        else { phase = 'hold'; return; }
      }
      else if (phase === 'withdraw') {
        if (distalBounds.left < active.panel.right + 3) return;
        layer = 'behind'; edgeProgress = 1; begin('tuck', timing.tuck); refreshBounds();
      } else if (phase === 'tuck') {
        if (visibleBounds) return;
        const next = pending, requested=pendingPress; active = null; pending = null; wanted = false; prepared = false; phase = 'hidden';
        contactPixel = null; errorPixels = null;
        if (!next) { prepareContact?.(null); return; }
        enter(next,requested); offset=prepareContact?.(active) || offset; fit(offset); prepare(offset);
      }
      if (!remainingDt) return;
    }
  }
  function render() {
    if (!enabled) { renderer.render(scene, camera); return; }
    const { width, height } = viewport(), savedAutoClear = renderer.autoClear;
    const savedScissorTest = renderer.getScissorTest(); renderer.getScissor(oldScissor);
    const oldVisible = drawables.map(object => object.visible);
    try {
      renderer.autoClear = false; renderer.setScissorTest(false); renderer.clear(true, true, true);
      if (!active || !prepared || !visibleBounds) return;
      renderer.setScissor(active.panel.right, 0, Math.max(0, width - active.panel.right), height); renderer.setScissorTest(true);
      // The scissor clips pixels, but still submits every hidden chassis part.
      // Cull only leaf drawables wholly outside this pass; parents retain all
      // child visibility, and the exact depth/scissor occlusion stays intact.
      for (const object of proximal) {
        const bounds = screenBounds.get(object);
        if (active.mobileNext || (!object.children.length && bounds && (bounds.right < active.panel.right - 1 || bounds.left > width + 1 || bounds.bottom < -1 || bounds.top > height + 1))) object.visible = false;
      }
      if (layer === 'foreground') for (const object of distal) object.visible = false;
      if (!active.mobileNext || layer !== 'foreground') renderer.render(scene, camera);
      if (layer === 'foreground') {
        renderer.setScissorTest(false); renderer.clearDepth();
        for (let i = 0; i < drawables.length; i++) drawables[i].visible = distalSet.has(drawables[i]) && oldVisible[i];
        renderer.render(scene, camera);
      }
    } finally {
      for (let i = 0; i < drawables.length; i++) drawables[i].visible = oldVisible[i];
      renderer.autoClear = savedAutoClear; renderer.setScissor(oldScissor); renderer.setScissorTest(savedScissorTest);
    }
  }
  function getState() {
    return {
      enabled, visible: enabled && prepared && Boolean(active) && Boolean(visibleBounds),
      layer, occluded: !visibleBounds, kind: active?.kind ?? null, gate: copy(active?.gate), panel: copy(active?.panel), phase,
      target: copy(active?.target), contactPixel: copy(contactPixel), errorPixels, scale,
      edgeProgress, reachProgress, pressProgress, mobileNext:Boolean(active?.mobileNext),
      footprintBounds:active?.mobileNext ? copy(layout?.footprintBounds) : null,
      distalBounds: copy(distalBounds), proximalBounds: copy(proximalBounds), visibleBounds: copy(visibleBounds),
    };
  }
  return { get enabled() { return enabled; }, setMode, aimAt, updateLayout, resetAim, requestPress, completeAim, update, render, getState };
}
