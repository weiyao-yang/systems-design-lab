// Read-only chassis collision guard for the optional hanging sign. It owns no
// scene objects and never changes the robot, its pose, materials, or geometry.
// Positive gap means separated convex proxies; negative gap means penetration.
export function createConstructionChassisGuard({ THREE, chassis, width = 1.12, height = .49, drop = .51, clearance = .015 } = {}) {
  const identity = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const normalize = a => { const length = Math.hypot(...a); return a.map(v => v / length); };
  const transformDirection = (axes, v) => [0, 1, 2].map(i => axes[0][i] * v[0] + axes[1][i] * v[1] + axes[2][i] * v[2]);
  const localProxies = [];
  function proxy(name, center, half, axes = identity) { localProxies.push({ name, center, half, axes }); }

  // Original drive-local dimensions from robot.js. The blue wheelArch is a
  // twelve-edge polygonal half-annulus, with a .014 bevel. Eight small oriented
  // boxes cover it without filling the entire empty space above/between wheels.
  // The merged X interval also covers the orange/cream trims and their bolts.
  const sectorCount = 8, halfAngle = Math.PI / (2 * sectorCount);
  const bevelInflation = Math.SQRT2 * .014 + .001;
  const radialLow = .60 * Math.cos(Math.PI / 24) * Math.cos(halfAngle) - bevelInflation;
  const radialHigh = .72 + bevelInflation;
  const radialCenter = (radialLow + radialHigh) / 2;
  const radialHalf = (radialHigh - radialLow) / 2;
  const tangentHalf = .72 * Math.sin(halfAngle) + bevelInflation;
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    for (let index = 0; index < sectorCount; index++) {
      const angle = (index + .5) * Math.PI / sectorCount;
      const radial = [0, Math.sin(angle), Math.cos(angle)];
      const tangent = [0, Math.cos(angle), -Math.sin(angle)];
      proxy(`wheel-arch-${side}-${end}-${index}`, [side * 1.1835, .161 + radialCenter * radial[1], end * .78 + radialCenter * radial[2]], [.3185, radialHalf, tangentHalf], [identity[0], radial, tangent]);
    }
    // This compact wheel box also includes tread blocks and protruding hubs.
    // It is intentionally conservative at the tyre's diagonal corners.
    proxy(`wheel-${side}-${end}`, [side * 1.16, .161, end * .78], [.335, .524, .524]);
  }
  function bodyBox(name, center, dimensions, bevel) {
    const pad = Math.SQRT2 * bevel + .001;
    proxy(name, center, [dimensions[0] / 2 + pad, dimensions[1] / 2 + pad, Math.max(dimensions[2] / 2, bevel + .0075) + .001]);
  }
  bodyBox('chassis-lower', [0, .33, 0], [1.64, .26, 2.05], .055);
  bodyBox('chassis-upper', [0, .58, 0], [1.70, .26, 2.02], .055);
  bodyBox('chassis-orange-roof', [0, .73, 0], [1.64, .09, 1.88], .024);
  bodyBox('chassis-cream-roof', [0, .80, 0], [1.56, .10, 1.77], .03);
  bodyBox('chassis-bonnet', [0, .88, .48], [.84, .10, .65], .03);
  bodyBox('chassis-grille', [0, .57, 1.06], [1.66, .33, .308], .027);
  bodyBox('chassis-bumper', [0, .29, 1.16], [1.91, .19, .20], .045);
  bodyBox('chassis-rear', [0, .40, -1.11], [1.72, .16, .20], .028);
  proxy('chassis-tow-hooks', [0, .20, 1.32], [.81, .14, .135]);
  proxy('chassis-slew-bearing', [0, .97, -.10], [.625, .14, .625]);
  for (const side of [-1, 1]) proxy(`chassis-frame-rail-${side}`, [side * .90, .35, 0], [.11, .12, .56]);
  const skidAngle = -.32, skidCosine = Math.cos(skidAngle), skidSine = Math.sin(skidAngle);
  const skidPad = Math.SQRT2 * .022 + .001;
  proxy('chassis-skid-plate', [0, .12, 1.16], [.585 + skidPad, .115 + skidPad, .046], [[1, 0, 0], [0, skidCosine, skidSine], [0, -skidSine, skidCosine]]);

  // Include the bevel, transparent front artwork, and the two suspension wires.
  const signParts = [{ name: 'plate', center: [0, -drop, .001], half: [width / 2 + .004, height / 2 + .004, .019], axes: identity }];
  for (const side of [-1, 1]) {
    const a = [side * .014, -.018, .025], b = [side * .37, -drop + height / 2 - .031, .030];
    const delta = b.map((v, i) => v - a[i]);
    const longitudinal = normalize(delta);
    const transverse = normalize(cross([0, 0, 1], longitudinal));
    signParts.push({ name: `wire-${side}`, center: a.map((v, i) => (v + b[i]) / 2), half: [.007, Math.hypot(...delta) / 2 + .007, .007], axes: [transverse, longitudinal, cross(transverse, longitudinal)] });
  }
  const sweepRadius = Math.max(...signParts.map(part => Math.hypot(...part.center) + Math.hypot(...part.half)));
  let enabled = false, anchor = [0, 0, 0], yaw = 0, signScale = 1;
  let activeProxies = [], allProxies = [], farGap = Infinity;
  let currentContext = null, previousContext = null;
  const snapshot = () => ({ enabled, anchor, yaw, scale: signScale, activeProxies, allProxies, farGap });

  function update(state = {}) {
    previousContext = currentContext;
    enabled = Boolean(chassis?.isObject3D && state.anchor && Number.isFinite(state.scale) && state.scale > 0 && Number.isFinite(state.yaw));
    activeProxies = []; allProxies = []; farGap = Infinity;
    if (!enabled) { currentContext = snapshot(); return; }
    anchor = Array.isArray(state.anchor) ? [...state.anchor] : [state.anchor.x, state.anchor.y, state.anchor.z];
    if (!anchor.every(Number.isFinite)) { enabled = false; currentContext = snapshot(); return; }
    yaw = state.yaw; signScale = state.scale;
    chassis.updateWorldMatrix(true, false);
    const matrix = chassis.matrixWorld.elements;
    const scale = [Math.hypot(matrix[0], matrix[1], matrix[2]), Math.hypot(matrix[4], matrix[5], matrix[6]), Math.hypot(matrix[8], matrix[9], matrix[10])];
    if (scale.some(value => value < 1e-8)) { enabled = false; currentContext = snapshot(); return; }
    const axes = [[matrix[0] / scale[0], matrix[1] / scale[0], matrix[2] / scale[0]], [matrix[4] / scale[1], matrix[5] / scale[1], matrix[6] / scale[1]], [matrix[8] / scale[2], matrix[9] / scale[2], matrix[10] / scale[2]]];
    for (const local of localProxies) {
      const center = [matrix[0] * local.center[0] + matrix[4] * local.center[1] + matrix[8] * local.center[2] + matrix[12], matrix[1] * local.center[0] + matrix[5] * local.center[1] + matrix[9] * local.center[2] + matrix[13], matrix[2] * local.center[0] + matrix[6] * local.center[1] + matrix[10] * local.center[2] + matrix[14]];
      // The original chassis has uniform .65 scale, retaining orthogonal axes.
      const scaledAxes = local.axes.map(axis => transformDirection(axes, axis.map((v, i) => v * scale[i])));
      const axisLengths = scaledAxes.map(axis => Math.hypot(...axis));
      const half = local.half.map((v, i) => v * axisLengths[i]);
      const worldAxes = scaledAxes.map((axis, i) => axis.map(v => v / axisLengths[i]));
      const worldProxy = { name: local.name, center, half, axes: worldAxes, radius: Math.hypot(...half) };
      allProxies.push(worldProxy);
      const distance = Math.hypot(...center.map((v, i) => v - anchor[i]));
      const sphereGap = distance - Math.hypot(...half) - (sweepRadius + clearance) * signScale;
      // A barely positive sphere bound can be far below the true OBB gap.
      // Do not cap every candidate beneath the solver's contact tolerance:
      // only use sphere distances outside the whole nearby contact region.
      if (sphereGap > .25 * signScale) farGap = Math.min(farGap, sphereGap / signScale);
      else activeProxies.push(worldProxy);
    }
    currentContext = snapshot();
  }

  // All fifteen normalized SAT axes: 3 from each box and their 9 cross axes.
  // Its sign is exact for these convex proxies. Its magnitude is a conservative
  // projected gap, rather than an exact Euclidean signed-distance function.
  function boxGap(a, b, limit) {
    const dx = b.center[0] - a.center[0], dy = b.center[1] - a.center[1], dz = b.center[2] - a.center[2];
    let gap = -Infinity;
    function axisGap(x, y, z) {
      const lengthSquared = x * x + y * y + z * z;
      if (lengthSquared < 1e-16) return;
      const inverseLength = 1 / Math.sqrt(lengthSquared);
      x *= inverseLength; y *= inverseLength; z *= inverseLength;
      let radius = 0;
      for (let i = 0; i < 3; i++) {
        const aa = a.axes[i], ba = b.axes[i];
        radius += a.half[i] * Math.abs(aa[0] * x + aa[1] * y + aa[2] * z) + b.half[i] * Math.abs(ba[0] * x + ba[1] * y + ba[2] * z);
      }
      gap = Math.max(gap, Math.abs(dx * x + dy * y + dz * z) - radius);
    }
    // Once a separating axis exceeds the union's current minimum, this pair
    // cannot determine the result, so the remaining axes need not be evaluated.
    for (const axis of a.axes) { axisGap(axis[0], axis[1], axis[2]); if (gap > limit) return gap; }
    for (const axis of b.axes) { axisGap(axis[0], axis[1], axis[2]); if (gap > limit) return gap; }
    for (const aa of a.axes) for (const ba of b.axes) {
      axisGap(aa[1] * ba[2] - aa[2] * ba[1], aa[2] * ba[0] - aa[0] * ba[2], aa[0] * ba[1] - aa[1] * ba[0]);
      if (gap > limit) return gap;
    }
    return gap;
  }
  function evaluate(roll, pitch, context = currentContext, exact = false) {
    if (!context?.enabled || !Number.isFinite(roll + pitch)) return { gap: Infinity, proxy: null, part: null };
    const obstacles = exact ? context.allProxies : context.activeProxies;
    if (!obstacles.length) return { gap: context.farGap, proxy: null, part: null };
    const cy = Math.cos(context.yaw), sy = Math.sin(context.yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
    // Ry(yaw) * Rx(pitch) * Rz(roll), matching the sign's XYZ Euler order.
    const axes = [[cy * cr + sy * sp * sr, cp * sr, -sy * cr + cy * sp * sr], [-cy * sr + sy * sp * cr, cp * cr, sy * sr + cy * sp * cr], [sy * cp, -sp, cy * cp]];
    let result = { gap: exact ? Infinity : context.farGap, proxy: null, part: null };
    for (const part of signParts) {
      const displacement = transformDirection(axes, part.center);
      const box = { center: displacement.map((v, i) => context.anchor[i] + v * context.scale), half: part.half.map(value => value * context.scale), axes: part.axes.map(axis => transformDirection(axes, axis)) };
      const radius = Math.hypot(...box.half);
      for (const obstacle of obstacles) {
        const limit = (result.gap + clearance) * context.scale;
        const sphereGap = Math.hypot(box.center[0] - obstacle.center[0], box.center[1] - obstacle.center[1], box.center[2] - obstacle.center[2]) - radius - obstacle.radius;
        if (!exact && sphereGap > limit) continue;
        const gap = boxGap(box, obstacle, limit) / context.scale - clearance;
        if (gap < result.gap) result = { gap, proxy: obstacle.name, part: part.name };
      }
    }
    return result;
  }
  function gapAt(roll, pitch) { return evaluate(roll, pitch).gap; }
  function clearanceAt(roll, pitch) {
    const result = evaluate(roll, pitch), epsilon = 1e-4;
    if (!Number.isFinite(result.gap) || !result.proxy) return { ...result, rollGradient: 0, pitchGradient: 0, kind: 'chassis' };
    return { ...result, rollGradient: (gapAt(roll + epsilon, pitch) - gapAt(roll - epsilon, pitch)) / (2 * epsilon), pitchGradient: (gapAt(roll, pitch + epsilon) - gapAt(roll, pitch - epsilon)) / (2 * epsilon), kind: 'chassis' };
  }
  function gapRateAt(roll, pitch, dt) {
    if (!currentContext?.enabled || !previousContext?.enabled || !Number.isFinite(dt) || dt <= .001 || dt > .16) return 0;
    const movement = Math.hypot(...currentContext.anchor.map((v, i) => v - previousContext.anchor[i])) / currentContext.scale;
    if (movement > .8 || Math.abs(currentContext.scale / previousContext.scale - 1) > .08) return 0;
    // Same candidate angles in both immutable frame contexts isolate only the
    // moving mount/chassis contribution, excluding the pendulum's own motion.
    // Exact SAT on both frames avoids artificial rates when a sphere bound
    // switches to a nearby OBB query. Only the render update advances history.
    const now = evaluate(roll, pitch, currentContext, true).gap;
    const before = evaluate(roll, pitch, previousContext, true).gap;
    return Number.isFinite(now + before) ? (now - before) / dt : 0;
  }
  function resetHistory() { previousContext = null; }
  return { update, gapAt, clearanceAt, gapRateAt, resetHistory, getState: () => ({ enabled, proxyCount: localProxies.length, activeProxies: activeProxies.length, parts: signParts.length, clearance, scale: signScale, hasPrevious: Boolean(previousContext?.enabled) }) };
}
