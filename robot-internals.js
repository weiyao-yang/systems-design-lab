// Illustrative drivetrain and actuator details, drawn inside the existing shell.
// Each assembly is a single line batch, so transparent technical views stay light.
export function createMechanicalInternals({ THREE, lineMaterial } = {}) {
  const ownMaterial = !lineMaterial;
  const material = lineMaterial || new THREE.LineBasicMaterial({
    color: 0xff742f, transparent: true, opacity: 0.9,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const geometries = new Set();
  const tau = Math.PI * 2;

  function drawing() {
    const vertices = [];
    const segment = (a, b) => vertices.push(...a, ...b);
    const poly = (points, closed = false) => {
      for (let i = 1; i < points.length; i++) segment(points[i - 1], points[i]);
      if (closed && points.length > 2) segment(points[points.length - 1], points[0]);
    };
    const point = (u, v, w, axis, center) => {
      if (axis === 'x') return [center[0] + w, center[1] + u, center[2] + v];
      if (axis === 'y') return [center[0] + u, center[1] + w, center[2] + v];
      return [center[0] + u, center[1] + v, center[2] + w];
    };
    function circle(radius, center = [0, 0, 0], axis = 'z', count = 40) {
      const points = [];
      for (let i = 0; i < count; i++) {
        const a = i / count * tau;
        points.push(point(Math.cos(a) * radius, Math.sin(a) * radius, 0, axis, center));
      }
      poly(points, true);
    }
    function cylinder(radius, length, center = [0, 0, 0], axis = 'z', rails = 6, count = 32) {
      const front = point(0, 0, length / 2, axis, center);
      const back = point(0, 0, -length / 2, axis, center);
      circle(radius, front, axis, count); circle(radius, back, axis, count);
      for (let i = 0; i < rails; i++) {
        const a = i / rails * tau;
        segment(point(Math.cos(a) * radius, Math.sin(a) * radius, -length / 2, axis, center), point(Math.cos(a) * radius, Math.sin(a) * radius, length / 2, axis, center));
      }
    }
    function cuboid(width, height, depth, center = [0, 0, 0]) {
      const corners = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push([center[0] + x * width / 2, center[1] + y * height / 2, center[2] + z * depth / 2]);
      for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) segment(corners[i], corners[i | bit]);
    }
    function gear(radius, teeth, center = [0, 0, 0], axis = 'z', depth = 0.025, inward = false) {
      const pitch = tau / teeth;
      const root = inward ? radius : radius * 0.87;
      const tip = inward ? radius * 0.88 : radius;
      const profile = offset => {
        const points = [];
        for (let i = 0; i < teeth; i++) for (const [fraction, r] of [[-0.46, root], [-0.22, tip], [0.22, tip], [0.46, root]]) {
          const a = (i + fraction) * pitch;
          points.push(point(Math.cos(a) * r, Math.sin(a) * r, offset, axis, center));
        }
        poly(points, true);
      };
      profile(-depth / 2); profile(depth / 2);
      for (let i = 0; i < teeth; i += 2) {
        const a = i * pitch;
        segment(point(Math.cos(a) * tip, Math.sin(a) * tip, -depth / 2, axis, center), point(Math.cos(a) * tip, Math.sin(a) * tip, depth / 2, axis, center));
      }
      if (!inward) circle(radius * 0.28, center, axis, 24);
    }
    function helix(radius, length, turns, center = [0, 0, 0], axis = 'y', phase = 0) {
      const points = [];
      const steps = Math.max(24, Math.ceil(turns * 12));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps, a = t * tau * turns + phase;
        points.push(point(Math.cos(a) * radius, Math.sin(a) * radius, (t - 0.5) * length, axis, center));
      }
      poly(points);
    }
    // Tooth addendum and root clearance share one module across each gear train.
    function pitchGear(radius, teeth, center = [0, 0, 0], axis = 'z', depth = 0.025, inward = false, phase = 0, bore = radius * 0.28) {
      const module = 2 * radius / teeth;
      const root = radius + (inward ? 1.25 : -1.25) * module;
      const tip = radius + (inward ? -1 : 1) * module;
      const pitch = tau / teeth;
      for (const w of [-depth / 2, depth / 2]) {
        const points = [];
        for (let i = 0; i < teeth; i++) for (const [fraction, r] of [[-0.46, root], [-0.22, tip], [0.22, tip], [0.46, root]]) {
          const a = phase + (i + fraction) * pitch;
          points.push(point(Math.cos(a) * r, Math.sin(a) * r, w, axis, center));
        }
        poly(points, true);
      }
      for (let i = 0; i < teeth; i += 2) {
        const a = phase + i * pitch;
        segment(point(Math.cos(a) * tip, Math.sin(a) * tip, -depth / 2, axis, center), point(Math.cos(a) * tip, Math.sin(a) * tip, depth / 2, axis, center));
      }
      if (!inward) circle(bore, center, axis, 24);
    }
    function between(radius, from, to, rails = 4, count = 20) {
      const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
      const axis = b.clone().sub(a).normalize();
      const u = new THREE.Vector3(Math.abs(axis.y) < 0.9 ? 0 : 1, Math.abs(axis.y) < 0.9 ? 1 : 0, 0).cross(axis).normalize();
      const v = axis.clone().cross(u);
      const rings = [a, b].map(center => Array.from({ length: count }, (_, i) => {
        const angle = i / count * tau;
        return center.clone().addScaledVector(u, Math.cos(angle) * radius).addScaledVector(v, Math.sin(angle) * radius).toArray();
      }));
      poly(rings[0], true); poly(rings[1], true);
      for (let i = 0; i < rails; i++) { const j = Math.floor(i / rails * count); segment(rings[0][j], rings[1][j]); }
    }
    return { vertices, segment, poly, point, circle, cylinder, cuboid, gear, pitchGear, helix, between };
  }

  function batch(parent, d, name) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(d.vertices, 3));
    geometry.computeBoundingSphere();
    geometries.add(geometry);
    const object = new THREE.LineSegments(geometry, material);
    object.name = `mechanism-${name}`;
    object.userData.drawingRole = 'mechanism';
    object.userData.technical = true;
    object.renderOrder = 4;
    object.frustumCulled = true;
    parent.add(object);
    return object;
  }

  function joint(parent, radius, depth) {
    const d = drawing();
    for (const side of [-1, 1]) {
      const z = side * depth * 0.35;
      for (const r of [0.69, 0.83]) d.circle(radius * r, [0, 0, z], 'z', 48);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * tau;
        const center = [Math.cos(a) * radius * 0.76, Math.sin(a) * radius * 0.76, z];
        d.circle(radius * 0.047, center, 'z', 12); d.circle(radius * 0.047, center, 'y', 12);
      }
      d.circle(radius * 0.44, [0, 0, side * depth * 0.25], 'z', 40);
      d.circle(radius * 0.28, [0, 0, side * depth * 0.25], 'z', 32);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * tau;
        d.circle(radius * 0.028, [Math.cos(a) * radius * 0.57, Math.sin(a) * radius * 0.57, side * depth * 0.24], 'z', 10);
      }
    }
    d.cylinder(radius * 0.12, depth * 0.84, [0, 0, 0], 'z', 4, 24);
    d.cylinder(radius * 0.46, depth * 0.44, [0, 0, -depth * 0.08], 'z', 8, 40);
    // 36 = 12 + 2*12; all three equally spaced planets share the same module.
    const ringPitch = radius * 0.61, sunPitch = ringPitch / 3, orbit = sunPitch * 2;
    const gearZ = depth * 0.10;
    d.pitchGear(ringPitch, 36, [0, 0, gearZ], 'z', depth * 0.09, true);
    d.pitchGear(sunPitch, 12, [0, 0, gearZ], 'z', depth * 0.12, false, 0, radius * 0.12);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * tau;
      const center = [Math.cos(a) * orbit, Math.sin(a) * orbit, gearZ];
      d.pitchGear(sunPitch, 12, center, 'z', depth * 0.09, false, a + Math.PI / 12, radius * 0.045);
      d.cylinder(radius * 0.035, depth * 0.27, [center[0], center[1], depth * 0.10], 'z', 4, 16);
      d.circle(radius * 0.065, [center[0], center[1], depth * 0.235], 'z', 20);
      d.segment([0, 0, depth * 0.235], [center[0], center[1], depth * 0.235]);
    }
    // Carrier/output sleeve and shaft shoulders close the load path to the roller.
    d.circle(radius * 0.50, [0, 0, depth * 0.235], 'z', 36);
    d.cylinder(radius * 0.25, depth * 0.22, [0, 0, depth * 0.29], 'z', 6, 28);
    for (const z of [-depth * 0.31, depth * 0.40]) d.circle(radius * 0.17, [0, 0, z], 'z', 24);
    d.cylinder(radius * 0.19, depth * 0.36, [0, 0, -depth * 0.13], 'z', 6, 28);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * tau, r = radius * 0.37;
      d.segment([Math.cos(a) * r, Math.sin(a) * r, -depth * 0.29], [Math.cos(a) * r, Math.sin(a) * r, -depth * 0.02]);
    }
    for (const side of [-1, 1]) {
      d.cuboid(radius * 0.12, radius * 0.08, depth * 0.13, [side * radius * 0.37, -radius * 0.24, -depth * 0.22]);
      d.poly([[side * radius * 0.37, -radius * 0.24, -depth * 0.28], [side * radius * 0.48, radius * 0.03, -depth * 0.28], [side * radius * 0.24, radius * 0.48, -depth * 0.28]]);
    }
    const object = batch(parent, d, 'joint');
    object.userData.gearTrain = { sun: 12, planet: 12, ring: 36, sunPitch, planetPitch: sunPitch, ringPitch, orbit };
    return object;
  }

  function link(parent, length, wide, depthScale = 1) {
    const d = drawing();
    const motorRadius = wide * 0.19, motorY = length * 0.25;
    const screwStart = length * 0.38, screwEnd = length - 0.19;
    const screwLength = screwEnd - screwStart;
    d.cylinder(motorRadius, length * 0.25, [0, motorY, 0], 'y', 8, 32);
    for (const y of [length * 0.12, length * 0.38]) {
      d.cylinder(motorRadius * 1.17, 0.025, [0, y, 0], 'y', 4, 32);
      d.circle(motorRadius * 0.66, [0, y, 0], 'y', 28);
    }
    // Keyed shaft and clamped coupling connect the rotor to the ball screw.
    d.cylinder(wide * 0.049, 0.12, [0, screwStart - 0.025, 0], 'y', 4, 24);
    d.cylinder(wide * 0.095, 0.07, [0, screwStart - 0.025, 0], 'y', 6, 24);
    for (const y of [screwStart - 0.055, screwStart + 0.005]) d.circle(wide * 0.11, [0, y, 0], 'y', 24);
    d.cylinder(wide * 0.049, screwLength, [0, (screwStart + screwEnd) / 2, 0], 'y', 4, 24);
    d.helix(wide * 0.067, screwLength, Math.max(6, screwLength / 0.068), [0, (screwStart + screwEnd) / 2, 0], 'y');
    for (const y of [screwStart + 0.07, length - 0.27]) {
      d.cuboid(wide * 0.44, 0.055, 0.13 * depthScale, [0, y, 0]);
      d.circle(wide * 0.10, [0, y, 0], 'y', 24);
    }
    for (const side of [-1, 1]) {
      const x = side * wide * 0.28;
      d.cylinder(0.014, length - 0.35, [x, length / 2, -0.055 * depthScale], 'y', 3, 20);
      for (const y of [length * 0.17, length * 0.66, length * 0.85]) d.cylinder(0.024, 0.045, [x, y, -0.055 * depthScale], 'y', 4, 20);
      d.poly([[side * wide * 0.34, 0.17, 0.10 * depthScale], [side * wide * 0.34, length * 0.42, 0.10 * depthScale], [side * wide * 0.20, length * 0.47, 0.10 * depthScale], [side * wide * 0.20, length - 0.18, 0.10 * depthScale]]);
    }
    d.cuboid(wide * 0.57, 0.12, 0.18 * depthScale, [0, length * 0.66, 0]);
    d.cylinder(wide * 0.10, 0.14, [0, length * 0.66, 0], 'y', 4, 28);
    d.cuboid(wide * 0.48, 0.055, 0.12 * depthScale, [0, length * 0.16, 0]);
    // The original two hose/cable paths receive ferrules and anchored terminals.
    const ports = [
      { from: [-wide * 0.32, 0.12, -0.25 * depthScale], to: [-wide * 0.25, length - 0.10, -0.22 * depthScale], r: 0.034 },
      { from: [-wide * 0.40, 0.18, -0.28 * depthScale], to: [-wide * 0.29, length - 0.15, -0.23 * depthScale], r: 0.019 },
    ];
    for (const [i, port] of ports.entries()) {
      for (const p of [port.from, port.to]) {
        d.cylinder(port.r * 1.30, 0.044, p, 'y', 6, 24);
        d.circle(port.r * 1.50, p, 'y', 24);
      }
      const inlet = [port.from[0], port.from[1] + 0.045, -0.10 * depthScale];
      d.between(port.r * 0.65, port.from, inlet, 3, 16);
      d.poly([inlet, [-wide * 0.14, length * (0.19 + i * 0.05), -0.10 * depthScale], [0, length * (0.19 + i * 0.05), -motorRadius]]);
      d.cuboid(port.r * 1.4, 0.055, 0.06, [port.to[0], port.to[1] - 0.04, port.to[2]]);
    }
    batch(parent, d, 'link-actuator');

    const railRoot = length - 0.43;
    const e = drawing();
    for (const side of [-1, 1]) {
      e.cylinder(wide * 0.045, 1, [side * wide * 0.20, 0.5, 0], 'y', 3, 16);
      e.cylinder(0.007, 1, [side * wide * 0.13, 0.5, -0.07 * depthScale], 'y', 3, 12);
    }
    e.cylinder(wide * 0.035, 1, [0, 0.5, 0], 'y', 3, 20);
    // Straight splines slide axially without stretching a fictitious thread pitch.
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * tau, x = Math.cos(a) * wide * 0.055, z = Math.sin(a) * wide * 0.055;
      e.segment([x, 0, z], [x, 1, z]);
    }
    const extension = batch(parent, e, 'telescoping-spindle');
    const tip = drawing();
    tip.cuboid(wide * 0.53, 0.09, 0.16 * depthScale, [0, 0, 0]);
    tip.cylinder(wide * 0.10, 0.09, [0, 0, 0], 'y', 4, 24);
    tip.circle(wide * 0.075, [0, -0.045, 0], 'y', 24);
    tip.cylinder(wide * 0.035, 0.16, [0, 0.08, 0], 'y', 4, 20);
    for (const side of [-1, 1]) {
      tip.cylinder(wide * 0.045, 0.16, [side * wide * 0.20, 0.08, 0], 'y', 3, 16);
      tip.poly([[side * wide * 0.13, 0, -0.07 * depthScale], [side * wide * 0.13, 0.10, -0.07 * depthScale], [0, 0.16, -0.07 * depthScale]]);
    }
    tip.cylinder(wide * 0.11, 0.12, [0, 0.16, 0], 'z', 4, 24);
    const endBearing = batch(parent, tip, 'telescoping-end-bearing');
    const api = {
      setLength(actual) {
        extension.position.y = railRoot;
        extension.scale.y = Math.max(0.04, actual - 0.16 - railRoot);
        endBearing.position.y = actual - 0.16;
      },
    };
    api.setLength(length);
    return api;
  }

  function chassis(parent) {
    const d = drawing();
    // Rear battery tray, front controller, and two enclosed axle drives.
    d.cuboid(0.98, 0.24, 0.67, [0, 0.52, -0.41]);
    for (let i = 0; i < 6; i++) {
      const x = (i % 3 - 1) * 0.26, z = -0.41 + (i < 3 ? -0.16 : 0.16);
      d.cylinder(0.09, 0.20, [x, 0.52, z], 'y', 4, 24);
      d.circle(0.035, [x, 0.626, z], 'y', 16);
    }
    d.cuboid(1.03, 0.027, 0.47, [0, 0.65, 0.38]);
    for (const x of [-0.31, 0, 0.31]) {
      d.cuboid(0.16, 0.052, 0.19, [x, 0.69, 0.38]);
      for (let i = 0; i < 4; i++) for (const side of [-1, 1]) d.segment([x + (i - 1.5) * 0.035, 0.68, 0.38 + side * 0.10], [x + (i - 1.5) * 0.035, 0.66, 0.38 + side * 0.14]);
    }
    for (let i = 0; i < 9; i++) d.cuboid(0.045, 0.055, 0.06, [(i - 4) * 0.10, 0.68, 0.60]);
    for (const end of [-1, 1]) {
      const z = end * 0.78;
      d.cylinder(0.027, 1.99, [0, 0.161, z], 'x', 4, 24);
      d.cylinder(0.12, 0.21, [0, 0.161, z], 'x', 6, 32);
      d.gear(0.10, 16, [0, 0.161, z], 'x', 0.055);
      d.cylinder(0.075, 0.25, [0, 0.43, end * 0.53], 'z', 6, 28);
      d.cylinder(0.027, 0.20, [0, 0.43, end * 0.72], 'z', 4, 20);
      d.poly([[0, 0.43, end * 0.79], [0, 0.30, end * 0.79], [0, 0.161, z]]);
      for (const side of [-1, 1]) d.cylinder(0.052, 0.07, [side * 0.76, 0.161, z], 'x', 4, 24);
    }
    for (const side of [-1, 1]) {
      d.poly([[side * 0.40, 0.65, -0.43], [side * 0.55, 0.65, -0.24], [side * 0.55, 0.65, 0.12], [side * 0.43, 0.68, 0.32]]);
      d.poly([[side * 0.43, 0.60, 0.44], [side * 0.60, 0.46, 0.52], [side * 0.45, 0.42, 0.75]]);
      d.segment([side * 0.67, 0.36, -0.75], [-side * 0.67, 0.36, 0.75]);
    }
    // Supported intermediate shaft joins the motor input to the axle gearbox.
    for (const end of [-1, 1]) {
      const z = end * 0.78;
      d.cylinder(0.019, 0.269, [0, 0.2955, z], 'y', 4, 20);
      for (const y of [0.23, 0.36]) {
        d.circle(0.033, [0, y, z], 'y', 20);
        d.cuboid(0.10, 0.035, 0.10, [0, y, z]);
      }
      const bevelCone = (apex, axis, direction) => {
        const large = d.point(0, 0, direction * 0.045, axis, apex);
        const small = d.point(0, 0, direction * 0.012, axis, apex);
        d.circle(0.045, large, axis, 24); d.circle(0.012, small, axis, 24);
        for (let i = 0; i < 10; i++) {
          const a = i / 10 * tau;
          d.segment(d.point(Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0, axis, large), d.point(Math.cos(a) * 0.012, Math.sin(a) * 0.012, 0, axis, small));
        }
      };
      bevelCone([0, 0.43, z], 'z', -end); bevelCone([0, 0.43, z], 'y', -1);
      bevelCone([0, 0.161, z], 'y', 1); bevelCone([0, 0.161, z], 'x', 1);
      for (const side of [-1, 1]) {
        d.cylinder(0.047, 0.065, [side * 0.96, 0.161, z], 'x', 4, 24);
        d.circle(0.063, [side * 0.96, 0.161, z], 'x', 24);
      }
      d.poly([[0.43, 0.68, 0.44], [0.46, 0.48, end * 0.53], [0.055, 0.43, end * 0.53]]);
      d.cuboid(0.045, 0.035, 0.08, [0.065, 0.43, end * 0.53]);
    }
    for (const side of [-1, 1]) {
      d.poly([[side * 0.26, 0.63, -0.41], [side * 0.39, 0.67, -0.23], [side * 0.39, 0.67, 0.18], [side * 0.31, 0.69, 0.30]]);
      d.cuboid(0.065, 0.035, 0.055, [side * 0.31, 0.69, 0.30]);
    }
    return batch(parent, d, 'chassis-drivetrain');
  }

  function shoulderTransmission({ drive, arm }) {
    // The yaw motor drives the existing slew ring from inside the chassis.
    const base = drawing();
    const ringCenter = [0, 0.94, -0.10];
    base.cylinder(0.080, 0.24, [0.50, 0.70, -0.10], 'y', 6, 24);
    for (const y of [0.58, 0.82]) base.circle(0.092, [0.50, y, -0.10], 'y', 24);
    base.cylinder(0.026, 0.17, [0.50, 0.895, -0.10], 'y', 4, 20);
    base.circle(0.035, [0.50, 0.975, -0.10], 'y', 24);
    // Matching module 0.02: the 10/40 tooth pitch radii sum to the 0.50 spacing.
    base.pitchGear(0.10, 10, [0.50, 0.94, -0.10], 'y', 0.04, false, Math.PI / 10, 0.026);
    base.pitchGear(0.40, 40, ringCenter, 'y', 0.04, false, 0, 0.105);
    // A hollow keyed hub carries load through the turntable, not its cover.
    base.cylinder(0.105, 0.18, [0, 1.025, -0.10], 'y', 6, 28);
    for (const y of [0.98, 1.07]) {
      base.circle(0.17, [0, y, -0.10], 'y', 32);
      base.circle(0.21, [0, y, -0.10], 'y', 32);
    }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * tau;
      const x = Math.cos(a) * 0.18, z = -0.10 + Math.sin(a) * 0.18;
      base.circle(0.012, [x, 1.07, z], 'y', 8);
      base.segment([x, 0.98, z], [x, 1.07, z]);
    }
    base.cylinder(0.040, 0.10, [0, 1.08, -0.10], 'y', 4, 24);
    base.circle(0.054, [0, 1.13, -0.10], 'y', 24);
    batch(drive, base, 'slew-input-transmission');

    // These bearing supports yaw with the arm, but never pitch with its link.
    const upper = drawing();
    for (const side of [-1, 1]) {
      const z = side * 0.30;
      upper.circle(0.106, [0, 0, z], 'z', 32);
      upper.circle(0.068, [0, 0, z], 'z', 28);
      for (const x of [-0.105, 0.105]) {
        upper.poly([[x, -0.45, side * 0.21], [x, -0.28, side * 0.27], [x * 0.76, -0.07, z]]);
        upper.segment([x, -0.28, side * 0.27], [-x * 0.76, -0.07, z]);
      }
      upper.segment([-0.105, -0.45, side * 0.21], [0.105, -0.45, side * 0.21]);
      upper.circle(0.012, [-0.082, -0.40, side * 0.24], 'z', 8);
      upper.circle(0.012, [0.082, -0.40, side * 0.24], 'z', 8);
    }
    upper.cylinder(0.038, 0.325, [0, -0.1875, -0.10], 'y', 4, 24);
    for (const y of [-0.35, -0.25]) {
      upper.circle(0.060, [0, y, -0.10], 'y', 24);
      upper.circle(0.079, [0, y, -0.10], 'y', 24);
    }
    // A matching pair of pitch cones turns the input through 90 degrees.
    // Their apex is the shoulder axis at [0, 0, -0.10].
    const bevel = (axis, largeCenter, smallCenter) => {
      upper.circle(0.10, largeCenter, axis, 24);
      upper.circle(0.025, smallCenter, axis, 24);
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * tau;
        for (const phase of [-0.045, 0.045]) {
          const u = Math.cos(a + phase), v = Math.sin(a + phase);
          upper.segment(upper.point(u * 0.10, v * 0.10, 0, axis, largeCenter), upper.point(u * 0.025, v * 0.025, 0, axis, smallCenter));
        }
      }
    };
    bevel('y', [0, -0.10, -0.10], [0, -0.025, -0.10]);
    bevel('z', [0, 0, -0.20], [0, 0, -0.125]);
    upper.cylinder(0.046, 0.56, [0, 0, 0], 'z', 4, 28);
    for (const z of [-0.24, 0.22]) {
      upper.circle(0.070, [0, 0, z], 'z', 24);
      upper.circle(0.086, [0, 0, z], 'z', 24);
    }
    batch(arm, upper, 'shoulder-input-support');

    // A short splined, articulated coupling bridges the small offset between
    // the two original yaw axes. Only this new line object changes transform.
    const coupling = drawing();
    coupling.cylinder(0.030, 1, [0, 0.5, 0], 'y', 6, 20);
    for (const y of [0, 0.08, 0.24, 0.76, 0.92, 1]) coupling.circle(y === 0 || y === 1 ? 0.047 : 0.038, [0, y, 0], 'y', 20);
    const connector = batch(arm, coupling, 'articulated-slew-coupling');
    const baseSocket = new THREE.Vector3(0, 1.13, -0.10);
    const armSocket = new THREE.Vector3(0, -0.35, -0.10);
    const from = new THREE.Vector3(), direction = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const api = {
      update() {
        drive.updateWorldMatrix(true, false);
        arm.updateWorldMatrix(true, false);
        from.copy(baseSocket);
        drive.localToWorld(from);
        arm.worldToLocal(from);
        direction.copy(armSocket).sub(from);
        const length = direction.length();
        connector.position.copy(from);
        connector.scale.set(1, length, 1);
        connector.quaternion.setFromUnitVectors(up, direction.normalize());
      },
    };
    api.update();
    return api;
  }

  function wheel(parent, side) {
    const d = drawing();
    d.cylinder(0.045, 0.34, [0, 0, 0], 'x', 4, 24);
    for (const x of [-0.12, 0.12]) {
      d.circle(0.225, [x, 0, 0], 'x', 40);
      d.circle(0.16, [x, 0, 0], 'x', 36);
      d.circle(0.082, [x, 0, 0], 'x', 28);
    }
    const ringPitch = 0.215, sunPitch = ringPitch / 3, orbit = sunPitch * 2;
    d.pitchGear(ringPitch, 36, [0, 0, 0], 'x', 0.075, true);
    d.pitchGear(sunPitch, 12, [0, 0, 0], 'x', 0.09, false, 0, 0.045);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * tau, y = Math.cos(a) * orbit, z = Math.sin(a) * orbit;
      d.pitchGear(sunPitch, 12, [0, y, z], 'x', 0.065, false, a + Math.PI / 12, 0.018);
      d.cylinder(0.016, 0.20, [0, y, z], 'x', 4, 16);
      d.circle(0.028, [side * 0.10, y, z], 'x', 20);
      d.segment([side * 0.10, 0, 0], [side * 0.10, y, z]);
    }
    d.circle(0.18, [side * 0.10, 0, 0], 'x', 32);
    for (const x of [-0.15, 0.15]) {
      d.circle(0.050, [x, 0, 0], 'x', 24);
      d.circle(0.067, [x, 0, 0], 'x', 24);
    }
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * tau;
      const front = [], back = [];
      for (const [r, da] of [[0.14, -0.055], [0.21, -0.055], [0.21, 0.055], [0.14, 0.055]]) {
        front.push([0.095, Math.cos(a + da) * r, Math.sin(a + da) * r]);
        back.push([-0.095, Math.cos(a + da) * r, Math.sin(a + da) * r]);
      }
      d.poly(front, true); d.poly(back, true);
      for (let j = 0; j < 4; j++) d.segment(front[j], back[j]);
    }
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * tau;
      d.circle(0.015, [side * 0.15, Math.cos(a) * 0.106, Math.sin(a) * 0.106], 'x', 12);
    }
    const object = batch(parent, d, 'wheel-hub-motor');
    object.userData.gearTrain = { sun: 12, planet: 12, ring: 36, sunPitch, planetPitch: sunPitch, ringPitch, orbit };
    return object;
  }

  function claw(parent, fingers = []) {
    const d = drawing();
    d.cylinder(0.067, 0.16, [0, 0.21, -0.09], 'z', 6, 28);
    d.cylinder(0.017, 0.25, [0, 0.21, -0.015], 'z', 4, 20);
    for (const z of [-0.17, 0.045]) {
      d.circle(0.026, [0, 0.21, z], 'z', 24);
      d.circle(0.038, [0, 0.21, z], 'z', 24);
    }
    // Linear guides and their bearings stay fixed to the original gripper body.
    for (const y of [0.15, 0.27]) {
      d.cylinder(0.015, 0.36, [0, y, -0.01], 'x', 4, 20);
      for (const side of [-1, 1]) {
        d.cylinder(0.028, 0.045, [side * 0.14, y, -0.01], 'x', 4, 24);
        d.cuboid(0.065, 0.04, 0.065, [side * 0.14, y, 0.045]);
      }
    }
    d.poly([[-0.055, 0.21, -0.10], [-0.12, 0.13, -0.12], [-0.17, 0.10, -0.12]]);
    d.cuboid(0.045, 0.035, 0.06, [-0.17, 0.10, -0.12]);
    batch(parent, d, 'gripper-rack-drive');

    const pitchRadius = 0.060, rackPitch = tau * pitchRadius / 12;
    const pinionRoot = new THREE.Group(); pinionRoot.position.set(0, 0.21, 0.075); parent.add(pinionRoot);
    pinionRoot.name = 'gripper-pinion-motion';
    const pinion = drawing();
    pinion.pitchGear(pitchRadius, 12, [0, 0, 0], 'z', 0.035, false, Math.PI / 12, 0.017);
    batch(pinionRoot, pinion, 'gripper-pinion');

    // Reverse-solve only the new sliders from the unchanged mirrored fingers.
    // Both tie rods have a fixed 0.055 length; neither rod telescopes.
    const rodLength = 0.055, clevisY = 0.27, socketZ = 0.075, referenceAngle = 0.11;
    const referenceLeverX = 0.22 - 0.055 * Math.cos(referenceAngle) + 0.045 * Math.sin(referenceAngle);
    const referenceLeverY = 0.34 - 0.055 * Math.sin(referenceAngle) - 0.045 * Math.cos(referenceAngle);
    const referenceX = referenceLeverX - Math.sqrt(rodLength ** 2 - (referenceLeverY - clevisY) ** 2);
    const racks = [-1, 1].map(side => {
      const y = side < 0 ? 0.27 : 0.15, sign = side < 0 ? -1 : 1;
      const rackRoot = new THREE.Group(); rackRoot.name = side < 0 ? 'gripper-upper-rack-motion' : 'gripper-lower-rack-motion'; parent.add(rackRoot);
      const rack = drawing(), points = [];
      for (let i = -5; i <= 5; i++) {
        const x = i * rackPitch;
        points.push([x - rackPitch * 0.46, y - sign * 0.0125, socketZ], [x - rackPitch * 0.22, y + sign * 0.01, socketZ], [x + rackPitch * 0.22, y + sign * 0.01, socketZ], [x + rackPitch * 0.46, y - sign * 0.0125, socketZ]);
      }
      rack.poly(points);
      rack.cuboid(0.36, 0.025, 0.025, [0, y - sign * 0.021, socketZ]);
      if (side > 0) rack.cuboid(0.025, clevisY - y, 0.03, [referenceX, (clevisY + y) / 2, socketZ]);
      rack.circle(0.018, [side * referenceX, clevisY, socketZ], 'z', 20);
      const object = batch(rackRoot, rack, side < 0 ? 'gripper-upper-rack' : 'gripper-lower-rack');
      object.userData.rackPitch = rackPitch;
      return rackRoot;
    });
    const followers = fingers.map((finger, i) => {
      const side = i === 0 ? -1 : 1;
      const localSocket = new THREE.Vector3(-side * 0.055, -0.045, socketZ);
      const lever = drawing();
      lever.cylinder(0.026, 0.13, [0, 0, 0.01], 'z', 4, 24);
      lever.segment([0, 0, socketZ], localSocket.toArray());
      lever.circle(0.018, localSocket.toArray(), 'z', 20);
      batch(finger, lever, 'finger-output-lever');
      const rod = drawing();
      rod.cylinder(0.009, 1, [0, 0.5, 0], 'y', 4, 16);
      for (const y of [0.08, 0.30, 0.78, 0.92]) rod.circle(0.014, [0, y, 0], 'y', 16);
      const connector = batch(parent, rod, 'gripper-pushrod');
      connector.scale.set(1, rodLength, 1);
      connector.userData.rodLength = rodLength;
      return { finger, side, localSocket, connector, destination: new THREE.Vector3(), clevis: new THREE.Vector3(), direction: new THREE.Vector3() };
    });
    const up = new THREE.Vector3(0, 1, 0);
    const api = {
      update() {
        parent.updateWorldMatrix(true, false);
        for (const [i, follower] of followers.entries()) {
          follower.finger.updateWorldMatrix(true, false);
          follower.destination.copy(follower.localSocket);
          follower.finger.localToWorld(follower.destination);
          parent.worldToLocal(follower.destination);
          // The original +/-0.075..0.145 finger angles stay well inside reach.
          // Guard unsupported poses without changing any original finger transform.
          const dy = THREE.MathUtils.clamp(follower.destination.y - clevisY, -rodLength + 1e-6, rodLength - 1e-6);
          const horizontal = Math.sqrt(rodLength ** 2 - dy ** 2);
          follower.clevis.set(follower.destination.x - follower.side * horizontal, clevisY, socketZ);
          racks[i].position.x = follower.clevis.x - follower.side * referenceX;
          follower.direction.copy(follower.destination).sub(follower.clevis).normalize();
          follower.connector.position.copy(follower.clevis);
          follower.connector.quaternion.setFromUnitVectors(up, follower.direction);
        }
        // Top contact moves -R*dAngle; the lower rack moves in the opposite direction.
        pinionRoot.rotation.z = -racks[0].position.x / pitchRadius;
      },
    };
    api.update();
    return api;
  }

  return {
    joint, link, chassis, wheel, claw, shoulderTransmission,
    dispose() {
      geometries.forEach(geometry => geometry.dispose());
      geometries.clear();
      if (ownMaterial) material.dispose();
    },
  };
}
