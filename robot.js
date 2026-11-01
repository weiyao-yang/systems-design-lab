import * as THREE from './three.module.js';
import { createTechnicalDrawing } from './robot-drawing.js?v=27';
import { createMechanicalInternals } from './robot-internals.js?v=27';
import { createModalRig } from './modal-rig.js?v=33';

const ARM = { upper: 1.52, lower: 1.36, shoulderY: -0.58, tool: 0.96 };

// Match the homepage's pixel magnification when its canvas moves into the
// fullscreen dialog, including the extended mobile viewport and wide FOV.
export function setRobotCameraViewport(camera, {
  width, height, homeWidth = width, homeHeight = height, compact = false, modal = false,
}) {
  const virtualHeight = compact ? homeHeight * (0.43 / 0.78) : homeHeight;
  camera.clearViewOffset();
  camera.fov = !compact && homeWidth / virtualHeight > 1.9 ? 30 : 33;
  camera.zoom = modal ? virtualHeight / height : 1;
  camera.aspect = modal ? width / height : width / virtualHeight;
  if (compact && !modal) camera.setViewOffset(width, virtualHeight, 0, 0, width, height);
  camera.updateProjectionMatrix();
}

// Pick an exact point on the label's camera ray. Low labels are reached in
// front of the base, above the floor, rather than projected below the floor.
export function mapRobotTarget(nx, ny, camera) {
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(nx * 2 - 1, 1 - ny * 2), camera);
  let distance = -ray.ray.origin.z / ray.ray.direction.z;
  const floorClearance = -1.30;
  if (ray.ray.direction.y < 0) distance = Math.min(distance, (floorClearance - ray.ray.origin.y) / ray.ray.direction.y);
  return ray.ray.at(Math.max(0.5, distance), new THREE.Vector3());
}

// The original folded pose is retained for idle, independently of reaching.
export function solveRobotPose(targetX, targetY, { yaw = 0, heading = null, wristOffset = 0.10 } = {}) {
  const yawCos = Math.cos(yaw);
  let x = targetX / yawCos, y = targetY - ARM.shoulderY;
  let d = Math.hypot(x, y);
  const radius = THREE.MathUtils.clamp(d, 0.55, ARM.upper + ARM.lower - 0.035);
  if (d > 0.00001) { x *= radius / d; y *= radius / d; }
  else { x = 0; y = radius; }
  d = radius;
  const q2 = -Math.acos(THREE.MathUtils.clamp((d * d - ARM.upper ** 2 - ARM.lower ** 2) / (2 * ARM.upper * ARM.lower), -1, 1));
  const q1 = Math.atan2(y, x) - Math.atan2(ARM.lower * Math.sin(q2), ARM.upper + ARM.lower * Math.cos(q2));
  let phi = heading === null ? q1 + q2 + wristOffset : Math.atan2(Math.sin(heading), Math.cos(heading) / yawCos);
  const endY = ARM.shoulderY + y;
  // Keep the full jaw envelope above the floor, including its side clearance.
  const allowedDown = THREE.MathUtils.clamp((endY + 1.98 - 0.36) / 0.97, 0.05, 1);
  if (Math.sin(phi) < -allowedDown) phi = Math.cos(phi) >= 0 ? -Math.asin(allowedDown) : -Math.PI + Math.asin(allowedDown);
  return {
    q1, q2, wrist: phi - q1 - q2, heading: phi,
    endX: x * yawCos, endY,
    tipX: (x + ARM.tool * Math.cos(phi)) * yawCos,
    tipY: endY + ARM.tool * Math.sin(phi),
  };
}

// Exact 3D contact IK. The offset is measured from the two real front pads.
// The turret solves its own yaw; the links telescope only when required.
export function solveRobotContact(target, offset, phi = null) {
  const radius = Math.hypot(target.x, target.z);
  const z = offset.z;
  const yaw = Math.asin(THREE.MathUtils.clamp(z / Math.max(radius, Math.abs(z) + 0.00001), -1, 1)) - Math.atan2(target.z, target.x);
  const localX = target.x * Math.cos(yaw) - target.z * Math.sin(yaw);
  const localY = target.y - ARM.shoulderY;
  if (phi === null) phi = Math.atan2(localY, localX);
  const offsetX = offset.x * Math.sin(phi) + offset.y * Math.cos(phi);
  const offsetY = -offset.x * Math.cos(phi) + offset.y * Math.sin(phi);
  const x = localX - offsetX, y = localY - offsetY;
  const distance = Math.hypot(x, y);
  const foldedReach = Math.sqrt(ARM.upper ** 2 + ARM.lower ** 2 + 2 * ARM.upper * ARM.lower * Math.cos(0.50));
  const extension = Math.max(1, distance / foldedReach);
  const l1 = ARM.upper * extension, l2 = ARM.lower * extension;
  const q2 = -Math.acos(THREE.MathUtils.clamp((distance ** 2 - l1 ** 2 - l2 ** 2) / (2 * l1 * l2), -1, 1));
  const q1 = Math.atan2(y, x) - Math.atan2(l2 * Math.sin(q2), l1 + l2 * Math.cos(q2));
  return { yaw, q1, q2, wrist: phi - q1 - q2, phi, l1, l2, extension };
}

// A small, purpose-built articulated machine. Every visible part is geometry.
export async function createRobotScene(canvas, options = {}) {
  const homeContainer = document.querySelector('#lab');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.23;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 60);
  const palette = {
    blue: 0x174cbb, blueLight: 0x3479e1, blueDark: 0x12316d,
    orange: 0xff742f, orangeDark: 0xbb3e16, cream: 0xf3f1e7,
    navy: 0x182334, metal: 0x8794a7, lightMetal: 0xd8dfe6,
    rubber: 0x1a202b, cyan: 0x71f2f8,
  };
  const materials = {};
  Object.entries(palette).forEach(([name, color]) => {
    materials[name] = new THREE.MeshStandardMaterial({
      color,
      metalness: name.includes('Metal') || name === 'metal' ? 0.8 : name === 'rubber' ? 0.05 : 0.36,
      roughness: name === 'rubber' ? 0.83 : name === 'cream' ? 0.37 : 0.30,
    });
  });
  materials.cyan.emissive = new THREE.Color(palette.cyan);
  materials.cyan.emissiveIntensity = 1.6;
  materials.orangeLed = new THREE.MeshStandardMaterial({ color: 0xffb47d, emissive: 0xff5425, emissiveIntensity: 1.9, roughness: 0.25 });
  materials.darkGlass = new THREE.MeshStandardMaterial({ color: 0x071b31, metalness: 0.65, roughness: 0.17 });

  scene.add(new THREE.HemisphereLight(0xf4f5ff, 0x646b96, 2.6));
  const key = new THREE.DirectionalLight(0xfff7ee, 4.4);
  key.position.set(-4, 8, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 6, bottom: -4, near: 0.5, far: 25 });
  key.shadow.normalBias = 0.025;
  key.shadow.bias = -0.0001;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xb7d6ff, 3.4);
  rim.position.set(5, 4, -5);
  scene.add(rim);
  const front = new THREE.DirectionalLight(0xffffff, 0.75);
  front.position.set(1, 1, 8);
  scene.add(front);

  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ color: 0x3b3554, opacity: 0.20 }));
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -1.98;
  shadowPlane.receiveShadow = true;
  shadowPlane.visible = false;
  scene.add(shadowPlane);

  const allGeometries = new Set();
  const allTextures = [];
  const drawingSurfaces = [];
  const mechanismMaterial = new THREE.LineBasicMaterial({
    color: 0xf27620, transparent: true, opacity: 0.88,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  const mechanics = createMechanicalInternals({ THREE, lineMaterial: mechanismMaterial });
  function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
    allGeometries.add(geometry);
    const object = new THREE.Mesh(geometry, typeof material === 'string' ? materials[material] : material);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.drawingRole = 'shell';
    drawingSurfaces.push(object);
    parent.add(object);
    return object;
  }
  // Color follows component function: service and drivetrain hardware are
  // internal even when exposed; housings and protective covers stay shell blue.
  function internal(object, part) {
    object.userData.drawingRole = 'internal';
    object.userData.internalPart = part;
    return object;
  }
  function box(parent, w, h, d, mat, x = 0, y = 0, z = 0, bevel = 0.035) {
    const shape = new THREE.Shape();
    const cut = Math.min(w, h) * 0.14;
    shape.moveTo(-w / 2 + cut, -h / 2);
    shape.lineTo(w / 2 - cut, -h / 2);
    shape.lineTo(w / 2, -h / 2 + cut);
    shape.lineTo(w / 2, h / 2 - cut);
    shape.lineTo(w / 2 - cut, h / 2);
    shape.lineTo(-w / 2 + cut, h / 2);
    shape.lineTo(-w / 2, h / 2 - cut);
    shape.lineTo(-w / 2, -h / 2 + cut);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.015, d - bevel * 2), bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: bevel, bevelThickness: bevel });
    g.translate(0, 0, -d / 2 + bevel);
    return mesh(g, mat, parent, x, y, z);
  }
  function cyl(parent, radius, depth, mat, x = 0, y = 0, z = 0, axis = 'z', segments = 48) {
    const object = mesh(new THREE.CylinderGeometry(radius, radius, depth, segments), mat, parent, x, y, z);
    if (axis === 'z') object.rotation.x = Math.PI / 2;
    if (axis === 'x') object.rotation.z = Math.PI / 2;
    return object;
  }
  function ring(parent, r, tube, mat, x = 0, y = 0, z = 0, axis = 'z') {
    const object = mesh(new THREE.TorusGeometry(r, tube, 10, 64), mat, parent, x, y, z);
    if (axis === 'y') object.rotation.x = Math.PI / 2;
    if (axis === 'x') object.rotation.y = Math.PI / 2;
    return object;
  }
  function bolts(parent, r, z, count = 8, size = 0.023) {
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      const bolt = cyl(parent, size, 0.022, 'lightMetal', Math.cos(a) * r, Math.sin(a) * r, z, 'z', 6);
      bolt.rotation.z = a;
      const slot = mesh(new THREE.BoxGeometry(size * 0.95, 0.007, 0.004), 'navy', parent, Math.cos(a) * r, Math.sin(a) * r, z + 0.013);
      slot.rotation.z = a + 0.5;
    }
  }
  function textPlate(parent, text, width, height, x, y, z, bg = '#f4f1e8', color = '#143773') {
    const c = document.createElement('canvas'); c.width = 512; c.height = 192;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = color; ctx.font = 'bold 102px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 103);
    const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
    allTextures.push(texture);
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.45, metalness: 0.15 });
    const label = mesh(new THREE.PlaneGeometry(width, height), mat, parent, x, y, z);
    label.castShadow = false;
    return label;
  }
  function pipe(parent, points, radius, material, part = 'service-hose') {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    return internal(mesh(new THREE.TubeGeometry(curve, 32, radius, 7, false), material, parent), part);
  }

  // Lifted, wide-track drive unit: off-road pickup proportions, no cabin.
  const drive = new THREE.Group(); drive.userData.drawingRoot = true; drive.scale.setScalar(0.65); drive.position.y = -1.746; scene.add(drive);
  box(drive, 1.64, 0.26, 2.05, 'navy', 0, 0.33, 0, 0.055);
  box(drive, 1.70, 0.26, 2.02, 'blue', 0, 0.58, 0, 0.055);
  box(drive, 1.64, 0.09, 1.88, 'orange', 0, 0.73, 0, 0.024);
  box(drive, 1.56, 0.10, 1.77, 'cream', 0, 0.80, 0, 0.03);
  // Stepped bonnet plates and twin cooling strips suggest a muscle pickup.
  box(drive, 0.84, 0.10, 0.63, 'blueDark', 0, 0.88, 0.48, 0.03);
  for (const s of [-1, 1]) {
    box(drive, 0.105, 0.028, 0.64, 'orange', s * 0.28, 0.948, 0.48, 0.007);
    internal(box(drive, 0.12, 0.055, 1.10, 'metal', s * 0.84, 0.32, 0, 0.012), 'chassis-frame-rail');
    internal(box(drive, 0.16, 0.04, 0.53, 'navy', s * 0.89, 0.40, 0, 0.012), 'chassis-frame-bracket');
  }
  // Wide recessed grille, square lamps, bull bar, orange recovery hooks.
  box(drive, 1.66, 0.33, 0.11, 'cream', 0, 0.57, 1.06, 0.027);
  box(drive, 0.95, 0.25, 0.055, 'darkGlass', 0, 0.57, 1.132, 0.014);
  for (let i = 0; i < 7; i++) box(drive, 0.045, 0.19, 0.037, 'metal', (i - 3) * 0.12, 0.57, 1.174, 0.007);
  for (const s of [-1, 1]) {
    box(drive, 0.26, 0.19, 0.075, 'blueDark', s * 0.66, 0.57, 1.139, 0.018);
    box(drive, 0.18, 0.09, 0.027, 'cyan', s * 0.66, 0.59, 1.193, 0.009);
    box(drive, 0.18, 0.032, 0.027, 'orangeLed', s * 0.66, 0.51, 1.195, 0.007);
  }
  box(drive, 1.91, 0.19, 0.20, 'navy', 0, 0.29, 1.16, 0.045);
  box(drive, 1.66, 0.065, 0.045, 'orange', 0, 0.315, 1.286, 0.014);
  const skidPlate = box(drive, 1.17, 0.23, 0.09, 'metal', 0, 0.12, 1.16, 0.022);
  skidPlate.rotation.x = -0.32;
  for (let i = 0; i < 4; i++) box(drive, 0.10, 0.025, 0.019, 'navy', (i - 1.5) * 0.23, 0.12, 1.222, 0.006);
  textPlate(drive, 'SDL—01', 0.52, 0.13, 0, 0.78, 1.117, '#174cbb', '#f3f1e7');
  for (const s of [-1, 1]) {
    const tow = ring(drive, 0.095, 0.028, 'orange', s * 0.65, 0.19, 1.32);
    tow.scale.y = 0.8;
    cyl(drive, 0.033, 0.15, 'lightMetal', s * 0.65, 0.26, 1.32, 'y');
  }
  box(drive, 1.72, 0.16, 0.13, 'blueDark', 0, 0.40, -1.11, 0.028);
  for (const s of [-1, 1]) box(drive, 0.20, 0.06, 0.028, 'orangeLed', s * 0.63, 0.45, -1.194, 0.008);

  function rodBetween(parent, from, to, radius, material) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const object = cyl(parent, radius, direction.length(), material, 0, 0, 0, 'y');
    object.position.copy(a.add(b).multiplyScalar(0.5));
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return internal(object, 'suspension-link');
  }
  // A real open arch. Its inside radius clears the tire by 10 cm.
  function wheelArch(parent, inner, outer, width, material, x, y, z) {
    const shape = new THREE.Shape();
    const steps = 12;
    for (let i = 0; i <= steps; i++) {
      const a = i / steps * Math.PI;
      const u = Math.cos(a) * outer, v = Math.sin(a) * outer;
      if (i === 0) shape.moveTo(u, v); else shape.lineTo(u, v);
    }
    for (let i = steps; i >= 0; i--) {
      const a = i / steps * Math.PI;
      shape.lineTo(Math.cos(a) * inner, Math.sin(a) * inner);
    }
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.014, bevelThickness: 0.014, steps: 1 });
    g.translate(0, 0, -width / 2); g.rotateY(Math.PI / 2);
    return mesh(g, material, parent, x, y, z);
  }
  const wheels = [];
  const wheelY = 0.161;
  // Compact rugged chassis: scaled tread tips still meet the original ground.
  for (const end of [-1, 1]) {
    internal(cyl(drive, 0.073, 2.03, 'metal', 0, wheelY, end * 0.78, 'x'), 'axle-shaft');
    internal(cyl(drive, 0.15, 0.28, 'blueDark', 0, wheelY, end * 0.78, 'x', 12), 'axle-differential');
    internal(box(drive, 0.30, 0.13, 0.27, 'orange', 0, wheelY + 0.03, end * 0.78, 0.03), 'axle-gearbox');
  }
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const wheel = new THREE.Group(); wheel.userData.drawingRoot = true; wheel.position.set(side * 1.16, wheelY, end * 0.78); drive.add(wheel); wheels.push(wheel);
    cyl(wheel, 0.456, 0.38, 'rubber', 0, 0, 0, 'x');
    ring(wheel, 0.382, 0.073, 'rubber', side * 0.145, 0, 0, 'x');
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * Math.PI * 2;
      // Staggered, chunky all-terrain tread rather than smooth toy wheels.
      for (const row of [-1, 1]) {
        const b = a + row * 0.035;
        const tread = mesh(new THREE.BoxGeometry(0.215, 0.082, 0.095), 'rubber', wheel, row * 0.102, Math.sin(b) * 0.455, Math.cos(b) * 0.455);
        tread.rotation.x = -b; tread.rotation.y = row * 0.18;
      }
    }
    ring(wheel, 0.295, 0.038, 'navy', side * 0.207, 0, 0, 'x');
    internal(cyl(wheel, 0.274, 0.024, 'metal', side * 0.218, 0, 0, 'x'), 'wheel-brake-disc');
    cyl(wheel, 0.232, 0.035, 'blue', side * 0.234, 0, 0, 'x');
    internal(cyl(wheel, 0.110, 0.061, 'orange', side * 0.263, 0, 0, 'x'), 'wheel-drive-hub');
    internal(cyl(wheel, 0.042, 0.065, 'lightMetal', side * 0.291, 0, 0, 'x', 6), 'wheel-axle-locknut');
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      cyl(wheel, 0.017, 0.022, 'lightMetal', side * 0.264, Math.cos(a) * 0.175, Math.sin(a) * 0.175, 'x', 6);
      const spoke = mesh(new THREE.BoxGeometry(0.018, 0.060, 0.10), 'blueDark', wheel, side * 0.257, Math.cos(a) * 0.222, Math.sin(a) * 0.222);
      spoke.rotation.x = a;
    }
    wheelArch(drive, 0.60, 0.72, 0.56, 'blue', side * 1.16, wheelY, end * 0.78);
    wheelArch(drive, 0.602, 0.636, 0.036, 'orange', side * 1.469, wheelY, end * 0.78);
    wheelArch(drive, 0.676, 0.709, 0.032, 'cream', side * 1.471, wheelY, end * 0.78);
    for (let i = 0; i < 7; i++) {
      const a = (i + 0.5) / 7 * Math.PI;
      cyl(drive, 0.020, 0.028, 'lightMetal', side * 1.485, wheelY + Math.sin(a) * 0.658, end * 0.78 + Math.cos(a) * 0.658, 'x', 6);
    }
    // Exposed coil-over and diagonal control arms inside the lifted arch.
    rodBetween(drive, [side * 0.61, 0.44, end * 0.64], [side * 0.98, wheelY, end * 0.78], 0.052, 'blueDark');
    rodBetween(drive, [side * 0.65, 0.35, end * 0.90], [side * 1.00, wheelY, end * 0.78], 0.041, 'metal');
    internal(cyl(drive, 0.035, 0.42, 'lightMetal', side * 0.90, 0.35, end * 0.78, 'y'), 'suspension-damper-rod');
    const springPoints = [];
    for (let i = 0; i <= 100; i++) {
      const t = i / 100, a = t * Math.PI * 12;
      springPoints.push([side * 0.90 + Math.cos(a) * 0.075, 0.19 + t * 0.36, end * 0.78 + Math.sin(a) * 0.075]);
    }
    pipe(drive, springPoints, 0.014, 'orange', 'suspension-spring');
    mechanics.wheel(wheel, side);
  }
  // Exposed slew bearing beneath the circular shoulder roller.
  cyl(drive, 0.62, 0.10, 'navy', 0, 0.88, -0.10, 'y');
  internal(cyl(drive, 0.54, 0.13, 'orange', 0, 0.98, -0.10, 'y'), 'slew-bearing-rotor');
  cyl(drive, 0.47, 0.075, 'metal', 0, 1.065, -0.10, 'y');
  internal(ring(drive, 0.535, 0.026, 'lightMetal', 0, 1.03, -0.10, 'y'), 'slew-bearing-race');
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    const tooth = mesh(new THREE.BoxGeometry(0.05, 0.055, 0.085), 'blueDark', drive, Math.sin(a) * 0.566, 0.90, -0.10 + Math.cos(a) * 0.566);
    tooth.rotation.y = a;
    internal(tooth, 'slew-ring-tooth');
  }
  mechanics.chassis(drive);
  const arm = new THREE.Group(); arm.position.set(0, -0.58, 0); scene.add(arm);
  const shoulder = new THREE.Group(); shoulder.userData.drawingRoot = true; arm.add(shoulder);
  const shoulderTransmission = mechanics.shoulderTransmission({ drive, arm });
  const L1 = ARM.upper, L2 = ARM.lower;
  function joint(parent, radius, depth, mainMaterial = 'orange') {
    cyl(parent, radius, depth, 'navy');
    internal(cyl(parent, radius * 0.88, depth + 0.055, 'metal'), 'joint-rotor');
    for (const side of [-1, 1]) {
      cyl(parent, radius * 0.91, 0.085, mainMaterial, 0, 0, side * (depth / 2 + 0.06));
      ring(parent, radius * 0.72, 0.023, 'blueDark', 0, 0, side * (depth / 2 + 0.11));
      cyl(parent, radius * 0.56, 0.045, 'cream', 0, 0, side * (depth / 2 + 0.11));
      internal(cyl(parent, radius * 0.30, 0.061, 'blueDark', 0, 0, side * (depth / 2 + 0.13)), 'joint-output-hub');
    }
    bolts(parent, radius * 0.74, depth / 2 + 0.112, 8, radius * 0.065);
    cyl(parent, radius * 0.12, 0.04, 'cyan', 0, 0, depth / 2 + 0.18);
    mechanics.joint(parent, radius, depth);
  }
  joint(shoulder, 0.40, 0.65, 'orange');
  function link(parent, length, wide, number, primary = 'blue', depthScale = 1.1) {
    // Width grows independently of link length, so the IK stays exact.
    const holder = parent;
    const armor = new THREE.Group(); parent.add(armor); armor.scale.z = depthScale; parent = armor;
    internal(box(parent, wide * 0.53, length - 0.22, 0.32, 'navy', 0, length / 2, 0, 0.05), 'link-inner-spine');
    box(parent, wide, length - 0.34, 0.43, primary, 0, length / 2, 0.015, 0.048);
    box(parent, wide * 0.65, length - 0.47, 0.043, 'blueLight', -wide * 0.065, length / 2 + 0.01, 0.259, 0.014);
    box(parent, wide * 0.36, length * 0.52, 0.043, 'cream', wide * 0.08, length / 2 + 0.13, 0.29, 0.016);
    box(parent, 0.065, length - 0.5, 0.073, 'orange', -wide * 0.42, length / 2, 0.267, 0.013);
    box(parent, wide * 0.78, 0.125, 0.49, 'cream', 0, length * 0.26, 0.01, 0.018);
    box(parent, wide * 0.75, 0.055, 0.033, 'navy', 0, length * 0.26, 0.282, 0.006);
    for (const x of [-1, 1]) for (const y of [length * 0.20, length * 0.79]) {
      cyl(parent, 0.019, 0.014, 'lightMetal', x * wide * 0.33, y, 0.267, 'z', 6);
    }
    textPlate(parent, number, wide * 0.42, 0.17, wide * 0.08, length * 0.63, 0.32);
    // Exposed hydraulic ram along the side of each arm link.
    internal(cyl(parent, 0.065, length * 0.56, 'navy', wide * 0.54, length * 0.40, -0.05, 'y'), 'linear-actuator-cylinder');
    internal(cyl(parent, 0.038, length * 0.43, 'lightMetal', wide * 0.54, length * 0.74, -0.05, 'y'), 'linear-actuator-piston');
    for (const y of [length * 0.16, length * 0.65]) internal(ring(parent, 0.068, 0.016, 'orange', wide * 0.54, y, -0.05, 'y'), 'linear-actuator-gland');
    pipe(parent, [[-wide * 0.32, 0.12, -0.25], [-wide * 0.64, length * 0.3, -0.3], [-wide * 0.62, length * 0.7, -0.3], [-wide * 0.25, length - 0.10, -0.22]], 0.034, 'navy');
    pipe(parent, [[-wide * 0.4, 0.18, -0.28], [-wide * 0.77, length * 0.35, -0.30], [-wide * 0.70, length * 0.66, -0.30], [-wide * 0.29, length - 0.15, -0.23]], 0.019, 'orange');
    // Fixed armor sleeves expose polished telescoping rails during a reach.
    const railRoot = length - 0.43;
    const rails = [-1, 1].map(side => internal(cyl(holder, wide * 0.11, 1, 'lightMetal', side * wide * 0.24, 0, -0.015, 'y'), 'telescoping-guide-rail'));
    const core = internal(box(holder, wide * 0.29, 1, 0.19 * depthScale, 'blueDark', 0, 0, -0.025, 0.017), 'telescoping-core');
    const cuff = box(holder, wide * 0.78, 0.13, 0.36 * depthScale, 'orange', 0, length - 0.12, 0, 0.018);
    for (const object of [...rails, core, cuff]) object.userData.drawingRoot = true;
    const internalLink = mechanics.link(holder, length, wide, depthScale);
    return {
      setLength(actual) {
        const railLength = Math.max(0.04, actual - 0.16 - railRoot);
        for (const object of [...rails, core]) {
          object.scale.y = railLength;
          object.position.y = railRoot + railLength / 2;
        }
        cuff.position.y = actual - 0.16;
        internalLink.setLength(actual);
      },
    };
  }
  const upperLink = link(shoulder, L1, 0.36, '01', 'blue', 0.90);
  const elbow = new THREE.Group(); elbow.userData.drawingRoot = true; elbow.position.y = L1; shoulder.add(elbow);
  joint(elbow, 0.32, 0.58, 'blue');
  internal(ring(elbow, 0.263, 0.027, 'orange', 0, 0, 0.36), 'elbow-bearing-race');
  const forearmLink = link(elbow, L2, 0.56, '02', 'blue', 1.10);
  const wrist = new THREE.Group(); wrist.userData.drawingRoot = true; wrist.position.y = L2; elbow.add(wrist);
  joint(wrist, 0.225, 0.42, 'orange');
  const claw = new THREE.Group(); claw.position.y = 0.08; wrist.add(claw);
  box(claw, 0.44, 0.30, 0.41, 'blueDark', 0, 0.22, 0, 0.037);
  box(claw, 0.50, 0.105, 0.46, 'orange', 0, 0.105, 0, 0.023);
  box(claw, 0.36, 0.17, 0.08, 'cream', 0, 0.24, 0.24, 0.026);
  box(claw, 0.21, 0.055, 0.023, 'cyan', 0, 0.245, 0.291, 0.008);
  for (const s of [-1, 1]) {
    box(claw, 0.10, 0.24, 0.37, 'blue', s * 0.25, 0.23, -0.015, 0.018);
    cyl(claw, 0.025, 0.026, 'lightMetal', s * 0.252, 0.23, 0.191, 'z', 6);
  }
  const fingers = [], tipMarkers = [];
  for (const side of [-1, 1]) {
    const finger = new THREE.Group(); finger.userData.drawingRoot = true; finger.position.set(side * 0.22, 0.34, 0); claw.add(finger); fingers.push(finger);
    cyl(finger, 0.083, 0.25, 'metal', 0, 0, 0, 'z');
    internal(cyl(finger, 0.045, 0.265, 'orange', 0, 0, 0, 'z', 8), 'gripper-pivot-shaft');
    const segment = box(finger, 0.12, 0.31, 0.20, 'orange', side * 0.038, 0.15, 0, 0.025);
    segment.rotation.z = side * -0.20;
    const tip = box(finger, 0.105, 0.21, 0.17, 'navy', side * 0.028, 0.36, 0, 0.018);
    tip.rotation.z = side * 0.48;
    const pad = box(finger, 0.044, 0.11, 0.19, 'metal', side * -0.014, 0.41, 0, 0.01);
    pad.rotation.z = side * 0.48;
    const tipMarker = new THREE.Object3D(); tipMarker.position.set(0, 0.0475, 0.095); pad.add(tipMarker); tipMarkers.push(tipMarker);
    for (let i = 0; i < 3; i++) box(finger, 0.018, 0.012, 0.20, 'rubber', side * -0.035, 0.355 + i * 0.035, 0, 0.003);
  }
  const internalClaw = mechanics.claw(claw, fingers);
  // This explicit anchor is recomputed from the real pad surfaces, never from
  // a guessed wrist/tool length. It remains centered between the front tips.
  const contactAnchor = new THREE.Object3D(); contactAnchor.name = 'front-fingertip-contact'; claw.add(contactAnchor);
  const measuredOffset = new THREE.Vector3(), padA = new THREE.Vector3(), padB = new THREE.Vector3();
  function measureContactOffset() {
    claw.updateWorldMatrix(true, true);
    tipMarkers[0].getWorldPosition(padA); tipMarkers[1].getWorldPosition(padB);
    contactAnchor.position.copy(claw.worldToLocal(padA.add(padB).multiplyScalar(0.5)));
    claw.updateMatrix();
    return measuredOffset.copy(contactAnchor.position).applyMatrix4(claw.matrix);
  }

  // A discreet sensor pod on the shoulder gives the machine a focal point.
  const sensor = new THREE.Group(); sensor.position.set(0.20, 0.01, 0.43); sensor.scale.setScalar(1.1); shoulder.add(sensor);
  box(sensor, 0.20, 0.11, 0.10, 'navy', 0, 0, 0, 0.02);
  cyl(sensor, 0.033, 0.022, 'cyan', 0.037, 0, 0.066);
  cyl(sensor, 0.018, 0.023, 'orangeLed', -0.05, 0, 0.066);

  scene.updateMatrixWorld(true);
  const technicalDrawing = createTechnicalDrawing(THREE, drawingSurfaces, { color: 0x165fc9 });
  scene.traverse(object => {
    if (object.userData.drawingRole === 'mechanism') object.renderOrder = 20;
  });

  let width = 0, height = 0, disposed = false, active = false, hovered = false;
  let frameId = 0, last = performance.now();
  let driveYaw = -0.13, targetYaw = -0.13;
  let requestedScreen = null, requestedContact = null, lastPose = null;
  let currentRadius = null, currentAzimuth = 0, currentHeight = 0, currentPhi = 0;
  const currentContact = new THREE.Vector3();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const modalRig = createModalRig(THREE, {
    camera, scene, renderer, arm, shoulder, elbow, wrist, upperLink, forearmLink,
    shoulderTransmission, contactAnchor, reducedMotion,
    getViewport: () => ({ width, height }),
  });

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    let homeRect = rect;
    if (modalRig.enabled) {
      // Read the real responsive homepage size on resize/orientation changes
      // without moving the live canvas or duplicating its CSS breakpoints.
      const probe = document.createElement('div');
      probe.className = 'scene'; probe.style.visibility = 'hidden';
      homeContainer.append(probe);
      homeRect = probe.getBoundingClientRect(); probe.remove();
    }
    camera.position.set(3.65, 2.70, 10.8);
    camera.lookAt(0, 0.24, 0);
    setRobotCameraViewport(camera, {
      width, height, homeWidth: Math.max(1, homeRect.width), homeHeight: Math.max(1, homeRect.height),
      compact: (window.innerWidth || width) <= 700, modal: modalRig.enabled,
    });
    camera.updateMatrixWorld();
    renderer.setSize(width, height, false);
    if (requestedScreen) requestedContact = mapRobotTarget(requestedScreen.x, requestedScreen.y, camera);
  }
  function aimAt(nx, ny) {
    requestedScreen = { x: nx, y: ny };
    requestedContact = mapRobotTarget(nx, ny, camera);
    hovered = true;
    targetYaw = THREE.MathUtils.clamp((nx - 0.5) * 1.3, -0.55, 0.55);
  }
  function resetAim() { hovered = false; requestedScreen = null; requestedContact = null; targetYaw = -0.13; }
  function setActive(value) { active = Boolean(value); }
  function setModalMode(value) {
    modalRig.setMode(value);
    if (!value) {
      if (lastPose) {
        arm.rotation.y = lastPose.yaw;
        shoulder.rotation.z = lastPose.q1 - Math.PI / 2;
        elbow.rotation.z = lastPose.q2; wrist.rotation.z = lastPose.wrist;
        elbow.position.y = lastPose.l1; wrist.position.y = lastPose.l2;
        upperLink.setLength(lastPose.l1); forearmLink.setLength(lastPose.l2);
        shoulderTransmission.update();
      }
      resetAim();
    }
    resize();
    if (value) modalRig.render();
  }

  function idleContact(time, offset) {
    const yaw = -0.13 * 0.28;
    const idle = solveRobotPose(
      0.64 + (reducedMotion ? 0 : Math.sin(time * 0.55) * 0.10),
      1.62 + (reducedMotion ? 0 : Math.sin(time * 0.72) * 0.075),
      { yaw, wristOffset: 0.10 + (reducedMotion ? 0 : Math.sin(time * 0.65) * 0.08) },
    );
    const phi = idle.heading;
    const x = idle.endX / Math.cos(yaw) + offset.x * Math.sin(phi) + offset.y * Math.cos(phi);
    const y = idle.endY - offset.x * Math.cos(phi) + offset.y * Math.sin(phi);
    return { point: new THREE.Vector3(x * Math.cos(yaw) + offset.z * Math.sin(yaw), y, -x * Math.sin(yaw) + offset.z * Math.cos(yaw)), phi };
  }

  function completeModalAim(input) {
    if (!modalRig.enabled) return false;
    fingers[0].rotation.z = -0.11; fingers[1].rotation.z = 0.11;
    internalClaw.update();
    const completed = modalRig.completeAim(input, measureContactOffset());
    modalRig.render();
    return completed;
  }

  function animate(now) {
    if (disposed) return;
    frameId = requestAnimationFrame(animate);
    const modalDt = Math.max(0, (now - last) / 1000);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const time = now / 1000;
    if (modalRig.enabled) {
      fingers[0].rotation.z = -0.11; fingers[1].rotation.z = 0.11;
      internalClaw.update();
      modalRig.update(document.visibilityState === 'hidden' ? 0 : modalDt, measureContactOffset());
      modalRig.render();
      return;
    }
    fingers[0].rotation.z = -0.11 + (hovered || reducedMotion ? 0 : Math.sin(time * 0.8) * 0.035);
    fingers[1].rotation.z = 0.11 - (hovered || reducedMotion ? 0 : Math.sin(time * 0.8) * 0.035);
    internalClaw.update();
    const offset = measureContactOffset();
    const idle = idleContact(time, offset);
    const goal = hovered && requestedContact ? requestedContact : idle.point;
    const goalRadius = Math.hypot(goal.x, goal.z);
    const goalAzimuth = Math.atan2(goal.z, goal.x);
    const goalPhi = hovered ? Math.atan2(goal.y - ARM.shoulderY, Math.sqrt(Math.max(0.00001, goalRadius ** 2 - offset.z ** 2))) : idle.phi;
    if (currentRadius === null) {
      currentRadius = goalRadius; currentAzimuth = goalAzimuth; currentHeight = goal.y; currentPhi = goalPhi;
    }
    const ease = 1 - Math.exp(-dt * (hovered ? 7.5 : 4.3));
    currentRadius += (goalRadius - currentRadius) * ease;
    currentAzimuth += Math.atan2(Math.sin(goalAzimuth - currentAzimuth), Math.cos(goalAzimuth - currentAzimuth)) * ease;
    currentHeight += (goal.y - currentHeight) * ease;
    currentPhi += Math.atan2(Math.sin(goalPhi - currentPhi), Math.cos(goalPhi - currentPhi)) * ease;
    currentContact.set(currentRadius * Math.cos(currentAzimuth), currentHeight, currentRadius * Math.sin(currentAzimuth));
    const oldYaw = driveYaw;
    driveYaw += (targetYaw - driveYaw) * (1 - Math.exp(-dt * 4.5));
    drive.rotation.y = driveYaw;
    wheels.forEach((wheel, i) => { wheel.rotation.x += (driveYaw - oldYaw) * (i < 2 ? 2.5 : -2.5); });

    const pose = solveRobotContact(currentContact, offset, currentPhi);
    lastPose = pose;
    arm.rotation.y = pose.yaw;
    shoulder.rotation.z = pose.q1 - Math.PI / 2;
    elbow.rotation.z = pose.q2;
    wrist.rotation.z = pose.wrist;
    elbow.position.y = pose.l1; wrist.position.y = pose.l2;
    upperLink.setLength(pose.l1); forearmLink.setLength(pose.l2);
    shoulderTransmission.update();
    materials.cyan.emissiveIntensity = active && !reducedMotion ? 1.4 + Math.sin(time * 1.7) * 0.18 : 1.2;
    renderer.render(scene, camera);
  }
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  resize();
  animate(performance.now());
  return {
    aimAt, resetAim, setActive, resize,
    setModalMode, aimAtModal: modalRig.aimAt, resetModalAim: modalRig.resetAim, completeModalAim,
    updateModalLayout: modalRig.updateLayout,
    getModalState: modalRig.getState,
    getSizeDiagnostics() {
      const projection = camera.projectionMatrix.elements;
      return { scale: arm.scale.toArray(), pixelProjection: { x: width * projection[0], y: height * projection[5] }, zoom: camera.zoom, width, height };
    },
    getDiagnostics() {
      scene.updateMatrixWorld(true);
      const world = contactAnchor.getWorldPosition(new THREE.Vector3());
      const projected = world.clone().project(camera);
      const pixel = { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
      const error = requestedScreen ? Math.hypot(pixel.x - requestedScreen.x * width, pixel.y - requestedScreen.y * height) : null;
      let minimumArmY = Infinity;
      const vertex = new THREE.Vector3();
      arm.traverse(object => {
        const positions = object.geometry?.attributes?.position;
        if (!positions) return;
        for (let i = 0; i < positions.count; i++) minimumArmY = Math.min(minimumArmY, vertex.fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).y);
      });
      const targetPixel = requestedScreen ? { x: requestedScreen.x * width, y: requestedScreen.y * height } : null;
      return { requestedScreen, targetPixel, contactWorld: world.toArray(), projectedContact: pixel, errorPixels: error, minimumArmY, pose: lastPose, drawing: technicalDrawing.stats, renderCalls: renderer.info.render.calls };
    },
    dispose() {
      disposed = true; cancelAnimationFrame(frameId); observer.disconnect();
      technicalDrawing.dispose(); mechanics.dispose(); mechanismMaterial.dispose();
      allGeometries.forEach(g => g.dispose()); allTextures.forEach(t => t.dispose());
      technicalDrawing.replacedMaterials.forEach(material => {
        if (!Object.values(materials).includes(material)) material.dispose();
      });
      shadowPlane.material.dispose();
      Object.values(materials).forEach(m => m.dispose());
      shadowPlane.geometry.dispose(); renderer.dispose();
    },
  };
}
