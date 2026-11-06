// Optional, self-contained ornament. Create after the drawing/modal rigs, call
// update from the scene's render hook, and dispose to remove every owned object.
// Removing that hook/import and this file leaves the robot's rig untouched.
import { createConstructionChassisGuard } from './construction-collision.js?v=1';

export const CONSTRUCTION_SIGN_ENABLED = true;

export function createConstructionSign({ THREE, scene, camera, attachment, chassis = null, reducedMotion = false }) {
  if (!CONSTRUCTION_SIGN_ENABLED) {
    return { update() {}, setVisible() {}, dispose() {}, getState: () => ({ enabled: false, visible: false, disposed: false, disabled: true, reveal: 0 }) };
  }
  const width = 1.12, height = .49, drop = .51;
  const maxAngle = .48, damping = 2.8, gravity = 9.81;
  // Hang the eyelet directly on the wrist bearing's front center. Keep its
  // clearance plane just ahead of the local wrist/forearm, without a standoff.
  const mountZ = .44, safeZ = .415;
  const softZone = .025, contactSlop = .0015, approachRate = 18;
  const floorY = -1.98, floorMargin = .020, groundTilt = .48;
  const chassisTilt = .85;
  const chassisGuard = chassis ? createConstructionChassisGuard({ THREE, chassis, width, height, drop }) : null;
  const collisionPoints = [];
  for (const x of [-width / 2 - .004, width / 2 + .004]) {
    for (const y of [-drop - height / 2 - .004, -drop + height / 2 + .004]) {
      for (const z of [-.018, .020]) collisionPoints.push([x, y, z, 0]);
    }
  }
  // A segment stays outside a half-space if both endpoints and its radius do.
  const wireHoleY = -drop + height / 2 - .031;
  for (const side of [-1, 1]) {
    collisionPoints.push([side * .014, -.018, .025, .006]);
    collisionPoints.push([side * .37, wireHoleY, .030, .006]);
  }
  const contact = { gap: 0, rollGradient: 0, pitchGradient: 0, kind: 'arm', armGap: 0, floorGap: 0, chassisGap: Infinity,
    chassisRollGradient: 0, chassisPitchGradient: 0, chassisRate: 0 };
  function clearanceAt(r, p, withGradient = true) {
    const sr = Math.sin(r), cr = Math.cos(r), sp = Math.sin(p), cp = Math.cos(p);
    let gap = Infinity, rollGradient = 0, pitchGradient = 0, kind = 'arm';
    let armGap = Infinity, floorGap = Infinity;
    for (const [x, y, z, radius] of collisionPoints) {
      const swungY = sr * x + cr * y;
      const distance = mountZ + sp * swungY + cp * z - radius - safeZ;
      armGap = Math.min(armGap, distance);
      if (distance < gap) {
        gap = distance; kind = 'arm';
        rollGradient = sp * (cr * x - sr * y);
        pitchGradient = cp * swungY - sp * z;
      }
      const groundDistance = (anchor.y - floorY - floorMargin) / scale + cp * swungY - sp * z - radius;
      floorGap = Math.min(floorGap, groundDistance);
      if (groundDistance < gap) {
        gap = groundDistance; kind = 'floor';
        rollGradient = cp * (cr * x - sr * y);
        pitchGradient = -sp * swungY - cp * z;
      }
    }
    contact.gap = gap; contact.rollGradient = rollGradient; contact.pitchGradient = pitchGradient;
    contact.kind = kind; contact.armGap = armGap; contact.floorGap = floorGap;
    if (chassisGuard) {
      const body = withGradient ? chassisGuard.clearanceAt(r, p) : { gap: chassisGuard.gapAt(r, p) };
      contact.chassisGap = body.gap;
      contact.chassisRollGradient = body.rollGradient || 0; contact.chassisPitchGradient = body.pitchGradient || 0;
      contact.chassisRate = withGradient && body.gap < .35 ? chassisGuard.gapRateAt?.(r, p, collisionDt) || 0 : 0;
      if (body.gap < contact.gap) {
        contact.gap = body.gap; contact.kind = 'chassis';
        contact.rollGradient = body.rollGradient || 0; contact.pitchGradient = body.pitchGradient || 0;
      }
    }
    return contact;
  }
  const geometries = new Set(), materials = new Set();
  const root = new THREE.Group();
  root.name = 'optional-construction-sign';
  const pendulum = new THREE.Group();
  root.add(pendulum);
  scene.add(root);

  const roundedRect = (shape, x, y, w, h, r) => {
    shape.moveTo(x + r, y); shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r); shape.quadraticCurveTo(x, y, x + r, y);
  };

  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 448;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath(); roundedRect(ctx, 5, 5, 1014, 438, 30);
  ctx.fillStyle = 'rgba(255, 212, 71, .74)'; ctx.fill();
  ctx.lineWidth = 11; ctx.strokeStyle = '#28303b'; ctx.stroke();
  ctx.save(); ctx.clip();
  // A translucent amber body with a broad, faint reflection reads as acrylic.
  const gloss = ctx.createLinearGradient(0, 0, 1024, 448);
  gloss.addColorStop(0, 'rgba(255, 255, 255, .20)');
  gloss.addColorStop(.32, 'rgba(255, 255, 255, .025)');
  gloss.addColorStop(.50, 'rgba(255, 255, 255, .10)');
  gloss.addColorStop(.66, 'rgba(255, 255, 255, 0)');
  gloss.addColorStop(1, 'rgba(255, 255, 255, .025)');
  ctx.fillStyle = gloss; ctx.fillRect(0, 0, 1024, 448);
  ctx.fillStyle = '#29313b';
  for (let x = -70; x < 1120; x += 92) {
    ctx.beginPath(); ctx.moveTo(x, 374); ctx.lineTo(x + 45, 374);
    ctx.lineTo(x + 1, 442); ctx.lineTo(x - 44, 442); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); roundedRect(ctx, 16, 16, 992, 416, 22);
  ctx.strokeStyle = 'rgba(255, 255, 255, .5)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = '#29313b'; ctx.lineWidth = 11; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(132, 103); ctx.lineTo(211, 249); ctx.lineTo(53, 249); ctx.closePath(); ctx.stroke();
  ctx.lineWidth = 13; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(132, 149); ctx.lineTo(132, 198); ctx.stroke();
  ctx.beginPath(); ctx.arc(132, 225, 7, 0, Math.PI * 2); ctx.fill();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#29313b';
  ctx.font = '700 110px Arial, sans-serif'; ctx.fillText('Under', 603, 146);
  ctx.font = '700 103px Arial, sans-serif'; ctx.fillText('Construction', 603, 244);
  ctx.strokeStyle = '#a97b20'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(32, 348); ctx.lineTo(992, 348); ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // The robot's existing depth surfaces occlude a sign on the far side.
  // Keep acrylic transparent without stamping over closer joints and links.
  function material(parameters) {
    const value = new THREE.MeshBasicMaterial({
      transparent: true, depthTest: true, depthWrite: false, toneMapped: false,
      side: THREE.DoubleSide, ...parameters,
    });
    value.userData.baseOpacity = value.opacity;
    materials.add(value); return value;
  }
  const edgeMaterial = material({ color: 0xd6b65a, opacity: .08 });
  const faceMaterial = material({ map: texture, alphaTest: .04 });
  const metalMaterial = material({ color: 0x697681 });
  const holeMaterial = material({ color: 0x373e42 });
  function mesh(geometry, surface, parent, x = 0, y = 0, z = 0, order = 61) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, surface);
    object.position.set(x, y, z); object.renderOrder = order;
    parent.add(object); return object;
  }

  const plateShape = new THREE.Shape();
  roundedRect(plateShape, -width / 2, -height / 2, width, height, .035);
  const plateGeometry = new THREE.ExtrudeGeometry(plateShape, {
    depth: .028, bevelEnabled: true, bevelThickness: .004, bevelSize: .004,
    bevelSegments: 1, curveSegments: 8, steps: 1,
  });
  plateGeometry.translate(0, 0, -.014);
  mesh(plateGeometry, edgeMaterial, pendulum, 0, -drop, 0, 60);
  mesh(new THREE.PlaneGeometry(width, height), faceMaterial, pendulum, 0, -drop, .020, 62);
  // Two steel suspension wires converge at the joint's eyelet. Their endpoints
  // rotate with the whole pendant, preserving a fixed length during the swing.
  const up = new THREE.Vector3(0, 1, 0);
  function wire(a, b) {
    const delta = new THREE.Vector3().subVectors(b, a);
    const object = mesh(new THREE.CylinderGeometry(.006, .006, delta.length(), 8), metalMaterial, pendulum,
      (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 64);
    object.quaternion.setFromUnitVectors(up, delta.normalize());
  }
  const holeX = .37, holeY = -drop + height / 2 - .031;
  for (const side of [-1, 1]) {
    wire(new THREE.Vector3(side * .014, -.018, .025), new THREE.Vector3(side * holeX, holeY, .03));
    mesh(new THREE.CircleGeometry(.016, 16), holeMaterial, pendulum, side * holeX, holeY, .025, 63);
    mesh(new THREE.TorusGeometry(.019, .004, 6, 20), metalMaterial, pendulum, side * holeX, holeY, .031, 65);
  }
  mesh(new THREE.TorusGeometry(.030, .007, 8, 24), metalMaterial, root, 0, 0, .024, 66);

  const anchor = new THREE.Vector3(), previousAnchor = new THREE.Vector3();
  const velocity = new THREE.Vector3(), measuredVelocity = new THREE.Vector3();
  const acceleration = new THREE.Vector3(), measuredAcceleration = new THREE.Vector3();
  const worldScale = new THREE.Vector3(), plateNormal = new THREE.Vector3();
  const plateWorld = new THREE.Vector3();
  const chassisFrame = { anchor, yaw: 0, scale: 1 };
  let roll = 0, pitch = 0, rollVelocity = 0, pitchVelocity = 0;
  let initialized = false, velocityReady = false, enabled = true, disposed = false;
  let previousScale = 1, scale = 1, yaw = 0, resets = 0, reveal = 1;
  let softContacts = 0, hardContacts = 0, infeasible = false, collisionDt = 0;

  function closingSpeed(boundary) {
    return boundary.rollGradient * rollVelocity + boundary.pitchGradient * pitchVelocity
      + (boundary.kind === 'floor' ? velocity.y / scale : boundary.kind === 'chassis' ? boundary.chassisRate : 0);
  }
  function removeClosingVelocity(boundary, allowedClosing = 0) {
    const jr = boundary.rollGradient, jp = boundary.pitchGradient, norm = jr * jr + jp * jp;
    const closing = closingSpeed(boundary);
    if (closing < allowedClosing && norm > 1e-8) {
      const correction = (allowedClosing - closing) / norm;
      rollVelocity += correction * jr; pitchVelocity += correction * jp;
    }
  }
  function projectSafePose(previousRoll = roll, previousPitch = pitch) {
    const initial = clearanceAt(roll, pitch, false);
    if (initial.gap >= contactSlop) { infeasible = false; return; }
    const positiveLimit = initial.floorGap < softZone * 2 || pitch > .24 ? groundTilt : .24;
    // The wrist may descend between frames, making even the old pose unsafe.
    // Continue on the nearest existing tilt branch, including a positive tilt
    // when the lower edge meets the floor. Never lift or translate the plate.
    if (clearanceAt(previousRoll, previousPitch, false).gap < contactSlop) {
      // A moved chassis can invalidate the old reference too. A small bounded
      // angular search selects the nearest pose satisfying all three guards.
      let best = null, bestDistance = Infinity;
      let localRoll = roll, localPitch = pitch;
      for (let iteration = 0; iteration < 20; iteration++) {
        const sample = clearanceAt(localRoll, localPitch);
        if (sample.gap >= contactSlop) {
          best = [localRoll, localPitch]; bestDistance = (localRoll - roll) ** 2 + (localPitch - pitch) ** 2; break;
        }
        const jr = sample.rollGradient, jp = sample.pitchGradient, norm = jr * jr + jp * jp;
        if (norm < 1e-10) break;
        const multiplier = Math.min((contactSlop + .0005 - sample.gap) / norm, .08 / Math.sqrt(norm));
        const nextRoll = THREE.MathUtils.clamp(localRoll + jr * multiplier, -maxAngle, maxAngle);
        const nextPitch = THREE.MathUtils.clamp(localPitch + jp * multiplier, -chassisTilt, positiveLimit);
        if (Math.hypot(nextRoll - localRoll, nextPitch - localPitch) < 1e-8) break;
        localRoll = nextRoll; localPitch = nextPitch;
      }
      for (let ri = 0; ri <= 8; ri++) {
        for (let pi = 0; pi <= 12; pi++) {
          const r = -maxAngle + ri * maxAngle / 4, p = -chassisTilt + pi * (chassisTilt + positiveLimit) / 12;
          const distance = (r - roll) ** 2 + (p - pitch) ** 2;
          if (distance < bestDistance && clearanceAt(r, p, false).gap >= contactSlop) {
            bestDistance = distance; best = [r, p];
          }
        }
      }
      if (best) [previousRoll, previousPitch] = best;
    }
    infeasible = clearanceAt(previousRoll, previousPitch, false).gap < contactSlop;
    if (infeasible) { roll = previousRoll; pitch = previousPitch; return; }
    const proposedRoll = roll, proposedPitch = pitch;
    let low = 0, high = 1;
    for (let iteration = 0; iteration < 18; iteration++) {
      const amount = (low + high) / 2;
      if (clearanceAt(previousRoll + (proposedRoll - previousRoll) * amount,
        previousPitch + (proposedPitch - previousPitch) * amount, false).gap >= contactSlop) low = amount;
      else high = amount;
    }
    roll = previousRoll + (proposedRoll - previousRoll) * low;
    pitch = previousPitch + (proposedPitch - previousPitch) * low;
    removeClosingVelocity(clearanceAt(roll, pitch)); hardContacts++;
  }

  function resetHistory() {
    previousAnchor.copy(anchor); velocity.set(0, 0, 0); acceleration.set(0, 0, 0);
    velocityReady = false; initialized = true; previousScale = scale;
  }
  function setVisible(value) {
    const next = Boolean(value);
    if (next !== enabled) {
      enabled = next; initialized = false; roll = pitch = rollVelocity = pitchVelocity = 0;
      collisionDt = 0; chassisGuard?.resetHistory?.();
    }
    root.visible = enabled && reveal > 0 && !disposed;
  }
  function update(deltaSeconds = 0, visible = enabled, amount = 1) {
    if (disposed) return;
    if (visible !== enabled) setVisible(visible);
    reveal = THREE.MathUtils.clamp(Number.isFinite(amount) ? amount : 1, 0, 1);
    materials.forEach(value => { value.opacity = value.userData.baseOpacity * reveal; });
    if (!enabled) return;
    // The opening deliberately freezes scene matrices. Update only the anchor's
    // ancestor chain and our own subtree, never the complete robot or its pose.
    attachment.updateWorldMatrix(true, false);
    anchor.set(0, 0, mountZ).applyMatrix4(attachment.matrixWorld);
    attachment.getWorldScale(worldScale);
    scale = Math.max(.0001, Math.abs(worldScale.x));
    // Keep the acrylic face fixed to the joint's physical front/back direction.
    // DoubleSide reveals the same artwork mirrored when viewed from behind.
    plateNormal.set(0, 0, 1).transformDirection(attachment.matrixWorld);
    if (Math.hypot(plateNormal.x, plateNormal.z) > 0.0001) yaw = Math.atan2(plateNormal.x, plateNormal.z);
    root.position.copy(anchor); root.rotation.set(0, yaw, 0); root.scale.setScalar(scale);
    const elapsed = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    collisionDt = initialized && elapsed > .001 && elapsed <= .16 ? elapsed : 0;
    chassisFrame.yaw = yaw; chassisFrame.scale = scale; chassisGuard?.update(chassisFrame);
    let parentVisible = true;
    for (let node = attachment; node && node !== scene; node = node.parent) parentVisible &&= node.visible;
    root.visible = enabled && parentVisible && reveal > 0;

    const jump = initialized && (anchor.distanceTo(previousAnchor) / scale > .8 || Math.abs(scale / previousScale - 1) > .08);
    if (!initialized || jump || elapsed > .16 || reducedMotion) {
      if (jump || elapsed > .16) { rollVelocity = pitchVelocity = 0; collisionDt = 0; resets++; }
      if (reducedMotion) roll = pitch = rollVelocity = pitchVelocity = 0;
      resetHistory();
    } else if (elapsed > .001) {
      const dt = Math.min(elapsed, .05);
      measuredVelocity.subVectors(anchor, previousAnchor).multiplyScalar(1 / elapsed);
      if (!velocityReady) { velocity.copy(measuredVelocity); velocityReady = true; }
      // Differentiate successive raw velocity samples, then filter acceleration.
      // Differentiating against a lagging filtered velocity amplifies high FPS.
      measuredAcceleration.subVectors(measuredVelocity, velocity).multiplyScalar(1 / elapsed);
      acceleration.lerp(measuredAcceleration, 1 - Math.exp(-dt * 18));
      velocity.copy(measuredVelocity);
      previousAnchor.copy(anchor); previousScale = scale;
      projectSafePose();
      const cosine = Math.cos(yaw), sine = Math.sin(yaw);
      const ax = THREE.MathUtils.clamp((acceleration.x * cosine - acceleration.z * sine) / scale, -16, 16);
      const az = THREE.MathUtils.clamp((acceleration.x * sine + acceleration.z * cosine) / scale, -10, 10);
      const effectiveGravity = THREE.MathUtils.clamp(gravity + acceleration.y / scale, 6, 14);
      const steps = Math.max(1, Math.ceil(dt / .008)), step = dt / steps;
      for (let i = 0; i < steps; i++) {
        const previousRoll = roll, previousPitch = pitch;
        let rollAcceleration = -effectiveGravity / drop * Math.sin(roll) - damping * rollVelocity - ax / drop * Math.cos(roll);
        let pitchAcceleration = -effectiveGravity / drop * Math.sin(pitch) - damping * pitchVelocity + az / drop * Math.cos(pitch);
        const boundary = clearanceAt(roll, pitch);
        const jr = boundary.rollGradient, jp = boundary.pitchGradient, norm = jr * jr + jp * jp;
        if (boundary.kind !== 'chassis' && boundary.gap < softZone && norm > 1e-8) {
          const closing = closingSpeed(boundary);
          const pressure = (softZone - boundary.gap) * 240 - Math.min(0, closing) * 18;
          rollAcceleration += pressure * jr / norm;
          pitchAcceleration += pressure * jp / norm;
          softContacts++;
        }
        const bodyJr = boundary.chassisRollGradient, bodyJp = boundary.chassisPitchGradient;
        const bodyNorm = bodyJr * bodyJr + bodyJp * bodyJp;
        const bodyZone = softZone;
        const bodyClosing = bodyJr * rollVelocity + bodyJp * pitchVelocity + boundary.chassisRate;
        if (boundary.chassisGap < bodyZone && bodyNorm > 1e-8) {
          const pressure = (bodyZone - boundary.chassisGap) * 120 - Math.min(0, bodyClosing) * 8;
          rollAcceleration += pressure * bodyJr / bodyNorm;
          pitchAcceleration += pressure * bodyJp / bodyNorm;
          softContacts++;
        }
        rollVelocity += rollAcceleration * step;
        pitchVelocity += pitchAcceleration * step;
        // Limit only velocity toward the shell, retaining motion tangent to it.
        // The exponentially reducing approach rate avoids a visible hard stop.
        const allowedClosing = -Math.max(0, boundary.gap - contactSlop) * approachRate;
        if (boundary.kind !== 'chassis' || boundary.gap < softZone) removeClosingVelocity(boundary, allowedClosing);
        if (boundary.chassisGap < bodyZone && bodyNorm > 1e-8) {
          const closing = bodyJr * rollVelocity + bodyJp * pitchVelocity + boundary.chassisRate;
          const allowed = -Math.max(0, boundary.chassisGap - contactSlop) / .10;
          if (closing < allowed) {
            const correction = (allowed - closing) / bodyNorm;
            rollVelocity += correction * bodyJr; pitchVelocity += correction * bodyJp;
          }
        }
        roll += rollVelocity * step; pitch += pitchVelocity * step;
        if (Math.abs(roll) > maxAngle) { roll = Math.sign(roll) * maxAngle; rollVelocity *= -.15; }
        const outwardLimit = boundary.chassisGap < softZone * 2 || previousPitch < -groundTilt ? chassisTilt
          : boundary.floorGap < softZone * 2 || previousPitch < -.24 ? groundTilt : .24;
        if (pitch < -outwardLimit) { pitch = -outwardLimit; pitchVelocity *= -.15; }
        const positiveLimit = boundary.floorGap < softZone * 2 || previousPitch > .24 ? groundTilt : .24;
        if (pitch > positiveLimit) { pitch = positiveLimit; pitchVelocity *= -.15; }
        // Numerical fallback along the actual proposed step, rather than an
        // arbitrary pitch clamp: roll also changes which corner is nearest.
        projectSafePose(previousRoll, previousPitch);
      }
    }
    projectSafePose();
    // Rotation about the fixed eyelet, rather than translating the plate, makes
    // it visibly hang while its front/back direction turns with the wrist.
    pendulum.rotation.set(pitch, 0, roll, 'XYZ');
    root.updateWorldMatrix(false, true);
  }
  function getState() {
    const viewport = camera.userData?.viewport;
    const point = anchor.clone().project(camera);
    plateWorld.set(0, -drop, 0).applyMatrix4(pendulum.matrixWorld);
    const plate = plateWorld.clone().project(camera);
    const boundary = clearanceAt(roll, pitch);
    return {
      enabled, visible: root.visible, disposed, reducedMotion, scale, resets, reveal, yaw,
      clearance: boundary.gap,
      collision: { safeZ, mountZ, softZone, contactSlop, points: collisionPoints.length, softContacts, hardContacts,
        floorY, floorMargin, groundTilt, chassisTilt, armClearance: boundary.armGap, floorClearance: boundary.floorGap * scale,
        floorMinimumY: floorY + floorMargin + boundary.floorGap * scale,
        chassisClearance: chassisGuard ? boundary.chassisGap * scale : null, infeasible },
      anchor: anchor.toArray(), plate: plateWorld.toArray(),
      roll, pitch, rollVelocity, pitchVelocity,
      anchorNDC: { x: point.x, y: point.y }, plateNDC: { x: plate.x, y: plate.y },
      ...(viewport ? { viewport } : {}),
    };
  }
  function dispose() {
    if (disposed) return;
    disposed = true; root.visible = false; root.removeFromParent();
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); texture.dispose();
    chassisGuard?.dispose?.();
    root.clear();
  }
  update(0);
  return { update, setVisible, getState, dispose };
}
