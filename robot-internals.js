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
    return { vertices, segment, poly, point, circle, cylinder, cuboid, gear, helix };
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
    // Twin ball races around a compact planetary reduction and its hollow shaft.
    for (const side of [-1, 1]) {
      const z = side * depth * 0.35;
      for (const r of [0.69, 0.83]) d.circle(radius * r, [0, 0, z], 'z', 48);
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * tau;
        const center = [Math.cos(a) * radius * 0.76, Math.sin(a) * radius * 0.76, z];
        d.circle(radius * 0.047, center, 'z', 12);
        d.circle(radius * 0.047, center, 'y', 12);
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
    d.gear(radius * 0.66, 28, [0, 0, depth * 0.10], 'z', depth * 0.07, true);
    d.gear(radius * 0.20, 12, [0, 0, depth * 0.10], 'z', depth * 0.12);
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * tau;
      const center = [Math.cos(a) * radius * 0.41, Math.sin(a) * radius * 0.41, depth * 0.10];
      d.gear(radius * 0.18, 10, center, 'z', depth * 0.09);
      d.circle(radius * 0.04, center, 'z', 16);
      d.segment([0, 0, depth * 0.18], [center[0], center[1], depth * 0.18]);
    }
    // Stator laminations and axial windings stay inside the roller envelope.
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * tau;
      const r = radius * 0.37;
      d.segment([Math.cos(a) * r, Math.sin(a) * r, -depth * 0.29], [Math.cos(a) * r, Math.sin(a) * r, -depth * 0.02]);
    }
    return batch(parent, d, 'joint');
  }

  function link(parent, length, wide, depthScale = 1) {
    const d = drawing();
    const motorRadius = wide * 0.19;
    const motorY = length * 0.25;
    d.cylinder(motorRadius, length * 0.25, [0, motorY, 0], 'y', 8, 32);
    for (const y of [length * 0.12, length * 0.38]) {
      d.cylinder(motorRadius * 1.17, 0.025, [0, y, 0], 'y', 4, 32);
      d.circle(motorRadius * 0.66, [0, y, 0], 'y', 28);
    }
    const screwStart = length * 0.38, screwEnd = length - 0.19;
    const screwLength = screwEnd - screwStart;
    d.cylinder(wide * 0.049, screwLength, [0, (screwStart + screwEnd) / 2, 0], 'y', 4, 24);
    d.helix(wide * 0.067, screwLength, Math.max(6, screwLength / 0.068), [0, (screwStart + screwEnd) / 2, 0], 'y');
    for (const side of [-1, 1]) {
      const x = side * wide * 0.28;
      d.cylinder(0.014, length - 0.35, [x, length / 2, -0.055 * depthScale], 'y', 3, 20);
      for (const y of [length * 0.17, length * 0.66, length * 0.85]) d.cylinder(0.024, 0.045, [x, y, -0.055 * depthScale], 'y', 4, 20);
      d.poly([[side * wide * 0.34, 0.17, 0.10 * depthScale], [side * wide * 0.34, length * 0.42, 0.10 * depthScale], [side * wide * 0.20, length * 0.47, 0.10 * depthScale], [side * wide * 0.20, length - 0.18, 0.10 * depthScale]]);
    }
    d.cuboid(wide * 0.57, 0.12, 0.18 * depthScale, [0, length * 0.66, 0]);
    d.cylinder(wide * 0.10, 0.14, [0, length * 0.66, 0], 'y', 4, 28);
    d.cuboid(wide * 0.48, 0.055, 0.12 * depthScale, [0, length * 0.16, 0]);
    batch(parent, d, 'link-actuator');

    const e = drawing();
    for (const side of [-1, 1]) e.cylinder(wide * 0.045, 1, [side * wide * 0.20, 0.5, 0], 'y', 3, 16);
    e.cylinder(wide * 0.035, 1, [0, 0.5, 0], 'y', 3, 20);
    e.helix(wide * 0.055, 1, 8, [0, 0.5, 0], 'y');
    const extension = batch(parent, e, 'telescoping-spindle');
    const railRoot = length - 0.43;
    const api = {
      setLength(actual) {
        extension.position.y = railRoot;
        extension.scale.y = Math.max(0.04, actual - 0.16 - railRoot);
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
    return batch(parent, d, 'chassis-drivetrain');
  }

  function shoulderTransmission({ drive, arm }) {
    // The yaw motor drives the existing slew ring from inside the chassis.
    const base = drawing();
    const ringCenter = [0, 0.94, -0.10];
    base.cylinder(0.080, 0.24, [0.50, 0.70, -0.10], 'y', 6, 24);
    for (const y of [0.58, 0.82]) base.circle(0.092, [0.50, y, -0.10], 'y', 24);
    base.cylinder(0.026, 0.13, [0.50, 0.875, -0.10], 'y', 4, 20);
    base.gear(0.102, 10, [0.50, 0.94, -0.10], 'y', 0.04);
    base.gear(0.43, 40, ringCenter, 'y', 0.04);
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
    d.gear(0.25, 24, [0, 0, 0], 'x', 0.075, true);
    d.gear(0.062, 12, [side * 0.06, 0, 0], 'x', 0.09);
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
    return batch(parent, d, 'wheel-hub-motor');
  }

  function claw(parent) {
    const d = drawing();
    d.cylinder(0.067, 0.16, [0, 0.21, -0.09], 'z', 6, 28);
    d.cylinder(0.017, 0.25, [0, 0.21, -0.015], 'z', 4, 20);
    d.gear(0.063, 12, [0, 0.21, 0.075], 'z', 0.035);
    for (const y of [0.15, 0.27]) {
      d.cylinder(0.015, 0.36, [0, y, -0.01], 'x', 4, 20);
      for (const side of [-1, 1]) d.cylinder(0.028, 0.045, [side * 0.14, y, -0.01], 'x', 4, 24);
      const points = [];
      const toothSign = y < 0.21 ? 1 : -1;
      for (let i = 0; i <= 14; i++) points.push([-0.18 + i / 14 * 0.36, y + (i % 2 ? 0.012 * toothSign : 0), 0.075]);
      d.poly(points);
    }
    for (const side of [-1, 1]) d.poly([[side * 0.13, 0.27, 0.01], [side * 0.19, 0.31, 0.01], [side * 0.20, 0.35, 0.01]]);
    return batch(parent, d, 'gripper-rack-drive');
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
