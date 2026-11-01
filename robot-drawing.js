// Camera-facing contours and mechanical creases, without triangulation lines.
// Protective shells use blue ink; functional internals use orange ink.
// Batches stay under the nearest articulated drawing root so the existing
// joints, wheels and telescoping parts continue to own every transform.
export function createTechnicalDrawing(THREE, surfaces, options = {}) {
  const sourceMeshes = [...new Set(surfaces)].filter(object => object?.isMesh && object.geometry?.attributes?.position);
  const adjacencyCache = new WeakMap();
  const batches = new Map();
  const ownedGeometries = new Set();
  const lineObjects = [];
  const replacedMaterials = new Set();
  const tolerance = options.weldTolerance ?? 1e-5;
  const defaultAngle = options.thresholdAngle ?? 22;
  const torusAngle = options.torusThresholdAngle ?? 45;
  const stats = {
    surfaces: sourceMeshes.length, roots: 0, edgeCount: 0,
    boundaryEdges: 0, sharpEdges: 0, silhouetteEdges: 0,
    cachedGeometries: 0, sourceTriangles: 0,
    lineDrawCalls: 0, depthDrawCalls: sourceMeshes.length, drawCalls: 0,
    shellSurfaces: 0, internalSurfaces: 0, shellLineDrawCalls: 0, internalLineDrawCalls: 0,
    internalParts: {},
  };

  function drawingOwner(object) {
    let ancestor = object, fallback = object;
    while (ancestor) {
      if (ancestor.userData.drawingRoot) return ancestor;
      fallback = ancestor;
      ancestor = ancestor.parent;
    }
    return fallback;
  }

  function geometryEdges(geometry) {
    if (adjacencyCache.has(geometry)) return adjacencyCache.get(geometry);
    const positions = geometry.attributes.position;
    const index = geometry.index;
    const count = index ? index.count : positions.count;
    const vertexIds = new Int32Array(positions.count);
    const vertices = [], welded = new Map(), edges = new Map();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ab = new THREE.Vector3(), cb = new THREE.Vector3();
    const threshold = Math.cos(THREE.MathUtils.degToRad(geometry.type === 'TorusGeometry' ? torusAngle : defaultAngle));
    for (let i = 0; i < positions.count; i++) {
      a.fromBufferAttribute(positions, i);
      const key = `${Math.round(a.x / tolerance)},${Math.round(a.y / tolerance)},${Math.round(a.z / tolerance)}`;
      let id = welded.get(key);
      if (id === undefined) { id = vertices.length; welded.set(key, id); vertices.push([a.x, a.y, a.z]); }
      vertexIds[i] = id;
    }
    function addEdge(ia, ib, normal) {
      if (ia === ib) return;
      const low = Math.min(ia, ib), high = Math.max(ia, ib), key = `${low},${high}`;
      let edge = edges.get(key);
      if (!edge) { edge = { a: low, b: high, normals: [] }; edges.set(key, edge); }
      edge.normals.push(normal.x, normal.y, normal.z);
    }
    let triangleCount = 0;
    for (let i = 0; i + 2 < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      a.fromBufferAttribute(positions, ia); b.fromBufferAttribute(positions, ib); c.fromBufferAttribute(positions, ic);
      cb.subVectors(c, b); ab.subVectors(a, b); cb.cross(ab);
      if (cb.lengthSq() < 1e-20) continue;
      cb.normalize(); triangleCount++;
      addEdge(vertexIds[ia], vertexIds[ib], cb);
      addEdge(vertexIds[ib], vertexIds[ic], cb);
      addEdge(vertexIds[ic], vertexIds[ia], cb);
    }
    const edgePositions = [], normalPairs = [], forced = [];
    let boundary = 0, sharp = 0, silhouette = 0;
    for (const edge of edges.values()) {
      const normals = edge.normals;
      let bestA = 0, bestB = 0, minimumDot = 1;
      for (let i = 0; i < normals.length; i += 3) for (let j = i + 3; j < normals.length; j += 3) {
        const dot = normals[i] * normals[j] + normals[i + 1] * normals[j + 1] + normals[i + 2] * normals[j + 2];
        if (dot < minimumDot) { minimumDot = dot; bestA = i; bestB = j; }
      }
      const isBoundary = normals.length === 3;
      // A welded coplanar pair is a tessellation diagonal, never a contour.
      if (!isBoundary && minimumDot > 1 - 1e-5) continue;
      const isSharp = !isBoundary && minimumDot < threshold;
      edgePositions.push(...vertices[edge.a], ...vertices[edge.b]);
      normalPairs.push(...normals.slice(bestA, bestA + 3), ...normals.slice(bestB, bestB + 3));
      forced.push(isBoundary || isSharp ? 1 : 0);
      if (isBoundary) boundary++; else if (isSharp) sharp++; else silhouette++;
    }
    const result = {
      positions: new Float32Array(edgePositions), normals: new Float32Array(normalPairs),
      forced: new Float32Array(forced), boundary, sharp, silhouette, triangleCount,
    };
    adjacencyCache.set(geometry, result); stats.cachedGeometries++;
    return result;
  }

  const depthMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: true, depthTest: true, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const vertexShader = `
    attribute vec3 adjacentNormalA;
    attribute vec3 adjacentNormalB;
    attribute vec3 edgeMidpoint;
    attribute float forceVisible;
    varying float vVisible;
    void main() {
      vec3 midpointView = (modelViewMatrix * vec4(edgeMidpoint, 1.0)).xyz;
      vec3 viewDirection = normalize(-midpointView);
      vec3 normalA = normalize(normalMatrix * adjacentNormalA);
      vec3 normalB = normalize(normalMatrix * adjacentNormalB);
      float facingA = dot(normalA, viewDirection);
      float facingB = dot(normalB, viewDirection);
      float contour = facingA * facingB <= 0.0 ? 1.0 : 0.0;
      vVisible = max(forceVisible, contour);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const fragmentShader = `
    uniform vec3 inkColor;
    uniform float inkOpacity;
    varying float vVisible;
    void main() {
      if (vVisible < 0.5) discard;
      gl_FragColor = vec4(inkColor, inkOpacity);
      #include <colorspace_fragment>
    }
  `;
  function inkMaterial(opacity, depthTest, color = options.color ?? 0x165fc9) {
    return new THREE.ShaderMaterial({
      uniforms: { inkColor: { value: new THREE.Color(color) }, inkOpacity: { value: opacity } },
      vertexShader, fragmentShader, transparent: true, depthTest, depthWrite: false, toneMapped: false,
    });
  }
  const ghostMaterial = inkMaterial(options.ghostOpacity ?? 0.10, false);
  const primaryMaterial = inkMaterial(options.opacity ?? 0.95, true);
  const internalMaterial = inkMaterial(options.internalOpacity ?? 0.88, false, options.internalColor ?? 0xf27620);
  const inverseOwner = new THREE.Matrix4(), relativeMatrix = new THREE.Matrix4(), normalsMatrix = new THREE.Matrix3();
  const pointA = new THREE.Vector3(), pointB = new THREE.Vector3(), normalA = new THREE.Vector3(), normalB = new THREE.Vector3(), midpoint = new THREE.Vector3();

  for (const object of sourceMeshes) {
    object.updateWorldMatrix(true, false);
    const owner = drawingOwner(object);
    owner.updateWorldMatrix(true, false);
    inverseOwner.copy(owner.matrixWorld).invert(); relativeMatrix.multiplyMatrices(inverseOwner, object.matrixWorld);
    normalsMatrix.getNormalMatrix(relativeMatrix);
    const edges = geometryEdges(object.geometry);
    // Classify by function, never by the original filled material color.
    const role = object.userData.drawingRole === 'internal' ? 'internal' : 'shell';
    if (role === 'internal') {
      stats.internalSurfaces++;
      const part = object.userData.internalPart || 'internal-mechanism';
      stats.internalParts[part] = (stats.internalParts[part] || 0) + 1;
    } else stats.shellSurfaces++;
    let ownerBatches = batches.get(owner);
    if (!ownerBatches) { ownerBatches = new Map(); batches.set(owner, ownerBatches); }
    let batch = ownerBatches.get(role);
    if (!batch) {
      batch = { positions: [], normalA: [], normalB: [], midpoints: [], forced: [] };
      ownerBatches.set(role, batch);
    }
    for (let i = 0; i < edges.forced.length; i++) {
      pointA.fromArray(edges.positions, i * 6).applyMatrix4(relativeMatrix);
      pointB.fromArray(edges.positions, i * 6 + 3).applyMatrix4(relativeMatrix);
      normalA.fromArray(edges.normals, i * 6).applyMatrix3(normalsMatrix).normalize();
      normalB.fromArray(edges.normals, i * 6 + 3).applyMatrix3(normalsMatrix).normalize();
      midpoint.addVectors(pointA, pointB).multiplyScalar(0.5);
      batch.positions.push(pointA.x, pointA.y, pointA.z, pointB.x, pointB.y, pointB.z);
      for (let endpoint = 0; endpoint < 2; endpoint++) {
        batch.normalA.push(normalA.x, normalA.y, normalA.z); batch.normalB.push(normalB.x, normalB.y, normalB.z);
        batch.midpoints.push(midpoint.x, midpoint.y, midpoint.z); batch.forced.push(edges.forced[i]);
      }
    }
    stats.edgeCount += edges.forced.length; stats.boundaryEdges += edges.boundary;
    stats.sharpEdges += edges.sharp; stats.silhouetteEdges += edges.silhouette; stats.sourceTriangles += edges.triangleCount;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) replacedMaterials.add(material);
    object.material = depthMaterial; object.castShadow = false;
  }

  for (const [owner, ownerBatches] of batches) for (const [role, batch] of ownerBatches) {
    if (!batch.forced.length) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(batch.positions, 3));
    geometry.setAttribute('adjacentNormalA', new THREE.Float32BufferAttribute(batch.normalA, 3));
    geometry.setAttribute('adjacentNormalB', new THREE.Float32BufferAttribute(batch.normalB, 3));
    geometry.setAttribute('edgeMidpoint', new THREE.Float32BufferAttribute(batch.midpoints, 3));
    geometry.setAttribute('forceVisible', new THREE.Float32BufferAttribute(batch.forced, 1));
    geometry.computeBoundingSphere(); ownedGeometries.add(geometry);
    const passes = role === 'internal'
      ? [['internal', internalMaterial, 20]]
      : [['ghost', ghostMaterial, 10], ['primary', primaryMaterial, 30]];
    for (const [name, material, order] of passes) {
      const lines = new THREE.LineSegments(geometry, material);
      lines.name = `technical-drawing-${name}`; lines.renderOrder = order; lines.castShadow = false;
      lines.userData.technicalDrawing = true;
      lines.userData.drawingRole = role;
      owner.add(lines); lineObjects.push(lines);
      if (role === 'internal') stats.internalLineDrawCalls++; else stats.shellLineDrawCalls++;
    }
  }
  stats.roots = batches.size;
  stats.lineDrawCalls = lineObjects.length;
  stats.drawCalls = stats.depthDrawCalls + stats.lineDrawCalls;
  let disposed = false;
  return {
    stats, replacedMaterials,
    dispose() {
      if (disposed) return; disposed = true;
      for (const lines of lineObjects) lines.removeFromParent();
      ownedGeometries.forEach(geometry => geometry.dispose());
      depthMaterial.dispose(); ghostMaterial.dispose(); primaryMaterial.dispose(); internalMaterial.dispose();
    },
  };
}
