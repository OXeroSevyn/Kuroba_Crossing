import * as THREE from 'three';

export type VoxelBucket = 'matte' | 'metal' | 'emissive';

interface BoxEntry {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  color: number;
  bucket: VoxelBucket;
}

const _tmpColor = new THREE.Color();

// Six faces of a unit box with face-shading AO bias for crisp MagicaVoxel readability
const FACE_DEFS: Array<{
  normal: [number, number, number];
  verts: Array<[number, number, number]>;
  shade: number;
}> = [
  // +Y top (warm sunlit)
  {
    normal: [0, 1, 0],
    verts: [
      [-0.5, 0.5, 0.5],
      [0.5, 0.5, 0.5],
      [0.5, 0.5, -0.5],
      [-0.5, 0.5, -0.5],
    ],
    shade: 1.05,
  },
  // -Y bottom (grounded AO)
  {
    normal: [0, -1, 0],
    verts: [
      [-0.5, -0.5, -0.5],
      [0.5, -0.5, -0.5],
      [0.5, -0.5, 0.5],
      [-0.5, -0.5, 0.5],
    ],
    shade: 0.68,
  },
  // +X right
  {
    normal: [1, 0, 0],
    verts: [
      [0.5, -0.5, 0.5],
      [0.5, -0.5, -0.5],
      [0.5, 0.5, -0.5],
      [0.5, 0.5, 0.5],
    ],
    shade: 0.94,
  },
  // -X left
  {
    normal: [-1, 0, 0],
    verts: [
      [-0.5, -0.5, -0.5],
      [-0.5, -0.5, 0.5],
      [-0.5, 0.5, 0.5],
      [-0.5, 0.5, -0.5],
    ],
    shade: 0.85,
  },
  // +Z front
  {
    normal: [0, 0, 1],
    verts: [
      [-0.5, -0.5, 0.5],
      [0.5, -0.5, 0.5],
      [0.5, 0.5, 0.5],
      [-0.5, 0.5, 0.5],
    ],
    shade: 0.98,
  },
  // -Z back
  {
    normal: [0, 0, -1],
    verts: [
      [0.5, -0.5, -0.5],
      [-0.5, -0.5, -0.5],
      [-0.5, 0.5, -0.5],
      [0.5, 0.5, -0.5],
    ],
    shade: 0.82,
  },
];

/**
 * Shared material library with calibrated roughness/metalness contrast.
 */
export interface SharedVoxelMaterials {
  matte: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  emissive: THREE.MeshStandardMaterial;
  contactShadow: THREE.MeshBasicMaterial;
}

export function createSharedVoxelMaterials(maxAnisotropy: number): SharedVoxelMaterials {
  const bumpTex = createMicroVoxelBumpTexture(maxAnisotropy);
  const matte = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.86,
    metalness: 0.04,
    bumpMap: bumpTex,
    bumpScale: 0.012,
  });

  const metal = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.28,
    metalness: 0.62,
  });

  const emissive = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    emissive: 0xffffff,
    emissiveIntensity: 0.65,
    roughness: 0.25,
    metalness: 0.1,
  });

  // Patch emissive so vertex colors drive self-illumination cleanly
  emissive.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 totalEmissiveRadiance = emissive;',
      'vec3 totalEmissiveRadiance = emissive * vColor.rgb;',
    );
  };

  const shadowTex = createContactShadowTexture();
  const contactShadow = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
  });

  return { matte, metal, emissive, contactShadow };
}

/**
 * High-performance micro-voxel model builder that batches dozens/hundreds of voxel boxes
 * into 1-3 merged BufferGeometries (one per material bucket) with baked subtle face shading.
 */
export class VoxelAssembler {
  private entries: BoxEntry[] = [];

  public box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: number,
    bucket: VoxelBucket = 'matte',
  ): this {
    this.entries.push({ x, y, z, w, h, d, color, bucket });
    return this;
  }

  /**
   * Place a box specified by bottom-center anchor (x, bottomY, z).
   */
  public boxBottom(
    x: number,
    bottomY: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: number,
    bucket: VoxelBucket = 'matte',
  ): this {
    this.entries.push({ x, y: bottomY + h * 0.5, z, w, h, d, color, bucket });
    return this;
  }

  public build(
    materials: SharedVoxelMaterials,
    options?: {
      castShadow?: boolean;
      receiveShadow?: boolean;
      cloneMaterials?: boolean;
    },
  ): THREE.Group {
    const group = new THREE.Group();
    const buckets: Record<VoxelBucket, BoxEntry[]> = {
      matte: [],
      metal: [],
      emissive: [],
    };
    for (const e of this.entries) {
      buckets[e.bucket].push(e);
    }

    const castShadow = options?.castShadow ?? true;
    const receiveShadow = options?.receiveShadow ?? true;

    (['matte', 'metal', 'emissive'] as VoxelBucket[]).forEach((bucketKey) => {
      const list = buckets[bucketKey];
      if (list.length === 0) return;

      const geo = buildMergedBoxGeometry(list, bucketKey === 'emissive');
      const baseMat = materials[bucketKey];
      const mat = options?.cloneMaterials ? baseMat.clone() : baseMat;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = castShadow && bucketKey !== 'emissive';
      mesh.receiveShadow = receiveShadow;
      mesh.userData.voxelBucket = bucketKey;
      group.add(mesh);
    });

    return group;
  }
}

function buildMergedBoxGeometry(boxes: BoxEntry[], isEmissive: boolean): THREE.BufferGeometry {
  const faceCount = boxes.length * 6;
  const vertCount = faceCount * 4;
  const indexCount = faceCount * 6;

  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const indices = vertCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);

  let vOffset = 0;
  let iOffset = 0;

  for (let b = 0; b < boxes.length; b++) {
    const box = boxes[b];
    _tmpColor.setHex(box.color);

    for (let f = 0; f < 6; f++) {
      const def = FACE_DEFS[f];
      const shade = isEmissive ? 1.0 : def.shade;
      const r = Math.min(1, _tmpColor.r * shade);
      const g = Math.min(1, _tmpColor.g * shade);
      const bl = Math.min(1, _tmpColor.b * shade);

      const baseVert = vOffset;
      for (let v = 0; v < 4; v++) {
        const corner = def.verts[v];
        const pIdx = vOffset * 3;
        positions[pIdx] = box.x + corner[0] * box.w;
        positions[pIdx + 1] = box.y + corner[1] * box.h;
        positions[pIdx + 2] = box.z + corner[2] * box.d;

        normals[pIdx] = def.normal[0];
        normals[pIdx + 1] = def.normal[1];
        normals[pIdx + 2] = def.normal[2];

        colors[pIdx] = r;
        colors[pIdx + 1] = g;
        colors[pIdx + 2] = bl;

        const uIdx = vOffset * 2;
        uvs[uIdx] = v === 1 || v === 2 ? 1 : 0;
        uvs[uIdx + 1] = v === 2 || v === 3 ? 1 : 0;

        vOffset++;
      }

      indices[iOffset++] = baseVert;
      indices[iOffset++] = baseVert + 1;
      indices[iOffset++] = baseVert + 2;
      indices[iOffset++] = baseVert;
      indices[iOffset++] = baseVert + 2;
      indices[iOffset++] = baseVert + 3;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Subtle procedural micro-voxel grain bump texture so matte voxel surfaces feel tactile.
 */
function createMicroVoxelBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 64, 64);

  // Subtle voxel bevel border + fine grain
  for (let y = 0; y < 64; y += 4) {
    for (let x = 0; x < 64; x += 4) {
      const n = 118 + Math.floor(Math.sin(x * 1.7 + y * 2.3) * 12);
      ctx.fillStyle = `rgb(${n},${n},${n})`;
      ctx.fillRect(x, y, 4, 4);
    }
  }
  ctx.strokeStyle = '#686868';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 62, 62);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = Math.min(4, maxAnisotropy);
  return tex;
}

/**
 * Aurora City style asphalt: flat slate-navy surface, faint grain, pale shoulders and a bright
 * yellow dashed centerline (matches the micro-voxel roads of the Aurora City diorama).
 */
export function createAsphaltRoadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#262b36';
  ctx.fillRect(0, 0, 256, 128);

  // Very faint pixel grain
  for (let y = 0; y < 128; y += 4) {
    for (let x = 0; x < 256; x += 4) {
      const v = (x * 7 + y * 13) % 6;
      ctx.fillStyle = `rgb(${36 + v},${41 + v},${52 + v})`;
      ctx.fillRect(x, y, 4, 4);
    }
  }

  // Pale shoulder lines
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(0, 8, 256, 3);
  ctx.fillRect(0, 117, 256, 3);

  // Bright yellow dashed centerline
  ctx.fillStyle = '#facc15';
  for (let x = 16; x < 256; x += 64) {
    ctx.fillRect(x, 60, 34, 8);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(10, 1);
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Glowing Japanese voxel signboard texture inspired directly by the reference shop facade.
 */
export function createShopSignTexture(
  text: string,
  bgHex: string,
  fgHex: string,
  borderDots: boolean,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 256, 64);

  ctx.strokeStyle = '#ffcf70';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, 248, 56);

  if (borderDots) {
    const dotColors = ['#ff7eb6', '#ffe066', '#56f0ff', '#ff9d5c'];
    for (let i = 0; i < 16; i++) {
      ctx.fillStyle = dotColors[i % dotColors.length];
      ctx.fillRect(10 + i * 15, 6, 5, 5);
      ctx.fillRect(10 + i * 15, 53, 5, 5);
    }
  }

  ctx.fillStyle = fgHex;
  ctx.font = 'bold 30px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Soft radial contact shadow disc texture.
 */
function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(12, 16, 10, 0.85)');
  grad.addColorStop(0.55, 'rgba(12, 16, 10, 0.42)');
  grad.addColorStop(1, 'rgba(12, 16, 10, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createContactShadowMesh(
  radius: number,
  material: THREE.MeshBasicMaterial,
): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 20);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = 0.025;
  mesh.renderOrder = 2;
  return mesh;
}
