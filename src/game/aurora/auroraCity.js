// AUTO-PORTED from "aurora_city_micro_voxel_3d_world 3.html" (Aurora City micro-voxel diorama),
// then adapted for the game: no page UI/camera/renderer, rotated & scaled into the open world by
// worldBuilder.ts, with generated colliders and a game-driven update loop.
/* eslint-disable */
import * as THREE from 'three';

/**
 * Builds Aurora City in its own diorama-local coordinates (main island x -46..46, z -43.5..32.5,
 * harbor to the south / +z, outskirts east / +x). The caller positions `city.root`.
 */
export function createAuroraCity() {
  return auroraFactory('city');
}

/**
 * Aurora's micro-voxel building blocks (trees, sakura, lamps, flower beds, fences, sidewalks,
 * drifting petals) without the city itself, used to restyle other districts in the same look.
 */
export function createAuroraStyleKit() {
  return auroraFactory('kit');
}

function auroraFactory(mode) {
    const cityUniforms = {
      uCity: { value: new THREE.Matrix4() },
      uCityInv: { value: new THREE.Matrix4() },
    };
    const disposables = [];

    // =========================================================================
    // 1. DETERMINISTIC PRNG & SHARED SCENE STATE
    // =========================================================================
    let _seed = 133791;
    function rand() {
      _seed |= 0;
      _seed = (_seed + 0x6d2b79f5) | 0;
      let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    function jitterColor(hex, amount = 0.04) {
      const c = new THREE.Color(hex);
      const hsl = {};
      c.getHSL(hsl);
      hsl.l = THREE.MathUtils.clamp(hsl.l + (rand() - 0.5) * amount * 2, 0.04, 0.96);
      c.setHSL(hsl.h, hsl.s, hsl.l);
      return c.getHex();
    }

    const scene = new THREE.Group();
    scene.name = 'AuroraCity';
    let auroraGroup;
    let harborWaterMesh, pondWaterMesh, fountainWaterMesh, waterfallMesh, waterfallMistMat;
    let sakuraPetalsMat, spiralInstMesh, dropsInstMesh;
    let fountainLight, cityHallLight;
    const windUniforms = { uTime: { value: 0 } };

    const animatedObjects = {
      auroraCurtains: [],
      spiralData: [],
      dropsData: [],
      tugboats: [],
      cars: [],
      train: null,
      blinkBeacons: [],
      crossingLights: []
    };

    // =========================================================================
    // 2. MULTI-SCALE MICRO-VOXEL BUILDER (GAME VERSION)
    //    Same API as the diorama, but emits spatially chunked InstancedMeshes so the
    //    city can be frustum-culled, and keeps the raw boxes for collider generation.
    // =========================================================================
    const CHUNK = 24;

    class VoxelBuilder {
      constructor() {
        this.matte = [];
        this.glow = [];
        this.foliage = [];
      }

      add(x, y, z, color, sx = 1, sy = 1, sz = 1, isGlow = false) {
        const entry = { x, y, z, color, sx, sy, sz };
        if (isGlow) this.glow.push(entry);
        else this.matte.push(entry);
      }

      addFoliage(x, y, z, color, sx = 1, sy = 1, sz = 1) {
        this.foliage.push({ x, y, z, color, sx, sy, sz });
      }

      addBox(x0, y0, z0, w, h, d, color, isGlow = false) {
        this.add(x0 + w * 0.5, y0 + h * 0.5, z0 + d * 0.5, color, w, h, d, isGlow);
      }

      build(target) {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const matteMat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.06 });

        // GPU wind-swaying foliage (trees & cherry blossoms)
        const foliageMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.04 });
        foliageMat.onBeforeCompile = (shader) => {
          shader.uniforms.uTime = windUniforms.uTime;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `#include <common>
            uniform float uTime;`
          );
          shader.vertexShader = shader.vertexShader.replace(
            '#include <project_vertex>',
            `vec4 mvPosition = vec4( transformed, 1.0 );
            #ifdef USE_INSTANCING
              mvPosition = instanceMatrix * mvPosition;
            #endif
            float windHeight = clamp((mvPosition.y - 0.9) * 0.32, 0.0, 1.0);
            float gust = sin(uTime * 1.75 + mvPosition.x * 0.14 + mvPosition.z * 0.11);
            float flutter = cos(uTime * 3.6 + mvPosition.x * 0.48 - mvPosition.z * 0.42) * 0.35;
            mvPosition.x += (gust + flutter) * 0.11 * windHeight;
            mvPosition.z += (cos(uTime * 1.45 + mvPosition.z * 0.15 - mvPosition.x * 0.09) + flutter * 0.6) * 0.085 * windHeight;
            mvPosition.y += sin(uTime * 2.8 + mvPosition.x * 0.35 + mvPosition.z * 0.35) * 0.025 * windHeight;
            mvPosition = modelViewMatrix * mvPosition;
            gl_Position = projectionMatrix * mvPosition;`
          );
        };
        foliageMat.customProgramCacheKey = () => 'aurora-wind-foliage';

        // Glowing emissive micro-voxels (windows, neon trims, lamps, banners)
        const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        disposables.push(geo, matteMat, foliageMat, glowMat);
        emitChunks(target, geo, matteMat, this.matte, true);
        emitChunks(target, geo, foliageMat, this.foliage, true);
        emitChunks(target, geo, glowMat, this.glow, false);
      }
    }

    function emitChunks(target, geo, mat, list, shadows) {
      if (list.length === 0) return;
      const buckets = new Map();
      for (const v of list) {
        // Ground slabs & long roads span many chunks: keep them together, never shadow-casting
        const big = v.sx > CHUNK || v.sz > CHUNK;
        const key = big ? 'big' : `${Math.floor(v.x / CHUNK)},${Math.floor(v.z / CHUNK)}`;
        let arr = buckets.get(key);
        if (!arr) {
          arr = [];
          buckets.set(key, arr);
        }
        arr.push(v);
      }
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      for (const [key, entries] of buckets) {
        const mesh = new THREE.InstancedMesh(geo, mat, entries.length);
        for (let i = 0; i < entries.length; i++) {
          const v = entries[i];
          dummy.position.set(v.x, v.y, v.z);
          dummy.scale.set(v.sx, v.sy, v.sz);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          col.setHex(v.color);
          mesh.setColorAt(i, col);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = shadows && key !== 'big';
        mesh.receiveShadow = shadows;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        target.add(mesh);
      }
    }


    // =========================================================================
    // 3. CUSTOM REALISTIC GLSL SHADERS (WATER, WATERFALL, FOUNTAIN, CLOUDS)
    // =========================================================================
    function createHarborWaterMaterial() {
      return new THREE.ShaderMaterial({
        uniforms: {
          uCity: cityUniforms.uCity,
          uCityInv: cityUniforms.uCityInv,
          uTime:          { value: 0 },
          uShallowColor:  { value: new THREE.Color(0x1da8b8) },
          uMidColor:      { value: new THREE.Color(0x0d5c78) },
          uDeepColor:     { value: new THREE.Color(0x062238) },
          uFoamColor:     { value: new THREE.Color(0xf0f9ff) },
          uSunDir:        { value: new THREE.Vector3(0.55, 0.32, -0.77).normalize() },
          uSunColor:      { value: new THREE.Color(0xffcf86) },
          uSkyColor:      { value: new THREE.Color(0x3a325c) },
          uHorizonColor:  { value: new THREE.Color(0xe6845e) },
          uLampColor:     { value: new THREE.Color(0xffb84d) },
          uLampIntensity: { value: 1.2 },
          uFogColor:      { value: new THREE.Color(0x2d2a4a) },
          uFogDensity:    { value: 0.0042 }
        },
        vertexShader: `
          uniform float uTime;
          uniform mat4 uCity;
          uniform mat4 uCityInv;
          varying vec3 vCityPos;
          varying vec3 vWorldPos;
          varying float vWaveH;

          float sdBoxV(vec2 p, vec2 b) {
            vec2 d = abs(p) - b;
            return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
          }

          void main() {
            vec4 wp = uCityInv * (modelMatrix * vec4(position, 1.0));
            float dIsland = sdBoxV(wp.xz - vec2(44.0, -5.5), vec2(90.0, 38.0));
            float dIsland2 = 1e4;
            float dPier = sdBoxV(wp.xz - vec2(0.0, 38.4), vec2(5.45, 6.25));
            float shoreCalm = smoothstep(0.0, 8.0, min(min(dIsland, dIsland2), dPier));

            float w1 = sin(wp.x * 0.22 + uTime * 1.45) * cos(wp.z * 0.18 + uTime * 1.1) * 0.14;
            float w2 = sin(wp.x * 0.55 - wp.z * 0.42 + uTime * 2.2) * 0.055;
            float w3 = cos(wp.x * 0.95 + wp.z * 0.85 - uTime * 2.8) * 0.025;
            float disp = (w1 + w2 + w3) * mix(0.32, 1.0, shoreCalm);

            wp.y += disp;
            vCityPos = wp.xyz;
            vWorldPos = (uCity * wp).xyz;
            vWaveH = disp;
            gl_Position = projectionMatrix * viewMatrix * (uCity * wp);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying vec3 vCityPos;
          uniform vec3 uShallowColor;
          uniform vec3 uMidColor;
          uniform vec3 uDeepColor;
          uniform vec3 uFoamColor;
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform vec3 uSkyColor;
          uniform vec3 uHorizonColor;
          uniform vec3 uLampColor;
          uniform float uLampIntensity;
          uniform vec3 uFogColor;
          uniform float uFogDensity;

          varying vec3 vWorldPos;
          varying float vWaveH;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }
          float fbm3(vec2 p) {
            float v = 0.5 * noise(p);
            p *= 2.04;
            v += 0.25 * noise(p);
            p *= 2.04;
            v += 0.125 * noise(p);
            return v;
          }
          float fbm2(vec2 p) {
            return 0.55 * noise(p) + 0.30 * noise(p * 2.07);
          }
          float sdBox(vec2 p, vec2 b) {
            vec2 d = abs(p) - b;
            return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
          }
          float smin(float a, float b, float k) {
            float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
            return mix(b, a, h) - k * h * (1.0 - h);
          }

          void main() {
            vec2 xz = vCityPos.xz;

            // Optimized multi-layered animated ripple normal (forward differences)
            vec2 uv1 = xz * 0.42 + vec2(uTime * 0.35, -uTime * 0.24);
            vec2 uv2 = xz * 0.88 + vec2(-uTime * 0.28, uTime * 0.38);
            float n1 = fbm3(uv1);
            float n2 = fbm2(uv2);
            float ripple = (n1 + n2) * 0.5;

            float eps = 0.24;
            float nx = (fbm2(uv1 + vec2(eps, 0.0)) - n1) * 1.65;
            float nz = (fbm2(uv1 + vec2(0.0, eps)) - n1) * 1.65;
            vec3 N = normalize(vec3(-nx * 1.45, 1.0, -nz * 1.45));
            vec3 V = normalize(cameraPosition - vWorldPos);

            // Full 360-degree distance field to both islands, central pier, northern mountains, and tugboats
            float dIsland = sdBox(xz - vec2(44.0, -5.5), vec2(90.2, 38.0));
            float dIsland2 = 1e4;
            float dPier = sdBox(xz - vec2(0.0, 38.4), vec2(5.45, 6.25));
            float dM1 = length(xz - vec2(-32.0, -56.0)) - 20.5;
            float dM2 = length(xz - vec2(-6.0, -64.0)) - 22.5;
            float dM3 = length(xz - vec2(24.0, -60.0)) - 24.5;
            float dM4 = length(xz - vec2(52.0, -54.0)) - 18.5;
            float dMountains = smin(smin(dM1, dM2, 8.0), smin(dM3, dM4, 8.0), 8.0);
            float dCoast = min(dIsland, dIsland2);
            float dShore = max(0.0, min(dCoast, dPier));

            float dBoatL = max(0.0, sdBox(xz - vec2(-25.0, 38.2), vec2(4.4, 1.85)));
            float dBoatR = max(0.0, sdBox(xz - vec2(26.0, 38.2), vec2(4.4, 1.85)));
            float dObject = min(dShore, min(dBoatL, dBoatR));

            // Realistic depth-based water shading all around the island & mountain coves
            float depthFactor = smoothstep(0.0, 15.0, dShore);
            float farDepth = smoothstep(12.0, 62.0, dShore);
            vec3 waterCol = mix(uShallowColor, uMidColor, depthFactor);
            waterCol = mix(waterCol, uDeepColor, farDepth);

            // Subtle subsurface wave-crest turquoise glow
            float crestGlow = smoothstep(0.04, 0.22, vWaveH + (ripple - 0.5) * 0.16);
            waterCol += uShallowColor * crestGlow * 0.22;

            // Fresnel reflection of sky & horizon
            float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.6);
            vec3 envRefl = mix(uSkyColor, uHorizonColor, smoothstep(0.15, 0.85, fresnel));
            waterCol = mix(waterCol, envRefl, clamp(fresnel * 0.62, 0.0, 0.68));

            // Crisp sun/moon specular sparkle on ripples
            vec3 H = normalize(uSunDir + V);
            float spec = pow(max(dot(N, H), 0.0), 96.0);
            waterCol += uSunColor * spec * 0.9;

            // Shimmering golden reflections from harbor quay lamps, tugboat cabins & coastal city lights
            float lampGlow = 0.0;
            if (xz.y > 32.2 && xz.y < 52.0 && abs(xz.x) < 44.0) {
              float distFromQuay = xz.y - 32.4;
              float rippleShift = (ripple - 0.5) * 2.2;
              float lampPeriod = mod(xz.x + 3.0 + rippleShift * 0.45, 6.0) - 3.0;
              float streak = exp(-lampPeriod * lampPeriod * 1.45) * exp(-distFromQuay * 0.19);
              float pierMask = smoothstep(4.6, 6.2, abs(xz.x));
              float shimmer = 0.55 + 0.45 * sin(xz.y * 2.6 - uTime * 3.8 + n2 * 6.0);
              lampGlow += streak * pierMask * shimmer * 0.85;
            }
            float sideDist = max(0.0, abs(xz.x) - 46.2);
            if (sideDist < 16.0 && xz.y > -34.0 && xz.y < 32.0) {
              float sideGlow = exp(-sideDist * 0.24) * (0.5 + 0.5 * sin(xz.y * 0.65 + uTime * 2.1 + n1 * 4.0));
              lampGlow += sideGlow * 0.28;
            }
            float boatReflL = exp(-pow((xz.x + 25.0 + (ripple - 0.5) * 1.4) * 0.36, 2.0)) * exp(-max(0.0, xz.y - 39.2) * 0.26) * step(38.0, xz.y);
            float boatReflR = exp(-pow((xz.x - 26.0 + (ripple - 0.5) * 1.4) * 0.36, 2.0)) * exp(-max(0.0, xz.y - 39.2) * 0.26) * step(38.0, xz.y);
            lampGlow += (boatReflL + boatReflR) * (0.6 + 0.4 * sin(xz.y * 3.2 - uTime * 4.2)) * 0.72;
            waterCol += uLampColor * lampGlow * uLampIntensity;

            // Animated shoreline, cove & pier lapping foam
            float foamNoise = fbm2(xz * 1.35 + vec2(uTime * 0.4, -uTime * 0.3));
            float shoreBand = 1.0 - smoothstep(0.0, 2.4, dShore);
            float shoreWave = sin(dShore * 4.0 - uTime * 2.7 + foamNoise * 3.2) * 0.5 + 0.5;
            float shoreFoam = smoothstep(0.42, 0.74, shoreBand * 0.9 + shoreWave * shoreBand * 0.55 + (foamNoise - 0.5) * 0.45);
            float contactFoam = 1.0 - smoothstep(0.0, 0.5, dShore + (foamNoise - 0.5) * 0.32);

            // Tugboat pulsing wake foam rings
            float dBoat = min(dBoatL, dBoatR);
            float boatRing = (1.0 - smoothstep(0.0, 2.4, dBoat)) * (0.5 + 0.5 * sin(dBoat * 4.8 - uTime * 3.2 + foamNoise * 2.5));
            float boatFoam = smoothstep(0.38, 0.72, boatRing + (1.0 - smoothstep(0.0, 0.55, dBoat)) * 0.75);

            // Subtle open-water whitecap foam on highest wave peaks
            float whitecap = smoothstep(0.68, 0.88, foamNoise * 0.75 + vWaveH * 2.2) * smoothstep(4.0, 18.0, dObject) * 0.42;

            float totalFoam = clamp(max(max(shoreFoam, contactFoam), boatFoam) + whitecap, 0.0, 1.0);
            waterCol = mix(waterCol, uFoamColor, totalFoam * 0.86);

            // Exponential squared scene fog + seamless distant horizon blend
            float camDist = length(cameraPosition - vWorldPos);
            float fogFactor = 1.0 - exp(-pow(camDist * uFogDensity, 2.0));
            waterCol = mix(waterCol, uFogColor, clamp(fogFactor, 0.0, 1.0));
            float radialFade = smoothstep(215.0, 305.0, length(xz - vec2(58.0, -5.5)));
            vec3 horizonBlend = mix(uFogColor, uHorizonColor, 0.52);
            waterCol = mix(waterCol, horizonBlend, radialFade);

            gl_FragColor = vec4(waterCol, 0.97);
          }
        `,
        transparent: true
      });
    }

    function createPondWaterMaterial() {
      return new THREE.ShaderMaterial({
        uniforms: {
          uCity: cityUniforms.uCity,
          uCityInv: cityUniforms.uCityInv,
          uTime:          { value: 0 },
          uShallowColor:  { value: new THREE.Color(0x22c8d8) },
          uDeepColor:     { value: new THREE.Color(0x083b5c) },
          uFoamColor:     { value: new THREE.Color(0xeefcff) },
          uLampColor:     { value: new THREE.Color(0xffb84d) },
          uLampIntensity: { value: 1.05 }
        },
        vertexShader: `
          uniform float uTime;
          uniform mat4 uCity;
          uniform mat4 uCityInv;
          varying vec3 vCityPos;
          varying vec3 vWorldPos;
          void main() {
            vec4 wp = uCityInv * (modelMatrix * vec4(position, 1.0));
            wp.y += sin(wp.x * 1.3 + uTime * 2.1) * cos(wp.z * 1.1 - uTime * 1.8) * 0.025;
            vCityPos = wp.xyz;
            vWorldPos = (uCity * wp).xyz;
            gl_Position = projectionMatrix * viewMatrix * (uCity * wp);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying vec3 vCityPos;
          uniform vec3 uShallowColor;
          uniform vec3 uDeepColor;
          uniform vec3 uFoamColor;
          uniform vec3 uLampColor;
          uniform float uLampIntensity;
          varying vec3 vWorldPos;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }
          float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
              v += a * noise(p);
              p *= 2.05;
              a *= 0.5;
            }
            return v;
          }
          float smin(float a, float b, float k) {
            float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
            return mix(b, a, h) - k * h * (1.0 - h);
          }

          void main() {
            vec2 xz = vCityPos.xz;
            // Two-lobed natural lagoon SDF matching the West Waterfall Park
            float dUpper = length((xz - vec2(-32.2, -13.0)) / vec2(6.6, 8.6)) - 1.0;
            float dLower = length((xz - vec2(-29.2, 4.4)) / vec2(9.2, 6.4)) - 1.0;
            float dNeck  = length((xz - vec2(-30.6, -3.2)) / vec2(5.2, 4.0)) - 1.0;
            float dPond  = smin(smin(dUpper, dLower, 0.35), dNeck, 0.3);
            if (dPond > 0.04) discard;

            float depth = clamp(-dPond * 2.2, 0.0, 1.0);
            vec2 flowUV = xz * 0.65 + vec2(0.0, -uTime * 0.55);
            float n1 = fbm(flowUV);
            float n2 = fbm(xz * 1.35 + vec2(uTime * 0.25, -uTime * 0.4));

            // Realistic turquoise-to-deep-lagoon shading + caustics
            vec3 col = mix(uShallowColor, uDeepColor, smoothstep(0.0, 0.85, depth));
            float caustics = smoothstep(0.45, 0.82, fbm(xz * 1.1 + vec2(uTime * 0.3, -uTime * 0.45)));
            col += uShallowColor * caustics * 0.26;

            // Waterfall splash plunge-pool concentric expanding foam rings
            float wfDist = length(xz - vec2(-35.4, -18.8));
            float wfPlunge = (1.0 - smoothstep(0.0, 4.8, wfDist)) * 0.95;
            float wfRings = (1.0 - smoothstep(1.2, 9.5, wfDist))
                          * smoothstep(0.45, 0.85, sin(wfDist * 2.6 - uTime * 4.4 + n1 * 2.5) * 0.5 + 0.5) * 0.65;

            // Shoreline foam hugging the stone bank
            float edgeFoam = (1.0 - smoothstep(0.0, 0.16, -dPond + (n2 - 0.5) * 0.08)) * 0.72;

            // Warm lantern & pagoda reflections on the pond ripples
            float gazeboRefl = exp(-length(xz - vec2(-22.8, -2.5)) * 0.32) * (0.6 + 0.4 * n2);
            float bridgeRefl = exp(-abs(xz.y + 2.8) * 0.45) * exp(-abs(xz.x + 30.2) * 0.2) * (0.5 + 0.5 * n1);
            col += uLampColor * (gazeboRefl * 0.55 + bridgeRefl * 0.38) * uLampIntensity;

            float foam = clamp(max(max(wfPlunge, wfRings), edgeFoam), 0.0, 1.0);
            col = mix(col, uFoamColor, foam * 0.88);

            float alpha = smoothstep(0.04, -0.05, dPond) * 0.94;
            gl_FragColor = vec4(col, alpha);
          }
        `,
        transparent: true
      });
    }

    function createFountainWaterMaterial() {
      return new THREE.ShaderMaterial({
        uniforms: {
          uCity: cityUniforms.uCity,
          uCityInv: cityUniforms.uCityInv,
          uTime:          { value: 0 },
          uShallowColor:  { value: new THREE.Color(0x22d3ee) },
          uMidColor:      { value: new THREE.Color(0x0284c7) },
          uDeepColor:     { value: new THREE.Color(0x082f49) },
          uFoamColor:     { value: new THREE.Color(0xf0fdff) },
          uSpiralColor:   { value: new THREE.Color(0xa855f7) },
          uSunDir:        { value: new THREE.Vector3(0.55, 0.32, -0.77).normalize() },
          uSunColor:      { value: new THREE.Color(0xffd7a1) },
          uGlowIntensity: { value: 1.0 }
        },
        vertexShader: `
          uniform float uTime;
          uniform mat4 uCity;
          uniform mat4 uCityInv;
          varying vec3 vCityPos;
          varying vec3 vWorldPos;
          varying vec2 vLocalPos;
          varying float vWave;
          void main() {
            vec4 wp = uCityInv * (modelMatrix * vec4(position, 1.0));
            float r = length(wp.xz);
            float radialRipple = sin(r * 5.2 - uTime * 4.6) * 0.032 * smoothstep(3.9, 1.1, r);
            float crossRipple = sin(wp.x * 2.4 + uTime * 2.6) * cos(wp.z * 2.4 - uTime * 2.2) * 0.014;
            float disp = radialRipple + crossRipple;
            wp.y += disp;
            vCityPos = wp.xyz;
            vWorldPos = (uCity * wp).xyz;
            vLocalPos = wp.xz;
            vWave = disp;
            gl_Position = projectionMatrix * viewMatrix * (uCity * wp);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          varying vec3 vCityPos;
          uniform vec3 uShallowColor;
          uniform vec3 uMidColor;
          uniform vec3 uDeepColor;
          uniform vec3 uFoamColor;
          uniform vec3 uSpiralColor;
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform float uGlowIntensity;

          varying vec3 vWorldPos;
          varying vec2 vLocalPos;
          varying float vWave;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }
          float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
              v += a * noise(p);
              p *= 2.08;
              a *= 0.5;
            }
            return v;
          }

          void main() {
            vec2 xz = vLocalPos;
            float r = length(xz);
            if (r > 3.92) discard;

            float angle = atan(xz.y, xz.x);
            vec2 uv1 = xz * 1.15 + vec2(uTime * 0.35, -uTime * 0.28);
            vec2 uv2 = xz * 2.15 + vec2(-uTime * 0.42, uTime * 0.32);
            float n1 = fbm(uv1);
            float n2 = fbm(uv2);

            float eps = 0.1;
            float nx = (fbm(uv1 + vec2(eps, 0.0)) - n1) * 1.7
                     + cos(r * 5.2 - uTime * 4.6) * (xz.x / max(r, 0.001)) * 0.42;
            float nz = (fbm(uv1 + vec2(0.0, eps)) - n1) * 1.7
                     + cos(r * 5.2 - uTime * 4.6) * (xz.y / max(r, 0.001)) * 0.42;
            vec3 N = normalize(vec3(-nx * 1.25, 1.0, -nz * 1.25));
            vec3 V = normalize(cameraPosition - vWorldPos);

            vec3 col = mix(uShallowColor, uMidColor, smoothstep(1.0, 2.55, r));
            col = mix(col, uDeepColor, smoothstep(2.4, 3.85, r));

            float caustics = smoothstep(0.42, 0.84, fbm(xz * 2.2 + vec2(uTime * 0.5, -uTime * 0.6)));
            col += uShallowColor * caustics * 0.34;

            float spiralSwirl = sin(angle * 2.0 - uTime * 1.45 + r * 1.9 + n1 * 2.4) * 0.5 + 0.5;
            float spiralBand = exp(-pow((r - 1.85) * 0.85, 2.0)) * spiralSwirl;
            col += mix(uShallowColor, uSpiralColor, 0.48) * spiralBand * 0.55 * uGlowIntensity;

            float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
            col = mix(col, mix(uShallowColor, uFoamColor, 0.4), clamp(fresnel * 0.42, 0.0, 0.48));
            vec3 H = normalize(uSunDir + V);
            float spec = pow(max(dot(N, H), 0.0), 80.0);
            col += uSunColor * spec * 0.85;

            float jetFoam = (1.0 - smoothstep(0.85, 1.72, r + (n2 - 0.5) * 0.45)) * 0.92;
            float ringWave = (1.0 - smoothstep(1.1, 3.3, r))
                           * smoothstep(0.55, 0.88, sin(r * 5.2 - uTime * 4.6 + n1 * 2.2) * 0.5 + 0.5) * 0.52;
            float rimFoam = smoothstep(3.48, 3.88, r + (n2 - 0.5) * 0.22) * 0.72;

            float totalFoam = clamp(max(max(jetFoam, ringWave), rimFoam), 0.0, 1.0);
            col = mix(col, uFoamColor, totalFoam * 0.9);

            float alpha = smoothstep(3.92, 3.78, r) * 0.95;
            gl_FragColor = vec4(col, alpha);
          }
        `,
        transparent: true
      });
    }

    function createWaterfallMaterial() {
      return new THREE.ShaderMaterial({
        uniforms: {
          uTime:      { value: 0 },
          uDeepCol:   { value: new THREE.Color(0x0369a1) },
          uMidCol:    { value: new THREE.Color(0x22d3ee) },
          uFoamCol:   { value: new THREE.Color(0xf0fdff) },
          uSunDir:    { value: new THREE.Vector3(0.55, 0.32, -0.77).normalize() },
          uSunColor:  { value: new THREE.Color(0xffd7a1) },
          uGlowBoost: { value: 0.35 }
        },
        vertexShader: `
          uniform float uTime;
          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying vec3 vNormalW;

          void main() {
            vUv = uv;
            vec3 pos = position;
            float flowMask = smoothstep(0.08, 0.24, uv.y) * smoothstep(1.0, 0.86, uv.y);
            float billow = sin(uv.y * 18.0 - uTime * 11.5 + uv.x * 7.0) * 0.14
                         + cos(uv.y * 30.0 - uTime * 16.0 - uv.x * 11.0) * 0.07;
            pos += normal * billow * flowMask;

            vec4 wp = modelMatrix * vec4(pos, 1.0);
            vWorldPos = wp.xyz;
            vNormalW = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uDeepCol;
          uniform vec3 uMidCol;
          uniform vec3 uFoamCol;
          uniform vec3 uSunDir;
          uniform vec3 uSunColor;
          uniform float uGlowBoost;

          varying vec2 vUv;
          varying vec3 vWorldPos;
          varying vec3 vNormalW;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }
          float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
              v += a * noise(p);
              p *= 2.08;
              a *= 0.5;
            }
            return v;
          }

          void main() {
            vec2 uv = vUv;
            float speed = mix(1.3, 2.5, smoothstep(0.12, 0.35, uv.y));
            float nMain = fbm(vec2(uv.x * 7.5, uv.y * 3.8 - uTime * speed));
            float nFine = fbm(vec2(uv.x * 16.0 + nMain * 0.65, uv.y * 7.2 - uTime * speed * 1.45));
            float streaks = smoothstep(0.42, 0.78, nFine * 0.65 + nMain * 0.45);

            // Frothy crest at lip (uv.y ~ 0.16) & intense plunge pool foam at base (uv.y ~ 0.92)
            float crestFoam = exp(-pow((uv.y - 0.17) * 14.0, 2.0)) * (0.72 + 0.35 * nFine);
            float baseFoam = smoothstep(0.76, 0.98, uv.y + (nMain - 0.5) * 0.14);
            float sideFoam = (1.0 - smoothstep(0.0, 0.14, uv.x)) + (1.0 - smoothstep(0.0, 0.14, 1.0 - uv.x));

            vec3 col = mix(uDeepCol, uMidCol, smoothstep(0.15, 0.85, nMain + 0.22));
            col += uMidCol * uGlowBoost * (0.4 + 0.6 * streaks);

            vec3 N = normalize(vNormalW + vec3((nFine - 0.5) * 0.45, 0.0, (nMain - 0.5) * 0.45));
            vec3 V = normalize(cameraPosition - vWorldPos);
            float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.8);
            vec3 H = normalize(uSunDir + V);
            float spec = pow(max(dot(N, H), 0.0), 48.0);
            col += uSunColor * spec * 0.75 + uFoamCol * fresnel * 0.28;

            float totalFoam = clamp(streaks * 0.68 + crestFoam * 0.92 + baseFoam * 0.95 + sideFoam * 0.35, 0.0, 1.0);
            col = mix(col, uFoamCol, totalFoam);

            float edgeAlpha = smoothstep(0.0, 0.07, uv.x) * smoothstep(0.0, 0.07, 1.0 - uv.x);
            float topAlpha = smoothstep(0.0, 0.06, uv.y);
            float alpha = edgeAlpha * topAlpha * mix(0.84, 0.98, totalFoam);
            gl_FragColor = vec4(col, alpha);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
      });
    }

    function createWaterfallMistMaterial() {
      return new THREE.ShaderMaterial({
        uniforms: {
          uTime:      { value: 0 },
          uMistColor: { value: new THREE.Color(0xdcfaff) },
          uOpacity:   { value: 0.48 }
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uMistColor;
          uniform float uOpacity;
          varying vec2 vUv;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
          }
          float fbm(vec2 p) {
            float v = 0.0; float a = 0.5;
            for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.05; a *= 0.5; }
            return v;
          }

          void main() {
            vec2 p = vUv * 2.0 - 1.0;
            float r = length(p);
            if (r > 1.0) discard;
            float swirl = fbm(vUv * 3.8 + vec2(uTime * 0.25, -uTime * 0.65));
            float mask = smoothstep(1.0, 0.18, r) * smoothstep(0.25, 0.8, swirl);
            gl_FragColor = vec4(uMistColor, mask * uOpacity);
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide
      });
    }

    function createCloudDomeMaterial() {
      return new THREE.ShaderMaterial({
        uniforms: {
          uTime:        { value: 0 },
          uSunDir:      { value: new THREE.Vector3(0.55, 0.32, -0.77).normalize() },
          uCloudBright: { value: new THREE.Color(0xffe1c6) },
          uCloudShadow: { value: new THREE.Color(0x523b68) },
          uRimColor:    { value: new THREE.Color(0xff9e66) },
          uAuroraTint:  { value: new THREE.Color(0x38bdf8) },
          uAuroraMix:   { value: 0.14 },
          uCoverage:    { value: 0.46 }
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vDir = normalize(wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uSunDir;
          uniform vec3 uCloudBright;
          uniform vec3 uCloudShadow;
          uniform vec3 uRimColor;
          uniform vec3 uAuroraTint;
          uniform float uAuroraMix;
          uniform float uCoverage;

          varying vec3 vDir;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
          float noise(vec2 p) {
            vec2 i = floor(p); vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
          }
          float fbm3(vec2 p) {
            float v = 0.0; float a = 0.5;
            mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
            for (int i = 0; i < 3; i++) {
              v += a * noise(p);
              p = rot * p * 2.05;
              a *= 0.5;
            }
            return v;
          }
          float fbm4(vec2 p) {
            float v = 0.0; float a = 0.5;
            mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
            for (int i = 0; i < 4; i++) {
              v += a * noise(p);
              p = rot * p * 2.05;
              a *= 0.5;
            }
            return v;
          }

          void main() {
            if (vDir.y < 0.04) discard;
            // Curved atmospheric ceiling projection
            vec2 uv = vDir.xz / (vDir.y + 0.24) * 1.45;
            vec2 wind = vec2(uTime * 0.018, uTime * 0.008);
            vec2 warp = vec2(fbm3(uv * 0.9 + wind), fbm3(uv * 0.9 - wind + 4.3));
            float base = fbm4(uv * 1.15 + warp * 0.42 + wind);

            float density = smoothstep(1.0 - uCoverage, 1.0 - uCoverage + 0.34, base);
            if (density < 0.01) discard;

            // Directional light-marching self-shadow sample
            vec2 sunStep = normalize(uSunDir.xz + vec2(0.0001)) * 0.18;
            float shadowSample = fbm3((uv + sunStep) * 1.15 + warp * 0.42 + wind);
            float lit = clamp(1.0 - (shadowSample - base) * 2.8, 0.0, 1.0);

            // Henyey-Greenstein forward scattering silver lining near sun
            float sunDot = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
            float silverLining = pow(sunDot, 7.0) * (1.0 - density * 0.45);

            vec3 col = mix(uCloudShadow, uCloudBright, smoothstep(0.15, 0.92, lit));
            col += uRimColor * silverLining * 0.85;
            col += uAuroraTint * uAuroraMix * smoothstep(0.2, 0.8, 1.0 - lit) * 0.55;

            float horizonFade = smoothstep(0.05, 0.26, vDir.y);
            gl_FragColor = vec4(col, density * horizonFade * 0.82);
          }
        `,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false
      });
    }

    function createCloudPuffMaterial() {
      return new THREE.ShaderMaterial({
        uniforms: {
          uTime:        { value: 0 },
          uSunDir:      { value: new THREE.Vector3(0.55, 0.32, -0.77).normalize() },
          uCloudBright: { value: new THREE.Color(0xffe6cc) },
          uCloudShadow: { value: new THREE.Color(0x55406b) },
          uRimColor:    { value: new THREE.Color(0xff9f68) }
        },
        vertexShader: `
          uniform float uTime;
          varying vec3 vNormalW;
          varying vec3 vWorldPos;
          varying vec3 vLocal;
          void main() {
            vLocal = position;
            vec3 p = position + normal * sin(position.x * 1.4 + uTime * 0.65) * 0.12;
            vec4 wp = modelMatrix * vec4(p, 1.0);
            vWorldPos = wp.xyz;
            vNormalW = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: `
          uniform vec3 uSunDir;
          uniform vec3 uCloudBright;
          uniform vec3 uCloudShadow;
          uniform vec3 uRimColor;
          varying vec3 vNormalW;
          varying vec3 vWorldPos;
          varying vec3 vLocal;

          void main() {
            vec3 N = normalize(vNormalW);
            vec3 V = normalize(cameraPosition - vWorldPos);
            float ndl = dot(N, normalize(uSunDir)) * 0.5 + 0.5;
            float upShade = smoothstep(-0.6, 0.8, N.y);
            float lit = clamp(ndl * 0.65 + upShade * 0.45, 0.0, 1.0);

            float rim = pow(1.0 - max(dot(N, V), 0.0), 2.4);
            vec3 col = mix(uCloudShadow, uCloudBright, lit);
            col += uRimColor * rim * 0.42;

            float softEdge = smoothstep(0.02, 0.45, max(dot(N, V), 0.0));
            gl_FragColor = vec4(col, 0.86 * softEdge);
          }
        `,
        transparent: true,
        depthWrite: false
      });
    }


    // =========================================================================
    // 4. REUSABLE MICRO-VOXEL ARCHITECTURAL & NATURE HELPERS
    // =========================================================================
    function buildStreetLamp(vb, x, z, y = 0.05) {
      vb.add(x, y + 0.14, z, 0x1e293b, 0.34, 0.28, 0.34);
      vb.add(x, y + 1.35, z, 0x334155, 0.16, 2.25, 0.16);
      vb.add(x, y + 2.52, z, 0x1e293b, 0.42, 0.12, 0.42);
      vb.add(x, y + 2.74, z, 0xffd166, 0.32, 0.36, 0.32, true);
      vb.add(x, y + 2.98, z, 0x1e293b, 0.46, 0.12, 0.46);
      vb.add(x, y + 3.1,  z, 0x334155, 0.18, 0.14, 0.18);
    }

    function buildPineTree(vb, x, y, z, scale = 1.0) {
      vb.add(x, y + 0.65 * scale, z, 0x5c3a21, 0.52 * scale, 1.3 * scale, 0.52 * scale);
      const greens = [0x15803d, 0x166534, 0x22c55e, 0x4ade80];
      const layers = [
        { dy: 1.55, r: 1.25, lh: 0.72 },
        { dy: 2.25, r: 1.02, lh: 0.72 },
        { dy: 2.92, r: 0.76, lh: 0.68 },
        { dy: 3.52, r: 0.46, lh: 0.62 },
        { dy: 4.02, r: 0.22, lh: 0.46 }
      ];
      layers.forEach((L, idx) => {
        const col = jitterColor(greens[idx % greens.length], 0.04);
        vb.addFoliage(x, y + L.dy * scale, z, col, L.r * 2 * scale, L.lh * scale, L.r * 2 * scale);
      });
    }

    function buildLushTree(vb, x, y, z, scale = 1.0) {
      vb.add(x, y + 0.6 * scale, z, 0x5c3a21, 0.52 * scale, 1.25 * scale, 0.52 * scale);
      const canopy = [
        { dx: 0.0,  dy: 1.55, dz: 0.0,  sx: 1.7,  sy: 1.05, sz: 1.7,  col: 0x15803d },
        { dx: -0.6, dy: 1.85, dz: 0.45, sx: 1.05, sy: 0.9,  sz: 1.05, col: 0x22c55e },
        { dx: 0.65, dy: 1.9,  dz: -0.4, sx: 1.05, sy: 0.9,  sz: 1.05, col: 0x4ade80 },
        { dx: 0.3,  dy: 2.25, dz: 0.4,  sx: 1.15, sy: 0.85, sz: 1.15, col: 0x84cc16 },
        { dx: -0.3, dy: 2.35, dz: -0.3, sx: 1.0,  sy: 0.8,  sz: 1.0,  col: 0xa3e635 },
        { dx: 0.0,  dy: 2.78, dz: 0.0,  sx: 0.9,  sy: 0.55, sz: 0.9,  col: 0xbef264 }
      ];
      canopy.forEach(c => {
        vb.addFoliage(
          x + c.dx * scale,
          y + c.dy * scale,
          z + c.dz * scale,
          jitterColor(c.col, 0.04),
          c.sx * scale,
          c.sy * scale,
          c.sz * scale
        );
      });
    }

    function buildSakuraTree(vb, x, y, z, scale = 1.0) {
      // Sculpted dark branching trunk
      vb.add(x, y + 0.72 * scale, z, 0x4a2c2a, 0.58 * scale, 1.48 * scale, 0.58 * scale);
      vb.add(x - 0.35 * scale, y + 1.35 * scale, z + 0.25 * scale, 0x4a2c2a, 0.32 * scale, 0.75 * scale, 0.32 * scale);
      vb.add(x + 0.38 * scale, y + 1.42 * scale, z - 0.25 * scale, 0x4a2c2a, 0.32 * scale, 0.78 * scale, 0.32 * scale);

      const clusters = [
        [0.0,   2.05,  0.0,  2.4,  1.2,  2.4,  0xf472b6],
        [-1.15, 2.0,   0.55, 1.55, 1.15, 1.55, 0xec4899],
        [1.15,  2.1,  -0.5,  1.6,  1.15, 1.55, 0xf9a8d4],
        [0.45,  2.25,  1.05, 1.45, 1.05, 1.45, 0xf472b6],
        [-0.55, 2.25, -1.0,  1.45, 1.05, 1.45, 0xfbcfe8],
        [0.0,   2.85,  0.15, 1.75, 0.92, 1.75, 0xf9a8d4],
        [-0.6,  2.75,  0.4,  1.15, 0.82, 1.15, 0xfbcfe8],
        [0.65,  2.75, -0.35, 1.15, 0.82, 1.15, 0xfdf2f8],
        [0.0,   3.35,  0.0,  1.05, 0.58, 1.05, 0xfdf2f8]
      ];
      clusters.forEach(([dx, dy, dz, sx, sy, sz, col]) => {
        vb.addFoliage(x + dx * scale, y + dy * scale, z + dz * scale, jitterColor(col, 0.03), sx * scale, sy * scale, sz * scale);
      });

      // Scattered fallen pink sakura petals on the grass
      for (let i = 0; i < 8; i++) {
        const a = rand() * Math.PI * 2;
        const r = (0.9 + rand() * 1.45) * scale;
        vb.add(x + Math.cos(a) * r, y + 0.06, z + Math.sin(a) * r, i % 2 === 0 ? 0xf9a8d4 : 0xfbcfe8, 0.24, 0.06, 0.24);
      }
    }

    function buildDriftingSakuraPetals(customSources) {
      const sakuraSources = customSources || [
        { x: -26.2, y: 3.6, z: -19.2, r: 4.5, count: 48 },
        { x: -24.4, y: 3.5, z: -10.8, r: 4.8, count: 52 },
        { x: -38.4, y: 3.7, z: 5.2,   r: 4.8, count: 48 },
        { x: -28.2, y: 3.5, z: 9.8,   r: 4.6, count: 46 },
        { x: 30.1,  y: 3.9, z: -10.2, r: 5.2, count: 56 },
        { x: 42.5,  y: 3.4, z: -5.5,  r: 4.0, count: 30 }
      ];

      let totalCount = 0;
      sakuraSources.forEach(s => totalCount += s.count);

      const baseGeo = new THREE.BoxGeometry(0.2, 0.045, 0.14);
      const instGeo = new THREE.InstancedBufferGeometry();
      instGeo.index = baseGeo.index;
      instGeo.attributes.position = baseGeo.attributes.position;
      instGeo.attributes.normal = baseGeo.attributes.normal;

      const origins = new Float32Array(totalCount * 3);
      const params = new Float32Array(totalCount * 4);

      let idx = 0;
      sakuraSources.forEach(src => {
        for (let i = 0; i < src.count; i++) {
          const angle = rand() * Math.PI * 2;
          const dist = Math.sqrt(rand()) * src.r;
          origins[idx * 3]     = src.x + Math.cos(angle) * dist * 0.55;
          origins[idx * 3 + 1] = src.y + (rand() - 0.35) * 1.4;
          origins[idx * 3 + 2] = src.z + Math.sin(angle) * dist * 0.55;

          params[idx * 4]     = rand();
          params[idx * 4 + 1] = 0.075 + rand() * 0.065;
          params[idx * 4 + 2] = 0.7 + rand() * 0.9;
          params[idx * 4 + 3] = rand();
          idx++;
        }
      });

      instGeo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(origins, 3));
      instGeo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 4));
      instGeo.instanceCount = totalCount;

      sakuraPetalsMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime:      { value: 0 },
          uTintColor: { value: new THREE.Color(0xffe4e6) },
          uLightMix:  { value: 1.0 }
        },
        vertexShader: `
          attribute vec3 aOrigin;
          attribute vec4 aParams;
          uniform float uTime;

          varying float vColorMix;
          varying float vFade;
          varying vec3 vNormalW;

          mat3 rotY(float a) {
            float c = cos(a), s = sin(a);
            return mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c);
          }
          mat3 rotX(float a) {
            float c = cos(a), s = sin(a);
            return mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c);
          }

          void main() {
            float phase = aParams.x;
            float speed = aParams.y;
            float drift = aParams.z;
            vColorMix = aParams.w;

            float life = fract(uTime * speed + phase);
            float fadeIn = smoothstep(0.0, 0.14, life);
            float fadeOut = 1.0 - smoothstep(0.84, 1.0, life);
            vFade = fadeIn * fadeOut;

            float swayX = sin(uTime * 1.9 + phase * 18.0) * 1.15 * drift;
            float swayZ = cos(uTime * 1.6 + phase * 15.0) * 0.95 * drift;
            vec3 center = aOrigin + vec3(
              life * 4.8 * drift + swayX,
              -life * (aOrigin.y - 0.18) + sin(uTime * 2.8 + phase * 22.0) * 0.16,
              life * 2.6 * drift + swayZ
            );

            mat3 rot = rotY(uTime * (2.2 + phase * 2.0) + phase * 12.0)
                     * rotX(uTime * (2.8 + drift * 1.4) + phase * 9.0);
            vec3 localPos = rot * (position * (0.65 + 0.55 * vFade));
            vNormalW = normalize(rot * normal);

            gl_Position = projectionMatrix * modelViewMatrix * vec4(center + localPos, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uTintColor;
          uniform float uLightMix;
          varying float vColorMix;
          varying float vFade;
          varying vec3 vNormalW;

          void main() {
            if (vFade < 0.02) discard;
            vec3 palePink = pow(vec3(0.99, 0.86, 0.92), vec3(2.2));
            vec3 vibrantPink = pow(vec3(0.96, 0.45, 0.71), vec3(2.2));
            vec3 petalCol = mix(palePink, vibrantPink, vColorMix);

            float shade = 0.72 + 0.28 * abs(dot(normalize(vNormalW), normalize(vec3(0.5, 0.8, -0.3))));
            petalCol = mix(petalCol * 0.78, petalCol * uTintColor * shade, uLightMix);

            gl_FragColor = vec4(petalCol, vFade * 0.94);
          }
        `,
        transparent: true,
        depthWrite: false
      });

      const petalsMesh = new THREE.Mesh(instGeo, sakuraPetalsMat);
      petalsMesh.frustumCulled = false;
      scene.add(petalsMesh);
    }

    function buildFlowerBed(vb, x0, z0, w, d, y = 0.06) {
      vb.addBox(x0, y, z0, w, 0.12, d, 0x3f6212);
      const flowerCols = [0xf472b6, 0xfacc15, 0xfb7185, 0x38bdf8, 0xc084fc, 0xfef08a, 0xffffff];
      const count = Math.max(4, Math.floor(w * d * 2.1));
      for (let i = 0; i < count; i++) {
        const fx = x0 + 0.2 + rand() * Math.max(0.1, w - 0.4);
        const fz = z0 + 0.2 + rand() * Math.max(0.1, d - 0.4);
        const col = flowerCols[Math.floor(rand() * flowerCols.length)];
        vb.add(fx, y + 0.2, fz, col, 0.24, 0.22, 0.24);
      }
    }

    function buildWhiteFence(vb, x1, z1, x2, z2, y = 0.05) {
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const steps = Math.max(2, Math.round(len / 0.55));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = x1 + dx * t;
        const pz = z1 + dz * t;
        const isPost = (i === 0 || i === steps || i % 4 === 0);
        vb.add(px, y + (isPost ? 0.42 : 0.34), pz, 0xf8fafc, isPost ? 0.18 : 0.11, isPost ? 0.84 : 0.68, isPost ? 0.18 : 0.11);
      }
      const horizX = Math.abs(dx) >= Math.abs(dz);
      const mx = (x1 + x2) * 0.5;
      const mz = (z1 + z2) * 0.5;
      if (horizX) {
        vb.add(mx, y + 0.22, mz, 0xe2e8f0, len, 0.09, 0.09);
        vb.add(mx, y + 0.52, mz, 0xe2e8f0, len, 0.09, 0.09);
      } else {
        vb.add(mx, y + 0.22, mz, 0xe2e8f0, 0.09, 0.09, len);
        vb.add(mx, y + 0.52, mz, 0xe2e8f0, 0.09, 0.09, len);
      }
    }

    function buildIronRailing(vb, x1, z1, x2, z2, y = 0.05) {
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const steps = Math.max(2, Math.round(len / 0.75));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        vb.add(x1 + dx * t, y + 0.4, z1 + dz * t, 0x1e293b, 0.12, 0.8, 0.12);
      }
      const mx = (x1 + x2) * 0.5;
      const mz = (z1 + z2) * 0.5;
      if (Math.abs(dx) >= Math.abs(dz)) {
        vb.add(mx, y + 0.76, mz, 0x334155, len, 0.1, 0.1);
        vb.add(mx, y + 0.38, mz, 0x1e293b, len, 0.07, 0.07);
      } else {
        vb.add(mx, y + 0.76, mz, 0x334155, 0.1, 0.1, len);
        vb.add(mx, y + 0.38, mz, 0x1e293b, 0.07, 0.07, len);
      }
    }

    function buildPlazaBanner(vb, x, z, y = 0.14) {
      // Twin wrought-iron poles & crossbar
      vb.add(x - 0.76, y + 1.75, z, 0x1e293b, 0.14, 3.5, 0.14);
      vb.add(x + 0.76, y + 1.75, z, 0x1e293b, 0.14, 3.5, 0.14);
      vb.add(x, y + 3.45, z, 0x334155, 1.72, 0.14, 0.16);
      // Glowing Cyan Swallowtail Banner Cloth
      vb.add(x, y + 2.42, z, 0x06b6d4, 1.32, 1.85, 0.12, true);
      vb.add(x - 0.36, y + 1.3, z, 0x06b6d4, 0.58, 0.42, 0.12, true);
      vb.add(x + 0.36, y + 1.3, z, 0x06b6d4, 0.58, 0.42, 0.12, true);
      // Crisp Pixel 'A' Emblem (front & back)
      [z + 0.08, z - 0.08].forEach(ez => {
        vb.add(x, y + 2.72, ez, 0xffffff, 0.38, 0.16, 0.05, true);
        vb.add(x - 0.24, y + 2.34, ez, 0xffffff, 0.16, 0.78, 0.05, true);
        vb.add(x + 0.24, y + 2.34, ez, 0xffffff, 0.16, 0.78, 0.05, true);
        vb.add(x, y + 2.3, ez, 0xffffff, 0.42, 0.14, 0.05, true);
      });
    }

    function buildCobbleStrip(vb, x0, z0, w, d, y = 0.04) {
      const tile = 0.9;
      const cols = [0xcbd5e1, 0xb8c4d4, 0xd8dee9, 0xa8b5c7];
      for (let x = x0; x < x0 + w; x += tile) {
        for (let z = z0; z < z0 + d; z += tile) {
          const tw = Math.min(tile - 0.05, x0 + w - x);
          const td = Math.min(tile - 0.05, z0 + d - z);
          if (tw > 0.12 && td > 0.12) {
            const c = cols[Math.floor(rand() * cols.length)];
            vb.add(x + tw * 0.5, y + 0.05, z + td * 0.5, c, tw, 0.1, td);
          }
        }
      }
    }

    // (Unused legacy helpers removed during optimization)


    // =========================================================================
    // 5. ISLAND BASE, COASTLINE EMBANKMENT & ASPHALT ROAD NETWORK
    // =========================================================================
    function buildBaseAndRoads(vb) {
      // Main Island Grass Foundation (46 x 38 half-extents -> x: -46..46, z: -43.5..32.5)
      vb.addBox(-46, -2.0, -43.5, 92, 2.0, 64.0, 0x3f7d3a);
      // Subtle grass tonal patches
      for (let x = -44; x < 44; x += 4) {
        for (let z = -42; z < 19; z += 4) {
          if (rand() > 0.55) {
            vb.add(x + 2, 0.01, z + 2, jitterColor(0x478c3e, 0.05), 3.9, 0.04, 3.9);
          }
        }
      }

      // Harbor Concrete Sea Wall & Industrial Waterfront Slab (z: 20.5..32.5)
      vb.addBox(-46, -2.2, 20.5, 92, 2.25, 12.0, 0x7c8694);
      // Concrete Quay Edge Coping & Bollards
      for (let x = -45; x <= 45; x += 2.0) {
        if (Math.abs(x) < 4.5) continue;
        vb.add(x, 0.1, 32.2, 0xcbd5e1, 1.9, 0.22, 0.72);
        if (Math.abs(x) % 6 === 3) {
          vb.add(x, 0.38, 32.2, 0xffd166, 0.34, 0.36, 0.34, true);
        }
      }

      // Asphalt Road Network
      const roadY = 0.06;
      const asphalt = 0x262b36;
      function addRoad(x0, z0, w, d) {
        vb.addBox(x0, 0.0, z0, w, roadY + 0.02, d, asphalt);
      }

      // North Downtown Loop Road (z = -37..-33)
      addRoad(-24, -37, 48, 4.0);
      // Mid-Downtown East-West Road (z = -15..-11)
      addRoad(-24, -15, 48, 4.0);
      // West-side Spur into NW Park (x = -34..-22, z = -25..-21.5)
      addRoad(-34, -25, 12, 3.5);
      // East-side Spur into East Village (x = 22..37, z = -25..-21.5)
      addRoad(22, -25, 15, 3.5);
      // East Perimeter Avenue (x = 37..41, z = -25..18)
      addRoad(37, -25, 4.0, 43.0);
      // West Downtown Vertical Avenue (x = -24..-20, z = -37..-11)
      addRoad(-24, -37, 4.0, 26.0);
      // East Downtown Vertical Avenue (x = 20..24, z = -37..-11)
      addRoad(20, -37, 4.0, 26.0);
      // Central Plaza West Avenue (x = -12..-8, z = -15..18)
      addRoad(-12, -15, 4.0, 33.0);
      // Central Plaza East Avenue (x = 8..12, z = -15..18)
      addRoad(8, -15, 4.0, 33.0);
      // Central Spine from City Hall North & South
      addRoad(-2.5, -37, 5.0, 25.0);
      addRoad(-2.5, 11.5, 5.0, 33.0); // Continues down through railway & central harbor pier!
      // Southern Cross-City Boulevard (z = 14..18, x = -42..41)
      addRoad(-42, 14, 83.0, 4.0);

      // Dashed Yellow Centerlines (0.25 micro-voxel crisp stripes)
      function addCenterlineX(x0, x1, z) {
        for (let x = x0; x < x1 - 1.0; x += 2.6) {
          vb.add(x + 0.65, roadY + 0.03, z, 0xfacc15, 1.3, 0.04, 0.22);
        }
      }
      function addCenterlineZ(x, z0, z1) {
        for (let z = z0; z < z1 - 1.0; z += 2.6) {
          vb.add(x, roadY + 0.03, z + 0.65, 0xfacc15, 0.22, 0.04, 1.3);
        }
      }
      addCenterlineX(-22, 22, -35);
      addCenterlineX(-22, 22, -13);
      addCenterlineX(-33, -23, -23.25);
      addCenterlineX(23, 38, -23.25);
      addCenterlineX(-41, 39, 16);
      addCenterlineZ(-22, -34, -14);
      addCenterlineZ(22, -34, -14);
      addCenterlineZ(-10, -11, 14);
      addCenterlineZ(10, -11, 14);
      addCenterlineZ(39, -22, 14);
      addCenterlineZ(0, 17, 43);

      // Zebra Crosswalks at Key Intersections
      function addCrosswalk(cx, cz, horiz = true) {
        for (let i = -3; i <= 3; i++) {
          if (horiz) vb.add(cx + i * 0.5, roadY + 0.035, cz, 0xf8fafc, 0.26, 0.04, 1.35);
          else       vb.add(cx, roadY + 0.035, cz + i * 0.5, 0xf8fafc, 1.35, 0.04, 0.26);
        }
      }
      addCrosswalk(-10, -10.5, true);
      addCrosswalk(10, -10.5, true);
      addCrosswalk(-10, 13.5, true);
      addCrosswalk(10, 13.5, true);
      addCrosswalk(0, 13.5, true);
      addCrosswalk(0, 18.4, true);
      addCrosswalk(-7.4, -13, false);
      addCrosswalk(7.4, -13, false);
      addCrosswalk(-7.4, 16, false);
      addCrosswalk(7.4, 16, false);
      addCrosswalk(-20.2, -23.25, false);
      addCrosswalk(20.2, -23.25, false);

    }

    // =========================================================================
    // 6. HEAVILY DETAILED DOWNTOWN & CITY HALL DISTRICT
    // =========================================================================
    function buildDowntown(vb) {
      const py = 0.06;
      const dz = 1.15; // Aligns downtown block cleanly between North (-33) & Mid (-15) roads

      function buildWindowGrid(cx, baseY, cz, w, h, d, winColor, floors, colsX, colsZ, prob = 0.85) {
        const floorH = h / floors;
        for (let f = 0; f < floors; f++) {
          const wy = baseY + f * floorH + floorH * 0.5;
          for (let i = 0; i < colsX; i++) {
            const wx = cx - w * 0.5 + ((i + 0.5) / colsX) * w;
            if (rand() < prob) vb.add(wx, wy, cz + d * 0.5 + 0.06, winColor, 0.55, 0.65, 0.1, true);
            if (rand() < prob) vb.add(wx, wy, cz - d * 0.5 - 0.06, winColor, 0.55, 0.65, 0.1, true);
          }
          for (let j = 0; j < colsZ; j++) {
            const wz = cz - d * 0.5 + ((j + 0.5) / colsZ) * d;
            if (rand() < prob) vb.add(cx - w * 0.5 - 0.06, wy, wz, winColor, 0.1, 0.65, 0.55, true);
            if (rand() < prob) vb.add(cx + w * 0.5 + 0.06, wy, wz, winColor, 0.1, 0.65, 0.55, true);
          }
        }
      }

      // -----------------------------------------------------------------------
      // 1. TILED COBBLESTONE SIDEWALKS & INTERNAL DOWNTOWN WALKWAYS
      // -----------------------------------------------------------------------
      buildTiledWalkway(vb, -19.55, -34.05 + dz, 17.35, 1.15, py); // NW North sidewalk
      buildTiledWalkway(vb, 2.2,    -34.05 + dz, 17.35, 1.15, py); // NE North sidewalk
      buildTiledWalkway(vb, -19.55, -34.05 + dz, 1.25, 17.85, py); // West sidewalk
      buildTiledWalkway(vb, 18.3,   -34.05 + dz, 1.25, 17.85, py); // East sidewalk
      buildTiledWalkway(vb, -19.55, -17.35 + dz, 17.35, 1.15, py); // SW South sidewalk
      buildTiledWalkway(vb, 2.2,    -17.35 + dz, 17.35, 1.15, py); // SE South sidewalk
      // Internal paved plazas & alleys flanking City Hall
      buildTiledWalkway(vb, -18.3, -23.6 + dz, 12.2, 1.25, py);    // West mid-block alley
      buildTiledWalkway(vb, 6.2,   -26.8 + dz, 12.1, 1.15, py);    // East mid-block alley
      buildTiledWalkway(vb, -6.9,  -29.8 + dz, 1.35, 12.5, py);    // West City Hall promenade
      buildTiledWalkway(vb, 5.55,  -29.8 + dz, 1.35, 12.5, py);    // East City Hall promenade

      // Helper for detailed parapet-roofed downtown buildings
      function buildOfficeBlock(opts) {
        const {
          cx, cz, w, h, d,
          wallCol = 0x94a3b8,
          parapetCol = 0xcbd5e1,
          roofCol = 0x64748b,
          winCol = 0xffd166,
          winFloors = 2,
          winColsX = 3,
          winColsZ = 2,
          lowerBandCol = null,
          neonRoofBox = null,
          hvacCount = 1,
          redAwningRight = false,
          cornerLobby = false
        } = opts;

        vb.add(cx, py + 0.16, cz, 0x475569, w + 0.24, 0.32, d + 0.24);
        vb.add(cx, py + 0.32 + h * 0.5, cz, jitterColor(wallCol, 0.025), w, h, d);

        if (lowerBandCol !== null) {
          vb.add(cx, py + 0.32 + h * 0.56, cz + d * 0.5 + 0.06, lowerBandCol, w + 0.16, 0.65, 0.18, true);
        }

        const roofY = py + 0.32 + h;
        vb.add(cx, roofY + 0.08, cz, roofCol, w - 0.3, 0.16, d - 0.3);
        const pw = 0.28, ph = 0.44;
        vb.add(cx, roofY + ph * 0.5, cz - d * 0.5 + pw * 0.5, parapetCol, w + 0.12, ph, pw);
        vb.add(cx, roofY + ph * 0.5, cz + d * 0.5 - pw * 0.5, parapetCol, w + 0.12, ph, pw);
        vb.add(cx - w * 0.5 + pw * 0.5, roofY + ph * 0.5, cz, parapetCol, pw, ph, d);
        vb.add(cx + w * 0.5 - pw * 0.5, roofY + ph * 0.5, cz, parapetCol, pw, ph, d);

        if (hvacCount >= 1) {
          vb.add(cx - w * 0.22, roofY + 0.42, cz - d * 0.16, 0x475569, 0.9, 0.52, 0.85);
          vb.add(cx - w * 0.22, roofY + 0.70, cz - d * 0.16, 0x94a3b8, 0.66, 0.08, 0.62);
        }
        if (hvacCount >= 2) {
          vb.add(cx + w * 0.22, roofY + 0.38, cz + d * 0.12, 0x475569, 0.78, 0.44, 0.78);
          vb.add(cx + w * 0.22, roofY + 0.62, cz + d * 0.12, 0xcbd5e1, 0.54, 0.08, 0.54);
        }

        if (neonRoofBox) {
          const [bw, bh, bd, bCol, ox, oz] = neonRoofBox;
          vb.add(cx + ox, roofY + bh * 0.5 + 0.12, cz + oz, bCol, bw, bh, bd, true);
          vb.add(cx + ox, roofY + bh + 0.16, cz + oz, 0xffffff, bw * 0.78, 0.1, bd * 0.72, true);
        }

        const floorH = (h - 0.5) / winFloors;
        for (let f = 0; f < winFloors; f++) {
          const wy = py + 0.62 + f * floorH + floorH * 0.45;
          const colForFloor = (f === 0 && winCol === 0x38bdf8 && cornerLobby) ? 0xffd166 : winCol;
          for (let i = 0; i < winColsX; i++) {
            const wx = cx - w * 0.5 + ((i + 0.5) / winColsX) * w;
            vb.add(wx, wy, cz + d * 0.5 + 0.04, 0x1e293b, 0.68, 0.72, 0.09);
            vb.add(wx, wy, cz + d * 0.5 + 0.08, colForFloor, 0.54, 0.58, 0.07, true);
            vb.add(wx, wy, cz - d * 0.5 - 0.06, colForFloor, 0.52, 0.56, 0.07, true);
          }
          for (let j = 0; j < winColsZ; j++) {
            const wz = cz - d * 0.5 + ((j + 0.5) / winColsZ) * d;
            vb.add(cx - w * 0.5 - 0.06, wy, wz, colForFloor, 0.07, 0.56, 0.52, true);
            vb.add(cx + w * 0.5 + 0.06, wy, wz, colForFloor, 0.07, 0.56, 0.52, true);
          }
        }

        if (redAwningRight) {
          const ax = cx + w * 0.22;
          const az = cz + d * 0.5 + 0.42;
          vb.add(ax, py + 1.55, az, 0xdc2626, w * 0.48, 0.24, 0.82);
          vb.add(ax, py + 1.38, az + 0.34, 0xef4444, w * 0.48, 0.22, 0.16);
          vb.add(ax, py + 0.85, cz + d * 0.5 + 0.09, 0xfef08a, w * 0.42, 0.95, 0.08, true);
        }
      }

      // Helper for Vertical Glowing Neon Blade Signs
      function buildNeonBlade(x, y, z, h, col) {
        vb.add(x, y + h * 0.5, z, 0x1e293b, 0.58, h + 0.24, 0.72);
        vb.add(x, y + h * 0.5, z, col, 0.68, h, 0.58, true);
        vb.add(x, y + h * 0.5, z, 0xfdf4ff, 0.72, h * 0.78, 0.18, true);
      }

      // Helper for Tall Crowned Skyscrapers (Amber West & Cyan East)
      function buildSkyscraper(cx, cz, w, h, d, bodyCol, crownCol, winCol) {
        vb.add(cx, py + 0.2, cz, 0x334155, w + 0.3, 0.4, d + 0.3);
        vb.add(cx, py + 0.4 + h * 0.5, cz, bodyCol, w, h, d);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
          vb.add(cx + sx * (w * 0.5 + 0.04), py + 0.4 + h * 0.5, cz + sz * (d * 0.5 + 0.04), 0x64748b, 0.24, h, 0.24);
        });
        const topY = py + 0.4 + h;
        vb.add(cx, topY + 0.24, cz - d * 0.5 + 0.16, crownCol, w + 0.32, 0.46, 0.32, true);
        vb.add(cx, topY + 0.24, cz + d * 0.5 - 0.16, crownCol, w + 0.32, 0.46, 0.32, true);
        vb.add(cx - w * 0.5 + 0.16, topY + 0.24, cz, crownCol, 0.32, 0.46, d + 0.32, true);
        vb.add(cx + w * 0.5 - 0.16, topY + 0.24, cz, crownCol, 0.32, 0.46, d + 0.32, true);
        vb.add(cx, topY + 0.85, cz, 0x475569, w * 0.62, 1.35, d * 0.62);
        vb.add(cx, topY + 1.65, cz, 0x334155, w * 0.38, 0.45, d * 0.38);
        [-0.75, 0.75].forEach(ax => {
          vb.add(cx + ax, topY + 3.05, cz - 0.3, 0xcbd5e1, 0.14, 2.8, 0.14);
          vb.add(cx + ax, topY + 4.5, cz - 0.3, 0xff2a55, 0.22, 0.22, 0.22, true);
        });
        buildWindowGrid(cx, py + 1.1, cz, w, h - 1.4, d, winCol, 10, 3, 3, 0.92);
      }

      // -----------------------------------------------------------------------
      // 2. CENTRAL CITY HALL & CLOCK TOWER (x = 0, z = -25.2 + dz)
      // -----------------------------------------------------------------------
      for (let s = 0; s < 6; s++) {
        const sy = py + 0.12 + s * 0.14;
        const sz = -19.25 + dz - s * 0.38;
        vb.add(0, sy, sz, s % 2 === 0 ? 0xe2e8f0 : 0xcbd5e1, 4.1, 0.16, 0.44);
      }
      [-2.15, 2.15].forEach(bx => {
        vb.add(bx, py + 0.62, -20.2 + dz, 0x94a3b8, 0.36, 0.88, 2.45);
        vb.add(bx, py + 1.16, -19.05 + dz, 0xffd166, 0.28, 0.24, 0.28, true);
      });

      vb.addBox(-5.95, py, -28.6 + dz, 11.9, 0.82, 7.5, 0x94a3b8);
      vb.addBox(-5.65, py + 0.82, -28.2 + dz, 11.3, 4.4, 6.7, 0xe2d5c3);
      [-5.6, -2.9, 2.9, 5.6].forEach(px => {
        vb.add(px, py + 3.0, -21.45 + dz, 0xf1f5f9, 0.36, 4.4, 0.24);
      });
      vb.addBox(-6.0, py + 5.18, -28.5 + dz, 12.0, 0.34, 7.3, 0xf1f5f9);

      // Cyan-Trimmed Stepped Mansard Wing Roofs + Glowing Clerestory Windows
      [-4.15, 4.15].forEach(wx => {
        vb.add(wx, py + 5.75, -24.85 + dz, 0x0e7490, 3.3, 0.78, 6.2);
        vb.add(wx, py + 6.45, -24.85 + dz, 0x334155, 2.5, 0.72, 5.2);
        vb.add(wx, py + 5.56, -21.62 + dz, 0x22d3ee, 3.1, 0.22, 0.18, true);
        vb.add(wx, py + 6.18, -21.95 + dz, 0xffd166, 2.1, 0.42, 0.16, true);
      });

      // Grand Front Portico with Fluted Columns & Triangular Pediment
      [-1.75, -0.95, 0.95, 1.75].forEach(cx => {
        vb.add(cx, py + 2.35, -21.1 + dz, 0xf8fafc, 0.34, 3.1, 0.34);
      });
      vb.add(0, py + 4.02, -21.1 + dz, 0xe2e8f0, 4.3, 0.32, 0.95);
      vb.add(0, py + 4.32, -21.1 + dz, 0xcbd5e1, 3.1, 0.3, 0.85);
      vb.add(0, py + 4.60, -21.1 + dz, 0x94a3b8, 1.7, 0.28, 0.75);
      vb.add(0, py + 4.15, -20.6 + dz, 0xffd166, 0.45, 0.32, 0.14, true);

      // Glowing Grand Double Entrance + Wing Windows
      vb.add(0, py + 1.95, -21.42 + dz, 0x451a03, 1.85, 2.25, 0.16);
      vb.add(0, py + 1.92, -21.35 + dz, 0xffd166, 1.48, 1.95, 0.12, true);
      [-4.65, -3.55, 3.55, 4.65].forEach(wx => {
        vb.add(wx, py + 2.25, -21.45 + dz, 0x334155, 0.84, 1.38, 0.12);
        vb.add(wx, py + 2.25, -21.39 + dz, 0xffd166, 0.68, 1.18, 0.1, true);
      });

      // Central Clock Tower Shaft + Glowing Tall Window + Ornate Round Clock Face
      vb.addBox(-2.45, py + 5.2, -27.4 + dz, 4.9, 6.4, 5.2, 0xd6c7b2);
      vb.add(0, py + 6.4, -22.15 + dz, 0x475569, 1.55, 2.2, 0.14);
      vb.add(0, py + 6.4, -22.08 + dz, 0xfff3b0, 1.28, 1.92, 0.12, true);
      vb.add(0, py + 6.4, -22.02 + dz, 0x78350f, 0.12, 1.92, 0.06);

      vb.add(0, py + 9.45, -22.14 + dz, 0x475569, 2.55, 2.55, 0.2);
      vb.add(0, py + 9.45, -22.06 + dz, 0xf59e0b, 2.25, 2.25, 0.16, true);
      vb.add(0, py + 9.45, -21.98 + dz, 0xfffbeb, 1.82, 1.82, 0.14, true);
      vb.add(0, py + 9.78, -21.88 + dz, 0x1e293b, 0.16, 0.68, 0.09);
      vb.add(0.32, py + 9.45, -21.88 + dz, 0x1e293b, 0.56, 0.16, 0.09);

      // Clock Tower Cornice, Cyan Roof Trim, Slate Cupola & Blinking Red Spire
      vb.addBox(-2.75, py + 11.55, -27.7 + dz, 5.5, 0.42, 5.8, 0xf1f5f9);
      vb.addBox(-2.6,  py + 11.98, -27.55 + dz, 5.2, 0.24, 5.5, 0x22d3ee, true);
      vb.addBox(-1.95, py + 12.22, -26.8 + dz, 3.9, 1.15, 4.0, 0x334155);
      vb.addBox(-1.25, py + 13.37, -26.1 + dz, 2.5, 0.85, 2.6, 0x1e293b);
      vb.add(0, py + 15.6, -24.8 + dz, 0xe2e8f0, 0.22, 2.8, 0.22);

      const beaconMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.46, 0.46, 0.46),
        new THREE.MeshBasicMaterial({ color: 0xff2a55 })
      );
      beaconMesh.position.set(0, py + 17.15, -24.8 + dz);
      scene.add(beaconMesh);
      animatedObjects.blinkBeacons.push({ mesh: beaconMesh, phase: 0 });

      // Twin Cyan Swallowtail 'A' Banners Flanking City Hall's Grand Stairs
      [-4.45, 4.45].forEach(bx => {
        const bz = -18.85 + dz;
        vb.add(bx, py + 1.85, bz - 0.14, 0x1e293b, 0.18, 3.5, 0.18);
        vb.add(bx, py + 3.45, bz, 0x334155, 1.35, 0.16, 0.18);
        vb.add(bx, py + 2.45, bz, 0x0284c7, 1.16, 1.85, 0.1, true);
        vb.add(bx, py + 2.48, bz + 0.04, 0x0ea5e9, 0.96, 1.72, 0.08, true);
        [-0.08, 0.08].forEach(f => {
          vb.add(bx - 0.2, py + 2.42, bz + f, 0xffffff, 0.14, 0.78, 0.05, true);
          vb.add(bx + 0.2, py + 2.42, bz + f, 0xffffff, 0.14, 0.78, 0.05, true);
          vb.add(bx, py + 2.8, bz + f, 0xffffff, 0.44, 0.14, 0.05, true);
          vb.add(bx, py + 2.38, bz + f, 0xffffff, 0.38, 0.12, 0.05, true);
        });
      });

      // -----------------------------------------------------------------------
      // 3. WEST DOWNTOWN BUILDINGS & NEON LANDMARKS
      // -----------------------------------------------------------------------
      buildSkyscraper(-8.8, -31.0 + dz, 4.2, 15.6, 4.6, 0x334155, 0xfacc15, 0xfbbf24);

      buildOfficeBlock({
        cx: -15.9, cz: -27.8 + dz, w: 4.1, h: 6.4, d: 6.4,
        wallCol: 0x94a3b8, parapetCol: 0xe2e8f0, roofCol: 0x64748b,
        winCol: 0xffd166, winFloors: 2, winColsX: 3, winColsZ: 3,
        lowerBandCol: 0x0ea5e9,
        neonRoofBox: [2.0, 0.65, 1.25, 0xf59e0b, 0.0, 0.4],
        hvacCount: 1
      });
      buildNeonBlade(-18.25, py + 2.2, -27.8 + dz, 3.6, 0xe879f9);

      buildOfficeBlock({
        cx: -12.4, cz: -30.5 + dz, w: 2.9, h: 7.4, d: 4.0,
        wallCol: 0x6d28d9, parapetCol: 0xd8b4fe, roofCol: 0x581c87,
        winCol: 0x60a5fa, winFloors: 3, winColsX: 2, winColsZ: 2,
        hvacCount: 1
      });

      buildOfficeBlock({
        cx: -4.6, cz: -30.4 + dz, w: 3.3, h: 7.2, d: 4.4,
        wallCol: 0x94a3b8, parapetCol: 0xe2e8f0, roofCol: 0x64748b,
        winCol: 0x38bdf8, winFloors: 3, winColsX: 2, winColsZ: 2,
        hvacCount: 1, cornerLobby: true
      });

      buildOfficeBlock({
        cx: -10.8, cz: -25.2 + dz, w: 5.4, h: 4.8, d: 4.4,
        wallCol: 0x7e22ce, parapetCol: 0xc084fc, roofCol: 0x581c87,
        winCol: 0xe879f9, winFloors: 2, winColsX: 3, winColsZ: 2,
        neonRoofBox: [2.4, 0.52, 1.05, 0xe879f9, 0.4, -0.15],
        hvacCount: 1
      });
      buildNeonBlade(-7.85, py + 1.8, -25.2 + dz, 3.4, 0xf0abfc);

      buildOfficeBlock({
        cx: -11.6, cz: -19.6 + dz, w: 6.4, h: 4.2, d: 4.2,
        wallCol: 0x64748b, parapetCol: 0x94a3b8, roofCol: 0x334155,
        winCol: 0xffd166, winFloors: 2, winColsX: 4, winColsZ: 2,
        hvacCount: 2, redAwningRight: true
      });

      // -----------------------------------------------------------------------
      // 4. EAST DOWNTOWN BUILDINGS, CYAN TOWER & RINGED HELIPAD ('H')
      // -----------------------------------------------------------------------
      buildOfficeBlock({
        cx: 5.2, cz: -30.4 + dz, w: 3.5, h: 7.4, d: 4.4,
        wallCol: 0x94a3b8, parapetCol: 0xe2e8f0, roofCol: 0x64748b,
        winCol: 0x38bdf8, winFloors: 3, winColsX: 2, winColsZ: 2,
        hvacCount: 1, cornerLobby: true
      });

      buildSkyscraper(9.4, -31.0 + dz, 4.2, 17.8, 4.6, 0x1e3a5f, 0x22d3ee, 0x38bdf8);
      buildNeonBlade(12.25, py + 2.4, -27.8 + dz, 3.4, 0xe879f9);

      // Helipad ('H') Building with Complete Yellow Circle Ring & White 'H'
      const hx = 15.6, hz = -29.6 + dz, hw = 5.0, hh = 10.4, hd = 5.2;
      vb.add(hx, py + 0.2, hz, 0x334155, hw + 0.25, 0.4, hd + 0.25);
      vb.add(hx, py + 0.4 + hh * 0.5, hz, 0x78716c, hw, hh, hd);
      const hTop = py + 0.4 + hh;
      vb.add(hx, hTop + 0.08, hz, 0x334155, hw - 0.36, 0.16, hd - 0.36);
      vb.add(hx, hTop + 0.24, hz - hd * 0.5 + 0.18, 0xcbd5e1, hw + 0.16, 0.46, 0.34);
      vb.add(hx, hTop + 0.24, hz + hd * 0.5 - 0.18, 0xcbd5e1, hw + 0.16, 0.46, 0.34);
      vb.add(hx - hw * 0.5 + 0.18, hTop + 0.24, hz, 0xcbd5e1, 0.34, 0.46, hd);
      vb.add(hx + hw * 0.5 - 0.18, hTop + 0.24, hz, 0xcbd5e1, 0.34, 0.46, hd);
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        vb.add(hx + Math.cos(a) * 1.68, hTop + 0.22, hz + Math.sin(a) * 1.68, 0xfacc15, 0.32, 0.1, 0.32, true);
      }
      vb.add(hx - 0.62, hTop + 0.24, hz, 0xffffff, 0.34, 0.12, 1.78, true);
      vb.add(hx + 0.62, hTop + 0.24, hz, 0xffffff, 0.34, 0.12, 1.78, true);
      vb.add(hx, hTop + 0.24, hz, 0xffffff, 1.24, 0.12, 0.34, true);
      buildWindowGrid(hx, py + 1.2, hz, hw, hh - 1.8, hd, 0xffd166, 5, 3, 3, 0.88);

      buildOfficeBlock({
        cx: 10.2, cz: -23.6 + dz, w: 5.6, h: 5.4, d: 4.6,
        wallCol: 0x94a3b8, parapetCol: 0xe2e8f0, roofCol: 0x64748b,
        winCol: 0xffd166, winFloors: 2, winColsX: 4, winColsZ: 2,
        neonRoofBox: [2.4, 0.58, 1.15, 0x22d3ee, -0.7, 0.15],
        hvacCount: 2
      });

      buildOfficeBlock({
        cx: 16.2, cz: -23.6 + dz, w: 3.6, h: 4.8, d: 4.2,
        wallCol: 0x78716c, parapetCol: 0xcbd5e1, roofCol: 0x475569,
        winCol: 0xffd166, winFloors: 2, winColsX: 2, winColsZ: 2,
        hvacCount: 1
      });

      buildOfficeBlock({
        cx: 12.6, cz: -19.2 + dz, w: 5.2, h: 3.8, d: 3.8,
        wallCol: 0x94a3b8, parapetCol: 0xe2e8f0, roofCol: 0x64748b,
        winCol: 0xffd166, winFloors: 2, winColsX: 3, winColsZ: 2,
        hvacCount: 2
      });

      // -----------------------------------------------------------------------
      // 5. POCKET GARDENS, LUSH TREES & WARM DOWNTOWN STREETLAMPS
      // -----------------------------------------------------------------------
      buildVillageFlowerBed(vb, -6.2,  -20.6 + dz, 3.6, 2.8, py + 0.04);
      buildVillageFlowerBed(vb, 2.6,   -20.6 + dz, 3.6, 2.8, py + 0.04);
      buildVillageFlowerBed(vb, -18.0, -21.8 + dz, 2.8, 3.8, py + 0.04);
      buildVillageFlowerBed(vb, 7.6,   -20.8 + dz, 2.1, 3.2, py + 0.04);
      buildVillageFlowerBed(vb, 15.6,  -20.8 + dz, 2.4, 3.2, py + 0.04);

      [
        [-18.6, -32.6, 0.85], [-18.6, -25.4, 0.82], [-18.6, -20.4, 0.85], [-16.6, -18.0, 0.85],
        [-7.8,  -18.0, 0.82], [-5.6,  -20.2, 0.88], [-3.2,  -20.2, 0.86], [-3.2,  -18.0, 0.8],
        [3.2,   -20.2, 0.86], [5.6,   -20.2, 0.88], [3.2,   -18.0, 0.8],  [8.2,   -18.0, 0.85],
        [16.8,  -18.0, 0.85], [18.6,  -20.4, 0.85], [18.6,  -32.2, 0.88],
        [-2.8,  -32.6, 0.85], [2.8,   -32.6, 0.85], [6.4,   -25.8, 0.82], [12.4,  -32.4, 0.84]
      ].forEach(([tx, tz, sc]) => {
        buildVillageLushTree(vb, tx, py + 0.08, tz + dz, sc);
      });

      [
        [-18.9, -33.4], [18.9, -33.4], [-18.9, -22.5], [18.9, -22.5],
        [-18.9, -16.9], [18.9, -16.9], [-6.4,  -22.2], [6.4,  -22.2],
        [-3.4,  -16.9], [3.4,  -16.9], [-11.8, -16.9], [11.8, -16.9],
        [18.9,  -27.4]
      ].forEach(([lx, lz]) => {
        buildStreetLamp(vb, lx, lz + dz, py + 0.1);
      });
    }

    // =========================================================================
    // 7. HEAVILY DETAILED CENTRAL FOUNTAIN PLAZA (x: -8..8, z: -11..14)
    // =========================================================================
    function buildCentralFountainPlaza(vb) {
      const py = 0.08;
      // Cobblestone Paver Tiles across the Plaza
      buildCobbleStrip(vb, -7.8, -10.8, 15.6, 24.4, 0.04);

      // Raised Outer Curbs & Side Entry Steps
      vb.add(-7.85, py + 0.08, 1.4, 0x94a3b8, 0.25, 0.2, 24.6);
      vb.add(7.85,  py + 0.08, 1.4, 0x94a3b8, 0.25, 0.2, 24.6);
      [-7.95, 7.95].forEach(sx => {
        vb.add(sx, py + 0.06, 0, 0xe2e8f0, 0.45, 0.16, 3.2);
      });

      // Recessed North Road Stub & Zebra Crosswalk
      vb.add(0, 0.07, -9.8, 0x262b36, 4.6, 0.1, 2.2);
      for (let i = -3; i <= 3; i++) {
        vb.add(i * 0.55, 0.13, -10.2, 0xf8fafc, 0.28, 0.04, 1.25);
      }

      // Octagonal Stepped Stone Fountain Basin
      const octSides = 8;
      for (let i = 0; i < octSides; i++) {
        const a1 = (i / octSides) * Math.PI * 2 + Math.PI / 8;
        const a2 = ((i + 1) / octSides) * Math.PI * 2 + Math.PI / 8;
        const r = 4.25;
        const mx = (Math.cos(a1) + Math.cos(a2)) * 0.5 * r;
        const mz = (Math.sin(a1) + Math.sin(a2)) * 0.5 * r;
        const steps = 6;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const bx = Math.cos(a1) * r * (1 - t) + Math.cos(a2) * r * t;
          const bz = Math.sin(a1) * r * (1 - t) + Math.sin(a2) * r * t;
          vb.add(bx, py + 0.28, bz, 0x64748b, 0.72, 0.56, 0.72);
          vb.add(bx, py + 0.62, bz, 0xcbd5e1, 0.78, 0.14, 0.78);
        }
        vb.add(mx * 1.07, py + 0.14, mz * 1.07, 0x94a3b8, 0.85, 0.28, 0.85);
      }

      // Four Cardinal Stone Bench Ledges around the Fountain
      [[0, -4.85, 2.4, 0.55], [0, 4.85, 2.4, 0.55], [-4.85, 0, 0.55, 2.4], [4.85, 0, 0.55, 2.4]].forEach(([bx, bz, sw, sd]) => {
        vb.add(bx, py + 0.32, bz, 0x94a3b8, sw, 0.42, sd);
        vb.add(bx, py + 0.56, bz, 0xe2e8f0, sw + 0.1, 0.1, sd + 0.1);
      });

      // Realistic Animated GLSL Fountain Basin Water Surface
      const fountainWaterGeo = new THREE.PlaneGeometry(8.1, 8.1, 24, 24);
      fountainWaterGeo.rotateX(-Math.PI / 2);
      fountainWaterMesh = new THREE.Mesh(fountainWaterGeo, createFountainWaterMaterial());
      fountainWaterMesh.position.set(0, py + 0.52, 0);
      scene.add(fountainWaterMesh);

      // Two Concentric Glowing Cyan-White Neon Water Rings + Central Jet
      [1.35, 2.65].forEach((rad, rIdx) => {
        const segs = rIdx === 0 ? 22 : 34;
        for (let i = 0; i < segs; i++) {
          const a = (i / segs) * Math.PI * 2;
          vb.add(Math.cos(a) * rad, py + 0.6, Math.sin(a) * rad, rIdx === 0 ? 0xe0faff : 0x22d3ee, 0.26, 0.14, 0.26, true);
        }
      });
      vb.add(0, py + 0.78, 0, 0x67e8f9, 1.35, 0.42, 1.35, true);
      vb.add(0, py + 1.25, 0, 0xe0faff, 0.65, 0.65, 0.65, true);

      // 180-Cube Animated Aurora Double-Helix Spiral Sculpture (Single InstancedMesh = 1 Draw Call)
      const spiralCount = 180;
      const spiralGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
      const spiralMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      spiralInstMesh = new THREE.InstancedMesh(spiralGeo, spiralMat, spiralCount);
      spiralInstMesh.frustumCulled = false;
      const sMat4 = new THREE.Matrix4();
      const sCol = new THREE.Color();
      for (let i = 0; i < spiralCount; i++) {
        const t = i / spiralCount;
        const strand = i % 2;
        const baseAngle = t * Math.PI * 6.0 + strand * Math.PI;
        const r = THREE.MathUtils.lerp(1.45, 0.28, t);
        const baseY = py + 1.15 + t * 5.4;
        sMat4.makeTranslation(Math.cos(baseAngle) * r, baseY, Math.sin(baseAngle) * r);
        spiralInstMesh.setMatrixAt(i, sMat4);
        sCol.setHSL(THREE.MathUtils.lerp(0.52, 0.78, t), 0.95, 0.68);
        spiralInstMesh.setColorAt(i, sCol);
        animatedObjects.spiralData.push({ baseAngle, r, baseY, t });
      }
      spiralInstMesh.instanceMatrix.needsUpdate = true;
      if (spiralInstMesh.instanceColor) spiralInstMesh.instanceColor.needsUpdate = true;
      scene.add(spiralInstMesh);

      // Four Symmetrical L-Shaped White-Fenced Corner Gardens + Swallowtail 'A' Banners
      const corners = [
        { sx: -1, sz: -1 },
        { sx: 1,  sz: -1 },
        { sx: -1, sz: 1  },
        { sx: 1,  sz: 1  }
      ];
      corners.forEach(({ sx, sz }) => {
        const gx0 = sx < 0 ? -7.5 : 3.2;
        const gz0 = sz < 0 ? -10.2 : 5.4;
        // L-shaped lush grass beds & flowerbeds
        vb.addBox(gx0, py, gz0, 4.3, 0.12, 4.8, 0x3f8f34);
        buildFlowerBed(vb, gx0 + 0.45, gz0 + 0.55, 3.3, 1.55, py + 0.04);
        buildFlowerBed(vb, sx < 0 ? -6.9 : 4.2, sz < 0 ? -7.8 : 7.6, 2.4, 2.0, py + 0.04);

        // White picket fence framing the corner garden
        const fxInner = sx * 3.2;
        const fzInner = sz * 5.4;
        buildWhiteFence(vb, fxInner, sz * 10.2, sx * 7.5, sz * 10.2, py);
        buildWhiteFence(vb, fxInner, sz * 10.2, fxInner, fzInner, py);

        // Tall Swallowtail Cyan 'A' Banner
        buildPlazaBanner(vb, sx * 4.5, sz * 7.1, py + 0.08);

        // Lush Multi-Tone Corner Trees
        buildLushTree(vb, sx * 6.4, py + 0.08, sz * 8.6, 0.78);
        buildLushTree(vb, sx * 6.5, py + 0.08, sz * 4.6, 0.68);

        // Promenade Streetlamps
        buildStreetLamp(vb, sx * 7.2, sz * 10.6, py);
        buildStreetLamp(vb, sx * 2.8, sz * 6.2, py);
        buildStreetLamp(vb, sx * 7.2, sz * 2.8, py);
      });

      // Twin South Entrance Promenade Streetlamps + Planter Boxes
      buildStreetLamp(vb, -2.1, 12.6, py);
      buildStreetLamp(vb, 2.1, 12.6, py);
      [-5.2, 5.2].forEach(px => {
        vb.add(px, py + 0.25, 12.2, 0x78350f, 2.2, 0.42, 0.9);
        buildFlowerBed(vb, px - 0.95, 11.85, 1.9, 0.7, py + 0.36);
      });
    }

    // =========================================================================
    // 8. HEAVILY DETAILED WEST WATERFALL PARKLAND (GLSL WATERFALL & LAGOON)
    // =========================================================================
    function buildWaterfallPark(vb) {
      // Stepped Micro-Voxel Cliff Gorge & Rock Ledges on Far-West Edge
      const rockPalette = [0x64748b, 0x57534e, 0x475569, 0x78716c, 0x94a3b8];
      for (let z = -34; z <= 12; z += 1.6) {
        const isGorge = (z > -24.5 && z < -18.5);
        for (let tier = 0; tier < 5; tier++) {
          const x = -45.0 + tier * 1.55 + (rand() - 0.5) * 0.45;
          let h = (5 - tier) * 2.3 + (rand() - 0.3) * 1.8;
          if (isGorge && tier >= 2) h = Math.min(h, 5.8 - (tier - 2) * 1.8);
          if (z > -8) h *= 0.68;
          if (h > 0.8) {
            const c = rockPalette[Math.floor(rand() * rockPalette.length)];
            vb.add(x, h * 0.5 - 0.3, z, jitterColor(c, 0.05), 1.85, h, 1.85);
            if (rand() > 0.45 && !isGorge) {
              vb.add(x, h - 0.22, z, jitterColor(0x3f8f34, 0.05), 1.65, 0.25, 1.65);
            }
          }
        }
      }

      // Upper Gorge Turquoise Stream feeding the Waterfall
      vb.add(-41.2, 7.65, -21.2, 0x22d3ee, 4.6, 0.32, 3.8, true);

      // Curved Parabolic 3D Waterfall Sheet with Custom GLSL Shader
      const wfSegU = 18, wfSegV = 28;
      const wfGeo = new THREE.PlaneGeometry(1, 1, wfSegU, wfSegV);
      const pos = wfGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) + 0.5; // 0..1 width
        const v = 0.5 - pos.getY(i); // 0 (top stream) .. 1 (plunge pool)
        const width = THREE.MathUtils.lerp(3.2, 4.3, v);
        // Parabolic curve bending from cliff lip (-39.0, 7.8, -21.2) into lagoon (-35.4, -0.2, -18.8)
        let wx, wy, wz;
        if (v < 0.16) {
          const t = v / 0.16;
          wx = THREE.MathUtils.lerp(-40.2, -38.6, t);
          wy = THREE.MathUtils.lerp(7.85, 7.65, t);
          wz = THREE.MathUtils.lerp(-21.6, -20.8, t);
        } else {
          const t = (v - 0.16) / 0.84;
          wx = -38.6 + t * 3.2;
          wy = 7.65 - t * t * 7.85;
          wz = -20.8 + t * 2.1;
        }
        // Perpendicular width offset in XZ
        const perpX = -0.54, perpZ = 0.84;
        pos.setXYZ(
          i,
          wx + (u - 0.5) * width * perpX,
          wy,
          wz + (u - 0.5) * width * perpZ
        );
      }
      wfGeo.computeVertexNormals();
      waterfallMesh = new THREE.Mesh(wfGeo, createWaterfallMaterial());
      scene.add(waterfallMesh);

      // Volumetric Plunge-Pool Rising Mist Plumes
      waterfallMistMat = createWaterfallMistMaterial();
      for (let m = 0; m < 4; m++) {
        const mistGeo = new THREE.PlaneGeometry(5.8 + m * 0.7, 3.6 + m * 0.4);
        const mist = new THREE.Mesh(mistGeo, waterfallMistMat);
        mist.position.set(-35.4 + (m - 1.5) * 0.5, 1.35 + m * 0.25, -18.6 + (m - 1.5) * 0.4);
        mist.rotation.y = (m * Math.PI) / 4 + 0.3;
        scene.add(mist);
      }

      // 46 Animated Parabolic Spray & Foam Droplets (Single InstancedMesh = 1 Draw Call)
      const dropCount = 46;
      const dropGeo = new THREE.BoxGeometry(0.24, 0.24, 0.24);
      const dropMat = new THREE.MeshBasicMaterial({ color: 0xe0faff, transparent: true, opacity: 0.88 });
      dropsInstMesh = new THREE.InstancedMesh(dropGeo, dropMat, dropCount);
      dropsInstMesh.frustumCulled = false;
      const dMat4 = new THREE.Matrix4();
      for (let i = 0; i < dropCount; i++) {
        dMat4.identity();
        dropsInstMesh.setMatrixAt(i, dMat4);
        animatedObjects.dropsData.push({
          phase: rand(),
          speed: 0.65 + rand() * 0.55,
          uOff: (rand() - 0.5) * 3.6
        });
      }
      dropsInstMesh.instanceMatrix.needsUpdate = true;
      scene.add(dropsInstMesh);

      // Two-Lobed Realistic GLSL Lagoon Pond
      const pondGeo = new THREE.PlaneGeometry(24, 34, 20, 28);
      pondGeo.rotateX(-Math.PI / 2);
      pondWaterMesh = new THREE.Mesh(pondGeo, createPondWaterMaterial());
      pondWaterMesh.position.set(-30.5, 0.14, -4.5);
      scene.add(pondWaterMesh);

      // Natural Micro-Voxel Stone Shoreline Boulders hugging the Lagoon
      const bankPts = [
        [-38.5, -16], [-39.0, -12], [-38.2, -8], [-36.0, -4.5],
        [-38.2, 0.5], [-38.6, 4.5], [-37.2, 8.2], [-33.5, 10.6],
        [-28.5, 11.2], [-23.5, 10.2], [-20.2, 7.6], [-19.6, 3.6],
        [-21.4, -0.2], [-24.8, -3.4], [-25.5, -8.5], [-26.2, -13.5],
        [-27.5, -18.0], [-30.8, -21.0]
      ];
      bankPts.forEach(([bx, bz]) => {
        vb.add(bx, 0.22, bz, jitterColor(0x64748b, 0.07), 1.35, 0.62, 1.35);
        vb.add(bx + (rand() - 0.5) * 0.8, 0.14, bz + (rand() - 0.5) * 0.8, jitterColor(0x94a3b8, 0.06), 0.85, 0.42, 0.85);
      });

      // 4 Lush Multi-Leaf Lily-Pad Clusters with Lotus Blossoms
      [[-32.4, -12.6], [-30.5, -8.2], [-29.8, 2.5], [-26.4, 6.4]].forEach(([lx, lz], idx) => {
        [[0, 0, 0.72], [0.65, 0.35, 0.58], [-0.55, 0.42, 0.52], [0.2, -0.6, 0.5]].forEach(([dx, dz, sz]) => {
          vb.add(lx + dx, 0.19, lz + dz, jitterColor(0x4ade80, 0.06), sz, 0.08, sz);
        });
        vb.add(lx + 0.1, 0.29, lz + 0.1, idx % 2 === 0 ? 0xfacc15 : 0xf472b6, 0.28, 0.22, 0.28, true);
      });

      // Winding Cobblestone Park Footpaths
      const pathNodes = [
        [-30.5, -21.0], [-29.0, -18.0], [-25.2, -15.2], [-23.4, -12.0],
        [-22.2, -8.0], [-18.5, -5.2], [-15.2, -2.2], [-15.2, 2.5],
        [-17.2, 6.5], [-16.2, 11.2], [-16.2, 13.5],
        // West bank trail
        [-39.8, -7.2], [-37.2, -3.5], [-38.8, 1.2], [-39.6, 6.2], [-37.8, 10.6], [-34.2, 13.0]
      ];
      for (let i = 0; i < pathNodes.length; i++) {
        const [px, pz] = pathNodes[i];
        buildCobbleStrip(vb, px - 1.1, pz - 1.1, 2.2, 2.2, 0.04);
      }

      // --- OCTAGONAL SHINGLED PAGODA GAZEBO (x=-19.6, z=-2.2) ---
      const gx = -19.6, gz = -2.2;
      // Stepped octagonal stone plinth
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        vb.add(gx + Math.cos(a) * 2.4, 0.22, gz + Math.sin(a) * 2.4, 0x94a3b8, 1.35, 0.44, 1.35);
      }
      vb.add(gx, 0.28, gz, 0xcbd5e1, 4.4, 0.52, 4.4);
      // Warm glowing octagonal interior core
      vb.add(gx, 1.45, gz, 0xffcf70, 2.6, 1.75, 2.6, true);
      // 8 Dark Timber Columns + Wooden Railings
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        vb.add(gx + Math.cos(a) * 2.15, 1.55, gz + Math.sin(a) * 2.15, 0x5c3a21, 0.26, 2.1, 0.26);
        vb.add(gx + Math.cos(a) * 2.15, 0.92, gz + Math.sin(a) * 2.15, 0x78350f, 0.95, 0.16, 0.95);
      }
      // Stepped Dark-Navy Shingled Octagonal Roof + Radial Hip Ribs + Spire
      for (let tier = 0; tier < 5; tier++) {
        const rad = 3.15 - tier * 0.52;
        const y = 2.68 + tier * 0.36;
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          vb.add(gx + Math.cos(a) * rad * 0.72, y, gz + Math.sin(a) * rad * 0.72, tier % 2 === 0 ? 0x1e3a5f : 0x264b78, rad * 0.78, 0.32, rad * 0.78);
        }
      }
      vb.add(gx, 4.65, gz, 0x0f172a, 0.65, 0.48, 0.65);
      vb.add(gx, 5.15, gz, 0xfacc15, 0.24, 0.55, 0.24, true);

      // --- ARCHED CEDAR WOODEN BRIDGE (x: -35.8..-24.6, z: -2.8) ---
      const brZ = -2.8;
      const planks = 26;
      for (let i = 0; i <= planks; i++) {
        const t = i / planks;
        const bx = THREE.MathUtils.lerp(-35.6, -24.8, t);
        const arch = Math.sin(t * Math.PI) * 1.45;
        const plankCol = i % 2 === 0 ? 0xb45309 : 0x92400e;
        vb.add(bx, 0.36 + arch, brZ, plankCol, 0.42, 0.18, 2.55);
        // Side beams & double handrails
        [-1.22, 1.22].forEach(rz => {
          vb.add(bx, 0.22 + arch, brZ + rz, 0x5c3a21, 0.44, 0.26, 0.16);
          vb.add(bx, 1.02 + arch, brZ + rz, 0x78350f, 0.44, 0.12, 0.14);
          if (i % 4 === 0) {
            vb.add(bx, 0.68 + arch, brZ + rz, 0x5c3a21, 0.16, 0.78, 0.16);
          }
        });
        // Submerged timber pilings
        if (i === 7 || i === 19) {
          [-1.1, 1.1].forEach(rz => vb.add(bx, 0.2, brZ + rz, 0x451a03, 0.28, 1.6, 0.28));
        }
      }
      // 4 Flanking Bridge Entrance Lanterns
      [[-35.8, brZ - 1.4], [-35.8, brZ + 1.4], [-24.6, brZ - 1.4], [-24.6, brZ + 1.4]].forEach(([lx, lz]) => {
        buildStreetLamp(vb, lx, lz, 0.08);
      });

      // Rich Sakura Trees, Lush Park Trees, Wildflowers & Path Streetlamps
      buildSakuraTree(vb, -26.2, 0.05, -19.2, 1.02);
      buildSakuraTree(vb, -24.4, 0.05, -10.8, 1.06);
      buildSakuraTree(vb, -38.4, 0.05, 5.2,   1.05);
      buildSakuraTree(vb, -28.2, 0.05, 9.8,   0.98);

      [[-32.5, -20.5], [-36.2, -9.5], [-40.5, -2.5], [-39.5, 11.2], [-22.5, 11.2], [-15.2, -9.5], [-15.2, 8.2], [-15.2, -14.0]].forEach(([tx, tz]) => {
        buildLushTree(vb, tx, 0.05, tz, 0.85 + rand() * 0.2);
      });
      [[-42.2, -16], [-42.5, 1.5], [-42.0, 9.5], [-34.5, -29.5], [-28.5, -31.5], [-26.5, -28.0]].forEach(([tx, tz]) => {
        buildPineTree(vb, tx, 0.05, tz, 1.05 + rand() * 0.25);
      });
      buildFlowerBed(vb, -27.5, -16.8, 2.2, 1.4, 0.06);
      buildFlowerBed(vb, -18.5, -8.5, 2.2, 1.4, 0.06);
      buildFlowerBed(vb, -35.8, 9.2, 2.6, 1.5, 0.06);
      [[-36.5, -8.2], [-37.5, 7.6], [-24.2, 11.8], [-15.0, 5.5], [-25.5, -16.5]].forEach(([lx, lz]) => {
        buildStreetLamp(vb, lx, lz, 0.06);
      });
    }

    // =========================================================================
    // 9. HEAVILY DETAILED EAST RESIDENTIAL NEIGHBORHOOD & 7-ELEVEN
    // =========================================================================
    function buildTiledWalkway(vb, x0, z0, w, d, y = 0.07) {
      const tile = 0.58;
      const cols = [0xcbd5e1, 0xbec9d8, 0xd7dee8, 0xb0bccb];
      const nx = Math.max(1, Math.round(w / tile));
      const nz = Math.max(1, Math.round(d / tile));
      const sx = w / nx;
      const sz = d / nz;
      vb.addBox(x0, y - 0.04, z0, w, 0.08, d, 0x64748b);
      for (let ix = 0; ix < nx; ix++) {
        for (let iz = 0; iz < nz; iz++) {
          const c = cols[(ix * 3 + iz * 5 + Math.floor(rand() * 2)) % cols.length];
          vb.add(
            x0 + (ix + 0.5) * sx,
            y + 0.04,
            z0 + (iz + 0.5) * sz,
            jitterColor(c, 0.025),
            sx * 0.92,
            0.09,
            sz * 0.92
          );
        }
      }
    }

    function buildPicketFence(vb, x1, z1, x2, z2, y = 0.08) {
      const dx = x2 - x1;
      const dz = z2 - z1;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.2) return;
      const steps = Math.max(2, Math.round(dist / 0.44));
      const isHoriz = Math.abs(dx) >= Math.abs(dz);

      vb.add((x1 + x2) * 0.5, y + 0.26, (z1 + z2) * 0.5, 0xf1f5f9, isHoriz ? dist : 0.08, 0.08, isHoriz ? 0.08 : dist);
      vb.add((x1 + x2) * 0.5, y + 0.54, (z1 + z2) * 0.5, 0xf1f5f9, isHoriz ? dist : 0.08, 0.08, isHoriz ? 0.08 : dist);

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const px = x1 + dx * t;
        const pz = z1 + dz * t;
        const isEndPost = (i === 0 || i === steps);
        const pw = isEndPost ? 0.17 : 0.11;
        const ph = isEndPost ? 0.84 : 0.72;
        vb.add(px, y + ph * 0.5, pz, isEndPost ? 0xffffff : 0xe2e8f0, pw, ph, pw);
      }
    }

    function buildVillageLushTree(vb, x, y, z, scale = 1.0) {
      vb.add(x, y + 0.15 * scale, z, 0x4a2c15, 0.52 * scale, 0.3 * scale, 0.52 * scale);
      vb.add(x, y + 0.9 * scale, z, 0x5c3a21, 0.36 * scale, 1.55 * scale, 0.36 * scale);
      const canopy = [
        { dx: 0, dy: 1.65, dz: 0, sx: 1.7, sy: 0.7, sz: 1.7, col: 0x15803d },
        { dx: 0, dy: 2.15, dz: 0, sx: 2.1, sy: 0.65, sz: 1.15, col: 0x22c55e },
        { dx: 0, dy: 2.15, dz: 0, sx: 1.15, sy: 0.65, sz: 2.1, col: 0x22c55e },
        { dx: -0.65, dy: 1.95, dz: 0.55, sx: 0.78, sy: 0.6, sz: 0.78, col: 0x16a34a },
        { dx: 0.65, dy: 1.95, dz: -0.55, sx: 0.78, sy: 0.6, sz: 0.78, col: 0x16a34a },
        { dx: 0.55, dy: 2.0, dz: 0.55, sx: 0.72, sy: 0.58, sz: 0.72, col: 0x4ade80 },
        { dx: -0.55, dy: 2.0, dz: -0.55, sx: 0.72, sy: 0.58, sz: 0.72, col: 0x4ade80 },
        { dx: 0, dy: 2.65, dz: 0, sx: 1.25, sy: 0.55, sz: 1.25, col: 0x65a30d },
        { dx: 0, dy: 3.05, dz: 0, sx: 0.72, sy: 0.42, sz: 0.72, col: 0x84cc16 }
      ];
      canopy.forEach(c => {
        vb.addFoliage(
          x + c.dx * scale,
          y + c.dy * scale,
          z + c.dz * scale,
          jitterColor(c.col, 0.04),
          c.sx * scale,
          c.sy * scale,
          c.sz * scale
        );
      });
    }

    function buildVillageFlowerBed(vb, x0, z0, w, d, y = 0.06) {
      const bushCols = [0x166534, 0x15803d, 0x22c55e, 0x3f6212, 0x4d7c0f];
      const flowerCols = [0xf472b6, 0xec4899, 0xfbbf24, 0xffffff, 0xc084fc, 0xfb7185, 0x38bdf8];
      vb.addBox(x0, y, z0, w, 0.08, d, 0x2d5a1e);
      const count = Math.max(6, Math.round(w * d * 2.6));
      for (let i = 0; i < count; i++) {
        const fx = x0 + 0.2 + rand() * Math.max(0.1, w - 0.4);
        const fz = z0 + 0.2 + rand() * Math.max(0.1, d - 0.4);
        const bh = 0.25 + rand() * 0.35;
        const bw = 0.32 + rand() * 0.36;
        vb.add(fx, y + bh * 0.5 + 0.05, fz, jitterColor(bushCols[Math.floor(rand() * bushCols.length)], 0.05), bw, bh, bw);
        if (rand() > 0.22) {
          const fc = flowerCols[Math.floor(rand() * flowerCols.length)];
          vb.add(fx + (rand() - 0.5) * 0.16, y + bh + 0.12, fz + (rand() - 0.5) * 0.16, fc, 0.22, 0.16, 0.22);
        }
      }
    }

    function buildSimpleHouse(vb, x, y, z, w, h, d, wallCol, roofCol, yaw90 = false) {
      const bw = yaw90 ? d : w;
      const bd = yaw90 ? w : d;
      vb.add(x, y + h * 0.5, z, jitterColor(wallCol, 0.03), bw, h, bd);
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        const frac = s / steps;
        const rw = bw + 0.6 - frac * bw * 0.82;
        const rd = bd + 0.6 - frac * bd * 0.12;
        vb.add(x, y + h + 0.25 + s * 0.45, z, jitterColor(roofCol, 0.03), yaw90 ? rd : rw, 0.46, yaw90 ? rw : rd);
      }
      vb.add(x, y + 0.85, z + bd * 0.5 + 0.06, 0x78350f, 0.75, 1.5, 0.12);
      vb.add(x - bw * 0.28, y + 1.25, z + bd * 0.5 + 0.06, 0xffd166, 0.65, 0.7, 0.1, true);
      vb.add(x + bw * 0.28, y + 1.25, z + bd * 0.5 + 0.06, 0xffd166, 0.65, 0.7, 0.1, true);
      vb.add(x - bw * 0.5 - 0.06, y + 1.25, z, 0xffd166, 0.1, 0.7, 0.8, true);
      vb.add(x + bw * 0.5 + 0.06, y + 1.25, z, 0xffd166, 0.1, 0.7, 0.8, true);
    }

    function buildDetailedHouse(vb, opts) {
      const {
        x, z, w = 4.4, d = 3.6, h = 2.4,
        wallCol = 0xe8dcc8,
        roofCol = 0x274472,
        roofAlt = 0x1e355b,
        ridgeLeftRight = false,
        hasDormer = false,
        hasChimney = false,
        hasSideDeck = false,
        flatTerracotta = false
      } = opts;
      const y = 0.06;

      // Stone foundation plinth + front concrete porch steps
      vb.add(x, y + 0.16, z, 0x64748b, w + 0.28, 0.32, d + 0.28);
      vb.add(x, y + 0.14, z + d * 0.5 + 0.42, 0xcbd5e1, 1.5, 0.22, 0.72);
      vb.add(x, y + 0.07, z + d * 0.5 + 0.85, 0xb8c4d4, 1.3, 0.12, 0.42);

      // Main stucco/wood walls + crisp corner pilasters & cornice trim
      vb.add(x, y + 0.32 + h * 0.5, z, jitterColor(wallCol, 0.02), w, h, d);
      const trimCol = 0xf8fafc;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        vb.add(x + sx * (w * 0.5), y + 0.32 + h * 0.5, z + sz * (d * 0.5), trimCol, 0.18, h, 0.18);
      });
      vb.add(x, y + 0.32 + h, z, trimCol, w + 0.24, 0.14, d + 0.24);

      // Recessed warm double-pane front door with dark wood frame + porch light
      const fz = z + d * 0.5;
      vb.add(x, y + 1.02, fz + 0.04, 0x451a03, 1.15, 1.42, 0.12);
      vb.add(x - 0.24, y + 1.0, fz + 0.09, 0xffc857, 0.38, 1.16, 0.08, true);
      vb.add(x + 0.24, y + 1.0, fz + 0.09, 0xffc857, 0.38, 1.16, 0.08, true);
      vb.add(x, y + 1.82, fz + 0.14, 0xfff3b0, 0.24, 0.18, 0.16, true);

      // Mullioned glowing windows on Front, Left, Right, and Back
      const winOffsets = [-w * 0.33, w * 0.33];
      winOffsets.forEach(wx => {
        vb.add(x + wx, y + 1.25, fz + 0.04, 0x334155, 0.92, 0.86, 0.1);
        vb.add(x + wx, y + 1.25, fz + 0.08, 0xffd166, 0.76, 0.7, 0.08, true);
        vb.add(x + wx, y + 1.25, fz + 0.11, 0x475569, 0.08, 0.72, 0.05);
        vb.add(x + wx, y + 1.25, fz + 0.11, 0x475569, 0.78, 0.08, 0.05);
        vb.add(x + wx, y + 0.79, fz + 0.1, 0xf1f5f9, 1.0, 0.1, 0.18);
        vb.add(x + wx, y + 1.25, z - d * 0.5 - 0.05, 0xffd166, 0.72, 0.68, 0.08, true);
      });
      [-1, 1].forEach(side => {
        vb.add(x + side * (w * 0.5 + 0.04), y + 1.25, z, 0x334155, 0.1, 0.84, 1.05);
        vb.add(x + side * (w * 0.5 + 0.08), y + 1.25, z, 0xffd166, 0.08, 0.68, 0.88, true);
      });

      // Optional wooden side deck / patio
      if (hasSideDeck) {
        vb.add(x - w * 0.5 - 0.68, y + 0.18, z + 0.1, 0x9a6b49, 1.18, 0.24, d * 0.78);
        vb.add(x - w * 0.5 - 1.22, y + 0.42, z + 0.1, 0x7c5336, 0.12, 0.45, d * 0.78);
      }

      // Roof Construction
      const roofBaseY = y + 0.36 + h;
      if (flatTerracotta) {
        vb.add(x, roofBaseY + 0.22, z, 0x64748b, w + 0.36, 0.44, d + 0.36);
        for (let rx = -w * 0.42; rx <= w * 0.42; rx += 0.55) {
          for (let rz = -d * 0.4; rz <= d * 0.4; rz += 0.55) {
            vb.add(x + rx, roofBaseY + 0.46, z + rz, jitterColor(0xd97706, 0.07), 0.48, 0.12, 0.48);
          }
        }
        vb.add(x - 0.8, roofBaseY + 0.68, z - 0.2, 0x475569, 0.7, 0.42, 0.7);
        vb.add(x + 0.7, roofBaseY + 0.62, z + 0.2, 0x94a3b8, 0.55, 0.32, 0.55);
      } else {
        const steps = 8;
        const stepH = 0.24;
        for (let s = 0; s < steps; s++) {
          const frac = s / (steps - 1);
          const ry = roofBaseY + 0.1 + s * stepH;
          if (!ridgeLeftRight) {
            const rw = (w + 0.72) * (1.0 - frac * 0.92);
            const rd = d + 0.64;
            if (s < steps - 1) {
              vb.add(x, ry, z, wallCol, Math.max(0.4, rw - 0.45), stepH + 0.02, d - 0.04);
            }
            const nZ = Math.max(4, Math.round(rd / 0.52));
            const dzTile = rd / nZ;
            for (let iz = 0; iz < nZ; iz++) {
              const tz = z - rd * 0.5 + (iz + 0.5) * dzTile;
              const tileCol = ((iz + s) % 2 === 0) ? roofCol : roofAlt;
              if (s === steps - 1) {
                vb.add(x, ry + 0.04, tz, jitterColor(roofAlt, 0.03), 0.55, 0.24, dzTile * 0.96);
              } else {
                vb.add(x - rw * 0.5 + 0.22, ry, tz, jitterColor(tileCol, 0.035), 0.52, stepH + 0.04, dzTile * 0.96);
                vb.add(x + rw * 0.5 - 0.22, ry, tz, jitterColor(tileCol, 0.035), 0.52, stepH + 0.04, dzTile * 0.96);
              }
            }
            if (s < steps - 1) {
              vb.add(x - rw * 0.5 + 0.12, ry - 0.04, z + rd * 0.5 + 0.02, trimCol, 0.22, 0.2, 0.12);
              vb.add(x + rw * 0.5 - 0.12, ry - 0.04, z + rd * 0.5 + 0.02, trimCol, 0.22, 0.2, 0.12);
            }
          } else {
            const rd = (d + 0.72) * (1.0 - frac * 0.92);
            const rw = w + 0.64;
            if (s < steps - 1) {
              vb.add(x, ry, z, wallCol, w - 0.04, stepH + 0.02, Math.max(0.4, rd - 0.45));
            }
            const nX = Math.max(5, Math.round(rw / 0.52));
            const dxTile = rw / nX;
            for (let ix = 0; ix < nX; ix++) {
              const tx = x - rw * 0.5 + (ix + 0.5) * dxTile;
              const tileCol = ((ix + s) % 2 === 0) ? roofCol : roofAlt;
              if (s === steps - 1) {
                vb.add(tx, ry + 0.04, z, jitterColor(roofAlt, 0.03), dxTile * 0.96, 0.24, 0.55);
              } else {
                vb.add(tx, ry, z - rd * 0.5 + 0.22, jitterColor(tileCol, 0.035), dxTile * 0.96, stepH + 0.04, 0.52);
                vb.add(tx, ry, z + rd * 0.5 - 0.22, jitterColor(tileCol, 0.035), dxTile * 0.96, stepH + 0.04, 0.52);
              }
            }
          }
        }

        if (!ridgeLeftRight) {
          vb.add(x, roofBaseY + 0.62, fz + 0.04, 0x334155, 0.56, 0.48, 0.1);
          vb.add(x, roofBaseY + 0.62, fz + 0.08, 0xffd166, 0.42, 0.34, 0.08, true);
        }

        if (hasDormer && ridgeLeftRight) {
          const dw = 1.9;
          const dd = 1.5;
          const dzPos = z + d * 0.5 - 0.15;
          for (let s = 0; s < 5; s++) {
            const frac = s / 4;
            const sw = dw * (1.0 - frac * 0.85);
            const ry = roofBaseY + 0.22 + s * 0.22;
            vb.add(x, ry, dzPos - 0.15, wallCol, Math.max(0.3, sw - 0.3), 0.22, dd * 0.85);
            vb.add(x - sw * 0.5 + 0.15, ry + 0.04, dzPos, roofCol, 0.35, 0.22, dd);
            vb.add(x + sw * 0.5 - 0.15, ry + 0.04, dzPos, roofCol, 0.35, 0.22, dd);
          }
          vb.add(x, roofBaseY + 0.45, dzPos + dd * 0.46, 0xffd166, 0.46, 0.38, 0.08, true);
        }

        if (hasChimney) {
          vb.add(x + w * 0.24, roofBaseY + 1.55, z - d * 0.12, 0x7f1d1d, 0.56, 1.35, 0.56);
          vb.add(x + w * 0.24, roofBaseY + 2.26, z - d * 0.12, 0x475569, 0.68, 0.16, 0.68);
        }
      }
    }

    function buildDetailedSevenEleven(vb, cx, cz) {
      const y = 0.06;
      const w = 5.4, d = 3.8, h = 2.85;
      vb.add(cx, y + 0.08, cz + 0.25, 0xd8dee9, w + 0.9, 0.16, d + 1.1);
      vb.add(cx, y + 0.17, cz + d * 0.5 + 0.32, 0x1d4ed8, 1.45, 0.06, 0.58);

      vb.add(cx, y + 0.16 + h * 0.5, cz, 0xf1f5f9, w, h, d);
      vb.add(cx, y + 0.16 + h + 0.12, cz, 0x334155, w - 0.36, 0.18, d - 0.36);
      vb.add(cx, y + 0.16 + h + 0.22, cz - d * 0.5 + 0.12, 0xe2e8f0, w + 0.16, 0.36, 0.26);
      vb.add(cx, y + 0.16 + h + 0.22, cz + d * 0.5 - 0.12, 0xe2e8f0, w + 0.16, 0.36, 0.26);
      vb.add(cx - w * 0.5 + 0.12, y + 0.16 + h + 0.22, cz, 0xe2e8f0, 0.26, 0.36, d);
      vb.add(cx + w * 0.5 - 0.12, y + 0.16 + h + 0.22, cz, 0xe2e8f0, 0.26, 0.36, d);
      vb.add(cx - 1.3, y + 0.16 + h + 0.36, cz - 0.5, 0x64748b, 0.95, 0.42, 0.85);
      vb.add(cx + 1.4, y + 0.16 + h + 0.32, cz + 0.4, 0x94a3b8, 0.65, 0.32, 0.65);

      // Iconic 7-Eleven Glowing Tri-Stripe Canopy (Green, Orange, Red)
      vb.add(cx, y + 2.58, cz + 0.08, 0x22c55e, w + 0.34, 0.24, d + 0.34, true);
      vb.add(cx, y + 2.34, cz + 0.08, 0xf97316, w + 0.34, 0.20, d + 0.34, true);
      vb.add(cx, y + 2.12, cz + 0.08, 0xef4444, w + 0.34, 0.18, d + 0.34, true);

      // Centered White Sign Plaque with Micro-Voxel '7'
      const fz = cz + d * 0.5 + 0.26;
      vb.add(cx, y + 2.38, fz, 0xffffff, 0.95, 0.82, 0.12, true);
      vb.add(cx, y + 2.54, fz + 0.06, 0x16a34a, 0.52, 0.14, 0.06, true);
      vb.add(cx + 0.12, y + 2.28, fz + 0.06, 0xdc2626, 0.16, 0.44, 0.06, true);

      // Bright Illuminated Glass Storefront + Dark Mullions + Interior Shelves
      const glassZ = cz + d * 0.5 + 0.04;
      vb.add(cx, y + 1.05, glassZ, 0x1e293b, 4.85, 1.72, 0.1);
      vb.add(cx - 1.55, y + 1.05, glassZ + 0.05, 0xfef08a, 1.38, 1.48, 0.08, true);
      vb.add(cx, y + 1.05, glassZ + 0.05, 0xfff7cc, 1.36, 1.54, 0.08, true);
      vb.add(cx + 1.55, y + 1.05, glassZ + 0.05, 0xfef08a, 1.38, 1.48, 0.08, true);
      vb.add(cx - 1.55, y + 0.72, glassZ + 0.09, 0xef4444, 0.65, 0.52, 0.05, true);
      vb.add(cx + 1.55, y + 0.72, glassZ + 0.09, 0xf97316, 0.65, 0.52, 0.05, true);
      vb.add(cx, y + 0.76, glassZ + 0.09, 0xdc2626, 0.48, 0.62, 0.05, true);

      // Sidewalk Vending Machine & Trash Bin
      vb.add(cx - w * 0.5 - 0.32, y + 0.85, cz + 0.6, 0xef4444, 0.48, 1.35, 0.72);
      vb.add(cx - w * 0.5 - 0.08, y + 1.05, cz + 0.6, 0xe0f2fe, 0.08, 0.65, 0.52, true);
      vb.add(cx + w * 0.5 + 0.3, y + 0.48, cz + 1.3, 0x334155, 0.4, 0.68, 0.4);
    }

    function buildDetailedPlayground(vb, x0, z0, w, d) {
      const y = 0.06;
      const x1 = x0 + w;
      const z1 = z0 + d;

      vb.addBox(x0, y, z0, w, 0.1, d, 0x56ab2f);
      for (let i = 0; i < 26; i++) {
        const gx = x0 + 0.4 + rand() * (w - 0.8);
        const gz = z0 + 0.4 + rand() * (d - 0.8);
        vb.add(gx, y + 0.08, gz, jitterColor(0x65b832, 0.05), 0.75 + rand() * 0.8, 0.06, 0.75 + rand() * 0.8);
      }

      // Complete White Picket Fence Perimeter with South Gate opening
      buildPicketFence(vb, x0, z0, x1, z0, y + 0.04);
      buildPicketFence(vb, x0, z0, x0, z1, y + 0.04);
      buildPicketFence(vb, x1, z0, x1, z1, y + 0.04);
      buildPicketFence(vb, x0, z1, x0 + w * 0.36, z1, y + 0.04);
      buildPicketFence(vb, x0 + w * 0.64, z1, x1, z1, y + 0.04);

      // 1. RED-FRAME DOUBLE SWING SET (Upper Center)
      const swX = x0 + w * 0.48;
      const swZ = z0 + 2.35;
      vb.add(swX, y + 2.25, swZ, 0xdc2626, 2.7, 0.16, 0.16);
      [-1.25, 1.25].forEach(ox => {
        for (let s = 0; s < 6; s++) {
          const frac = s / 5;
          const sy = y + 0.25 + frac * 1.95;
          const spread = (1.0 - frac) * 0.62;
          vb.add(swX + ox, sy, swZ - spread, 0xdc2626, 0.14, 0.38, 0.14);
          vb.add(swX + ox, sy, swZ + spread, 0xdc2626, 0.14, 0.38, 0.14);
        }
      });
      [-0.55, 0.55].forEach(sx => {
        vb.add(swX + sx - 0.22, y + 1.48, swZ, 0x94a3b8, 0.06, 1.45, 0.06);
        vb.add(swX + sx + 0.22, y + 1.48, swZ, 0x94a3b8, 0.06, 1.45, 0.06);
        vb.add(swX + sx, y + 0.76, swZ, 0x2563eb, 0.54, 0.12, 0.32);
      });

      // 2. YELLOW & RED CLIMBING SLIDE TOWER (Middle-Right)
      const slX = x0 + w * 0.72;
      const slZ = z0 + 5.25;
      [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]].forEach(([px, pz]) => {
        vb.add(slX + px, y + 1.15, slZ + pz, 0xdc2626, 0.15, 2.1, 0.15);
      });
      vb.add(slX, y + 1.38, slZ, 0xfacc15, 1.28, 0.16, 1.28);
      vb.add(slX, y + 1.78, slZ - 0.55, 0xef4444, 1.24, 0.14, 0.12);
      vb.add(slX + 0.55, y + 1.78, slZ, 0xef4444, 0.12, 0.14, 1.24);
      vb.add(slX, y + 2.28, slZ, 0xf59e0b, 1.45, 0.22, 1.45);
      for (let r = 0; r < 4; r++) {
        vb.add(slX, y + 0.35 + r * 0.32, slZ - 0.65, 0xfacc15, 0.7, 0.08, 0.08);
      }
      for (let i = 0; i < 8; i++) {
        const t = i / 7;
        const cx = slX - 0.55 - t * 1.85;
        const cz = slZ + 0.35 + t * 1.15;
        const cy = y + 1.32 - Math.pow(t, 0.85) * 1.08;
        vb.add(cx, cy, cz, 0xfacc15, 0.42, 0.14, 0.58);
        vb.add(cx, cy + 0.12, cz - 0.26, 0xeab308, 0.42, 0.14, 0.08);
        vb.add(cx, cy + 0.12, cz + 0.26, 0xeab308, 0.42, 0.14, 0.08);
      }

      // 3. Sandbox, Park Bench & Lush Flower/Tree Corners
      vb.add(x0 + 1.65, y + 0.16, z1 - 1.55, 0x92400e, 1.8, 0.22, 1.45);
      vb.add(x0 + 1.65, y + 0.2, z1 - 1.55, 0xfde68a, 1.52, 0.18, 1.18);
      vb.add(x0 + 1.4, y + 0.36, z1 - 1.4, 0xef4444, 0.22, 0.2, 0.22);
      vb.add(x0 + 4.3, y + 0.36, z1 - 1.15, 0x78350f, 1.15, 0.12, 0.42);
      vb.add(x0 + 4.3, y + 0.62, z1 - 1.32, 0x78350f, 1.15, 0.34, 0.1);
      buildVillageLushTree(vb, x1 - 1.1, y + 0.06, z0 + 1.3, 0.88);
      buildVillageLushTree(vb, x0 + 3.2, y + 0.06, z1 - 1.0, 0.72);
      buildVillageFlowerBed(vb, x0 + 0.35, z1 - 2.6, 2.2, 1.9, y + 0.04);
    }

    function buildEastVillage(vb) {
      // -----------------------------------------------------------------------
      // 1. TILED COBBLESTONE SIDEWALKS & INTERNAL VILLAGE FOOTPATHS
      // -----------------------------------------------------------------------
      buildTiledWalkway(vb, 12.05, -11.0, 1.25, 25.0);  // West sidewalk (Plaza East Ave)
      buildTiledWalkway(vb, 12.05, 12.75, 24.95, 1.25); // South sidewalk (Southern Blvd)
      buildTiledWalkway(vb, 35.75, -21.5, 1.25, 35.5);  // East sidewalk (East Perimeter Ave)
      buildTiledWalkway(vb, 12.05, -11.0, 12.0, 1.15);  // NW corner sidewalk
      buildTiledWalkway(vb, 24.05, -21.5, 1.05, 11.65); // Upper peninsula West sidewalk
      buildTiledWalkway(vb, 24.05, -21.5, 12.95, 1.05); // Upper peninsula North sidewalk

      // Internal cobblestone garden lanes matching the reference map
      buildTiledWalkway(vb, 21.75, -9.85, 1.05, 22.65); // West-Center main vertical lane
      buildTiledWalkway(vb, 13.3, 1.05, 8.5, 0.95);     // Path between Red & Slate houses
      buildTiledWalkway(vb, 22.7, -0.5, 7.4, 0.95);     // Path south of Center Blue house
      buildTiledWalkway(vb, 29.1, -4.6, 0.95, 5.05);    // Upper Center-East vertical lane
      buildTiledWalkway(vb, 29.95, -0.5, 0.95, 13.3);   // Lower Center-East vertical lane (east of playground)
      buildTiledWalkway(vb, 30.0, -4.4, 5.8, 0.9);      // Path between NE & Mid-East houses
      buildTiledWalkway(vb, 30.8, 3.0, 5.0, 0.9);       // Path between Mid-East & SE houses

      // -----------------------------------------------------------------------
      // 2. HEAVILY DETAILED MICRO-VOXEL HOUSES (MATCHING REFERENCE LAYOUT)
      // -----------------------------------------------------------------------
      // Upper Peninsula (North of Sakura & Center Blue House)
      buildDetailedHouse(vb, {
        x: 28.8, z: -18.5, w: 4.1, d: 2.9, h: 2.4,
        wallCol: 0xd6c7b2, flatTerracotta: true
      });
      buildDetailedHouse(vb, {
        x: 29.9, z: -14.6, w: 4.3, d: 3.4, h: 2.35,
        wallCol: 0xebdcca, roofCol: 0x2b4c7e, roofAlt: 0x213b63,
        ridgeLeftRight: false
      });

      // West Column: Iconic Red-Roofed House + Slate-Blue House
      buildDetailedHouse(vb, {
        x: 17.5, z: -2.8, w: 4.5, d: 3.7, h: 2.4,
        wallCol: 0xf0e4d2, roofCol: 0xb91c1c, roofAlt: 0x991b1b,
        ridgeLeftRight: false, hasChimney: true
      });
      buildDetailedHouse(vb, {
        x: 17.5, z: 4.4, w: 4.4, d: 3.6, h: 2.35,
        wallCol: 0xe6dac8, roofCol: 0x283e63, roofAlt: 0x1e2f4d,
        ridgeLeftRight: false
      });

      // Center Column: Broad Navy-Blue Roofed House with Front Gable Dormer
      buildDetailedHouse(vb, {
        x: 25.8, z: -4.6, w: 4.9, d: 3.9, h: 2.45,
        wallCol: 0xefe2cf, roofCol: 0x274472, roofAlt: 0x1d3557,
        ridgeLeftRight: true, hasDormer: true, hasSideDeck: true
      });

      // East Column: Three Stacked Navy/Slate-Roofed Homes
      buildDetailedHouse(vb, {
        x: 33.1, z: -6.8, w: 3.9, d: 3.4, h: 2.35,
        wallCol: 0xebdcca, roofCol: 0x274472, roofAlt: 0x1d3557,
        ridgeLeftRight: true, hasDormer: true, hasChimney: true
      });
      buildDetailedHouse(vb, {
        x: 33.1, z: -0.3, w: 3.9, d: 3.4, h: 2.35,
        wallCol: 0xe8dcc8, roofCol: 0x2b4570, roofAlt: 0x203456,
        ridgeLeftRight: false, hasSideDeck: true
      });
      buildDetailedHouse(vb, {
        x: 33.2, z: 8.0, w: 3.7, d: 3.5, h: 2.35,
        wallCol: 0xefe2cf, roofCol: 0x274472, roofAlt: 0x1d3557,
        ridgeLeftRight: false
      });

      // Far-North-East Homes (North of NE Feeder Road)
      buildSimpleHouse(vb, 28.5, 0.0, -31.5, 4.8, 3.2, 4.4, 0xe2d5c3, 0x475569, false);
      buildSimpleHouse(vb, 37.5, 0.0, -28.0, 4.4, 2.6, 4.0, 0x94a3b8, 0x334155, false);

      // -----------------------------------------------------------------------
      // 3. DETAILED 7-ELEVEN CONVENIENCE STORE & FENCED PLAYGROUND
      // -----------------------------------------------------------------------
      buildDetailedSevenEleven(vb, 17.5, 10.1);
      buildDetailedPlayground(vb, 23.15, 2.45, 6.45, 9.9);

      // Parked Blue Compact Cars along the South Curb (matching reference)
      [19.8, 30.5].forEach(cx => {
        vb.add(cx, 0.38, 14.35, 0x2563eb, 1.85, 0.56, 1.0);
        vb.add(cx - 0.1, 0.78, 14.35, 0x60a5fa, 1.0, 0.36, 0.88);
        vb.add(cx + 0.92, 0.42, 14.35, 0xfff3c4, 0.08, 0.18, 0.76, true);
      });

      // -----------------------------------------------------------------------
      // 4. WHITE PICKET FENCES & VIBRANT FLOWER GARDENS
      // -----------------------------------------------------------------------
      // Full white picket fence yard around Red-Roofed House (with front gate)
      buildPicketFence(vb, 14.3, -5.7, 20.8, -5.7);
      buildPicketFence(vb, 14.3, -5.7, 14.3, 0.45);
      buildPicketFence(vb, 20.8, -5.7, 20.8, 0.45);
      buildPicketFence(vb, 14.3, 0.45, 16.6, 0.45);
      buildPicketFence(vb, 18.4, 0.45, 20.8, 0.45);

      // North garden picket fences & backyard dividers
      buildPicketFence(vb, 14.1, -8.5, 20.1, -8.5);
      buildPicketFence(vb, 23.0, -11.3, 28.4, -11.3);
      buildPicketFence(vb, 28.4, -11.3, 28.4, -7.4);
      buildPicketFence(vb, 25.1, -1.1, 28.5, -1.1);
      buildPicketFence(vb, 30.4, -3.2, 35.1, -3.2);
      buildPicketFence(vb, 14.3, 2.35, 20.8, 2.35);

      // Lush micro-voxel flowerbeds throughout yards & gardens
      buildVillageFlowerBed(vb, 14.6, -8.2, 5.4, 2.2);   // North of Red house
      buildVillageFlowerBed(vb, 14.5, -5.4, 1.0, 5.5);   // West garden of Red house
      buildVillageFlowerBed(vb, 19.8, -5.4, 0.9, 5.5);   // East garden of Red house
      buildVillageFlowerBed(vb, 23.1, -11.0, 5.0, 2.7);  // North of Center Blue house
      buildVillageFlowerBed(vb, 23.2, 0.7, 6.2, 1.5);    // Flower strip north of Playground
      buildVillageFlowerBed(vb, 31.8, -13.0, 3.4, 2.3);  // NE corner flower garden
      buildVillageFlowerBed(vb, 14.3, 2.6, 1.2, 4.2);    // West side of Slate house
      buildVillageFlowerBed(vb, 19.8, 2.6, 1.2, 4.2);    // East side of Slate house
      buildVillageFlowerBed(vb, 31.4, 4.0, 3.6, 1.8);    // North yard of SE house

      // -----------------------------------------------------------------------
      // 5. LUSH MULTI-TONE TREES, ICONIC SAKURA & WARM STREETLAMPS
      // -----------------------------------------------------------------------
      buildSakuraTree(vb, 30.1, 0.06, -10.2, 1.18);
      buildSakuraTree(vb, 42.5, 0.0, -5.5, 1.0);

      [
        [14.5, -7.0, 0.95], [20.3, -7.0, 0.92], [14.5, 4.4, 0.9], [14.5, 7.2, 0.88],
        [20.6, 7.1, 0.82],  [23.1, 1.4, 0.92],  [22.8, 8.0, 0.85], [28.6, -2.1, 0.82],
        [30.9, -4.9, 0.85], [34.4, -3.6, 0.82], [31.5, 5.9, 0.85], [33.8, 5.4, 0.82],
        [31.6, 11.4, 0.85], [34.4, 11.4, 0.85], [26.7, -12.6, 0.88], [33.2, -15.0, 0.9],
        [26.9, -16.2, 0.85], [33.6, -18.7, 0.92]
      ].forEach(([tx, tz, sc]) => {
        buildVillageLushTree(vb, tx, 0.06, tz, sc);
      });

      [[43.0, -14.0], [43.0, -1.0], [43.0, 8.0]].forEach(([tx, tz]) => {
        buildPineTree(vb, tx, 0.0, tz, 0.95);
      });

      [
        [12.65, -9.4], [12.65, -2.8], [12.65, 3.6], [12.65, 11.8],
        [17.5, -10.2], [23.1, -0.2],  [23.9, 13.3], [28.6, 13.3],
        [36.3, 12.6],  [36.3, 2.6],   [36.3, -8.8], [36.3, -15.7],
        [24.6, -20.8], [35.8, -20.8]
      ].forEach(([lx, lz]) => {
        buildStreetLamp(vb, lx, lz, 0.12);
      });
    }

    // =========================================================================
    // 10. RAILWAY, LEVEL CROSSING & ANIMATED COMMUTER TRAIN (z = 19.3)
    // =========================================================================
    function buildRailway(vb) {
      const rz = 19.3;
      // Game version: the line runs from a west buffer stop (x = -44) through the outskirts to an
      // east buffer stop (x = 106); the commuter train shuttles between them.
      const RX0 = -45, RX1 = 107;
      // Gravel ballast bed
      vb.addBox(RX0, 0.0, rz - 1.25, RX1 - RX0, 0.12, 2.5, 0x57534e);
      // 0.22 Micro-Voxel Timber Sleepers & Dual Steel Rails
      for (let x = RX0 + 0.5; x <= RX1 - 0.5; x += 0.85) {
        vb.add(x, 0.14, rz, 0x5c3a21, 0.24, 0.1, 1.85);
      }
      vb.add((RX0 + RX1) * 0.5, 0.22, rz - 0.56, 0x94a3b8, RX1 - RX0, 0.12, 0.14);
      vb.add((RX0 + RX1) * 0.5, 0.22, rz + 0.56, 0x94a3b8, RX1 - RX0, 0.12, 0.14);
      // Red & white striped buffer stops at both ends
      [[RX0 + 0.4, 1], [RX1 - 0.4, -1]].forEach(([bx]) => {
        vb.add(bx, 0.55, rz, 0x7f1d1d, 0.7, 0.9, 2.1);
        vb.add(bx, 0.75, rz, 0xf8fafc, 0.74, 0.22, 2.14);
        vb.add(bx, 1.12, rz - 0.7, 0xef4444, 0.3, 0.3, 0.3, true);
        vb.add(bx, 1.12, rz + 0.7, 0xef4444, 0.3, 0.3, 0.3, true);
      });

      // Twin Red-and-White Crossbuck Level Crossing Signals
      [-3.3, 3.3].forEach((cx, idx) => {
        const cz = idx === 0 ? rz - 1.45 : rz + 1.45;
        vb.add(cx, 1.35, cz, 0x334155, 0.2, 2.7, 0.2);
        vb.add(cx, 2.25, cz, 0xf8fafc, 1.35, 0.22, 0.12);
        vb.add(cx, 2.25, cz, 0xef4444, 0.22, 1.35, 0.14);
        const light = new THREE.Mesh(
          new THREE.BoxGeometry(0.32, 0.32, 0.22),
          new THREE.MeshBasicMaterial({ color: 0xff2244 })
        );
        light.position.set(cx, 1.82, cz + (idx === 0 ? -0.15 : 0.15));
        scene.add(light);
        animatedObjects.crossingLights.push({ mesh: light, phase: idx * Math.PI });
      });

      // Animated Commuter Train Group
      const trainGroup = new THREE.Group();
      const carMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.45 });
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
      const winMat = new THREE.MeshBasicMaterial({ color: 0xffdf7e });
      const roofMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });

      const bodyGeo = new THREE.BoxGeometry(6.6, 1.8, 1.65);
      const roofGeo = new THREE.BoxGeometry(6.4, 0.28, 1.5);
      const stripeGeo = new THREE.BoxGeometry(6.65, 0.24, 1.69);
      const winGeo = new THREE.BoxGeometry(0.75, 0.65, 1.71);
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x050814, transparent: true, opacity: 0.34, depthWrite: false });
      const trainShadow = new THREE.Mesh(new THREE.PlaneGeometry(21.6, 2.1), shadowMat);
      trainShadow.rotation.x = -Math.PI / 2;
      trainShadow.position.set(0, 0.14, 0);
      trainGroup.add(trainShadow);

      for (let c = 0; c < 3; c++) {
        const cx = (c - 1) * 7.2;
        const body = new THREE.Mesh(bodyGeo, carMat);
        body.position.set(cx, 1.25, 0);
        trainGroup.add(body);

        const roof = new THREE.Mesh(roofGeo, roofMat);
        roof.position.set(cx, 2.28, 0);
        trainGroup.add(roof);

        const stripe = new THREE.Mesh(stripeGeo, stripeMat);
        stripe.position.set(cx, 0.85, 0);
        trainGroup.add(stripe);

        for (let w = -2.2; w <= 2.2; w += 1.1) {
          const win = new THREE.Mesh(winGeo, winMat);
          win.position.set(cx + w, 1.48, 0);
          trainGroup.add(win);
        }
      }
      trainGroup.position.set(10, 0.15, rz);
      scene.add(trainGroup);
      animatedObjects.train = trainGroup;
    }

    // =========================================================================
    // 11. HEAVILY DETAILED WEST INDUSTRIAL HARBOR
    // =========================================================================
    function buildHarborCorrugatedContainer(vb, cx, cz, w, h, d, col, alongZ = false, wy = 0.06) {
      vb.add(cx, wy + h * 0.5 + 0.06, cz, col, w, h, d);
      const darkCol = new THREE.Color(col).multiplyScalar(0.76).getHex();
      if (!alongZ) {
        for (let rx = -w * 0.44; rx <= w * 0.44; rx += 0.42) {
          vb.add(cx + rx, wy + h * 0.5 + 0.06, cz + d * 0.5 + 0.03, darkCol, 0.14, h * 0.88, 0.07);
          vb.add(cx + rx, wy + h * 0.5 + 0.06, cz - d * 0.5 - 0.03, darkCol, 0.14, h * 0.88, 0.07);
          vb.add(cx + rx, wy + h + 0.08, cz, darkCol, 0.14, 0.06, d * 0.94);
        }
      } else {
        for (let rz = -d * 0.44; rz <= d * 0.44; rz += 0.42) {
          vb.add(cx - w * 0.5 - 0.03, wy + h * 0.5 + 0.06, cz + rz, darkCol, 0.07, h * 0.88, 0.14);
          vb.add(cx + w * 0.5 + 0.03, wy + h * 0.5 + 0.06, cz + rz, darkCol, 0.07, h * 0.88, 0.14);
          vb.add(cx, wy + h + 0.08, cz + rz, darkCol, w * 0.94, 0.06, 0.14);
        }
      }
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        vb.add(cx + sx * (w * 0.5), wy + h * 0.5 + 0.06, cz + sz * (d * 0.5), 0x334155, 0.16, h + 0.06, 0.16);
      });
    }

    function buildHarborIronRailing(vb, x1, z1, x2, z2, wy = 0.06) {
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const horiz = Math.abs(dx) >= Math.abs(dz);
      vb.add((x1 + x2) * 0.5, wy + 0.68, (z1 + z2) * 0.5, 0x1e293b, horiz ? len : 0.1, 0.1, horiz ? 0.1 : len);
      vb.add((x1 + x2) * 0.5, wy + 0.34, (z1 + z2) * 0.5, 0x334155, horiz ? len : 0.08, 0.08, horiz ? 0.08 : len);
      const posts = Math.max(2, Math.round(len / 0.52));
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        vb.add(x1 + dx * t, wy + 0.38, z1 + dz * t, 0x1e293b, 0.1, 0.68, 0.1);
      }
    }

    function buildWestHarbor(vb) {
      const wy = 0.06;

      // 1. Gridded Industrial Concrete Apron Slabs
      const slabSize = 1.4;
      const slabCols = [0xa8b3c2, 0x9aa6b6, 0xb2bcc9, 0x919dad];
      const nSlabX = Math.round(42.0 / slabSize);
      const nSlabZ = Math.round(10.6 / slabSize);
      const sdx = 42.0 / nSlabX;
      const sdz = 10.6 / nSlabZ;
      for (let ix = 0; ix < nSlabX; ix++) {
        for (let iz = 0; iz < nSlabZ; iz++) {
          const sc = slabCols[(ix * 3 + iz * 7) % slabCols.length];
          vb.add(-45.2 + (ix + 0.5) * sdx, wy + 0.03, 21.0 + (iz + 0.5) * sdz, jitterColor(sc, 0.02), sdx * 0.94, 0.08, sdz * 0.94);
        }
      }

      // North Railway Embankment Retaining Wall, Grass Strip & Safety Railings
      vb.addBox(-45.4, wy, 20.55, 42.2, 0.24, 0.55, 0x4d8b31);
      vb.addBox(-45.2, wy + 0.02, 21.05, 42.0, 0.42, 0.36, 0x78716c);
      for (let rx = -44.2; rx <= -4.0; rx += 1.6) {
        if ((rx > -26.5 && rx < -22.2) || (rx > -18.5 && rx < -8.2)) continue;
        vb.add(rx, wy + 0.68, 21.15, 0x1e293b, 0.1, 0.58, 0.1);
        vb.add(rx + 0.8, wy + 0.92, 21.15, 0x334155, 1.6, 0.09, 0.09);
      }

      // 2. FAR-WEST INDUSTRIAL PROCESSING PLANT (x = -44.2 to -29.0)
      vb.addBox(-44.1, wy, 23.2, 3.8, 3.4, 6.2, 0x263140);
      vb.addBox(-43.8, wy + 3.4, 23.5, 3.2, 0.22, 5.6, 0x334155);
      vb.add(-42.2, wy + 3.56, 23.3, 0x475569, 3.9, 0.34, 0.22);
      vb.add(-42.2, wy + 3.56, 29.3, 0x475569, 3.9, 0.34, 0.22);
      vb.add(-44.0, wy + 3.56, 26.3, 0x475569, 0.22, 0.34, 6.2);
      vb.add(-40.4, wy + 3.56, 26.3, 0x475569, 0.22, 0.34, 6.2);
      vb.add(-42.8, wy + 0.42, 29.46, 0xfbbf24, 0.32, 0.24, 0.12, true);
      vb.add(-41.5, wy + 0.42, 29.46, 0xfbbf24, 0.32, 0.24, 0.12, true);

      // Main North Industrial Boiler Building (behind twin silos)
      vb.addBox(-39.6, wy, 21.8, 10.6, 3.8, 4.1, 0x334155);
      vb.addBox(-39.3, wy + 3.8, 22.1, 10.0, 0.24, 3.5, 0x475569);
      vb.add(-34.3, wy + 3.98, 21.9, 0x64748b, 10.7, 0.36, 0.24);
      vb.add(-34.3, wy + 3.98, 25.8, 0x64748b, 10.7, 0.36, 0.24);
      vb.add(-35.6, wy + 4.85, 22.3, 0x1e293b, 4.6, 0.62, 0.62);
      vb.add(-37.6, wy + 4.35, 22.3, 0x1e293b, 0.65, 1.0, 0.65);
      vb.add(-33.6, wy + 4.35, 22.3, 0x1e293b, 0.65, 1.0, 0.65);
      vb.add(-30.6, wy + 4.28, 23.6, 0x1e293b, 1.35, 0.68, 1.25);

      // Twin Octagonal White-and-Red Industrial Silos (x = -35.6 and -32.4, z = 25.8)
      [-35.6, -32.4].forEach(sx => {
        const sz = 25.8;
        vb.add(sx, wy + 0.22, sz, 0x475569, 2.7, 0.44, 2.7);
        vb.add(sx, wy + 1.15, sz, 0xb91c1c, 2.45, 1.45, 1.72);
        vb.add(sx, wy + 1.15, sz, 0xb91c1c, 1.72, 1.45, 2.45);
        vb.add(sx, wy + 1.15, sz, 0x991b1b, 2.15, 1.45, 2.15);
        vb.add(sx, wy + 2.75, sz, 0xe2e8f0, 2.48, 1.85, 1.74);
        vb.add(sx, wy + 2.75, sz, 0xe2e8f0, 1.74, 1.85, 2.48);
        vb.add(sx, wy + 2.75, sz, 0xcbd5e1, 2.18, 1.85, 2.18);
        vb.add(sx, wy + 3.95, sz, 0xdc2626, 2.46, 0.56, 1.72);
        vb.add(sx, wy + 3.95, sz, 0xdc2626, 1.72, 0.56, 2.46);
        vb.add(sx, wy + 3.95, sz, 0xb91c1c, 2.16, 0.56, 2.16);
        vb.add(sx, wy + 4.46, sz, 0xf1f5f9, 2.05, 0.48, 2.05);
        vb.add(sx, wy + 4.86, sz, 0xe2e8f0, 1.42, 0.36, 1.42);
        vb.add(sx, wy + 5.22, sz, 0x334155, 0.62, 0.46, 0.62);
        vb.add(sx, wy + 5.48, sz, 0x94a3b8, 0.44, 0.14, 0.44);
      });

      // Silver Metallic Overhead Industrial Piping Network with Ribbed Flanges
      vb.add(-39.1, wy + 3.65, 25.1, 0xcbd5e1, 6.8, 0.68, 0.68);
      for (let px = -42.0; px <= -36.4; px += 0.95) {
        vb.add(px, wy + 3.65, 25.1, 0x94a3b8, 0.16, 0.82, 0.82);
      }
      vb.add(-42.3, wy + 3.65, 26.8, 0xcbd5e1, 0.68, 0.68, 4.0);
      for (let pz = 25.4; pz <= 28.4; pz += 0.95) {
        vb.add(-42.3, wy + 3.65, pz, 0x94a3b8, 0.82, 0.82, 0.16);
      }
      vb.add(-42.3, wy + 2.0, 28.65, 0xcbd5e1, 0.68, 3.2, 0.68);
      vb.add(-42.3, wy + 0.5, 28.65, 0x475569, 1.05, 0.85, 1.05);

      vb.add(-35.6, wy + 1.65, 27.85, 0xcbd5e1, 7.6, 0.56, 0.56);
      for (let px = -39.0; px <= -32.2; px += 1.05) {
        vb.add(px, wy + 1.65, 27.85, 0x94a3b8, 0.15, 0.68, 0.68);
      }
      [-39.2, -35.6, -32.0].forEach(rx => {
        vb.add(rx, wy + 0.85, 27.85, 0x94a3b8, 0.52, 1.45, 0.52);
      });
      buildHarborIronRailing(vb, -36.4, 28.75, -32.0, 28.75, wy);
      buildVillageLushTree(vb, -37.8, wy, 29.85, 0.78);

      // 3. CORRUGATED SILVER METAL SHED (x = -28.0, z = 28.1)
      vb.addBox(-30.4, wy, 26.2, 4.8, 2.5, 3.8, 0x94a3b8);
      for (let rx = -30.3; rx <= -25.7; rx += 0.48) {
        vb.add(rx, wy + 2.58, 28.1, 0xcbd5e1, 0.22, 0.18, 4.0);
        vb.add(rx + 0.24, wy + 2.54, 28.1, 0x64748b, 0.22, 0.14, 4.0);
      }
      vb.add(-28.0, wy + 0.95, 30.05, 0x1e293b, 1.25, 1.75, 0.12);
      buildHarborIronRailing(vb, -30.4, 30.45, -25.6, 30.45, wy);
      vb.add(-27.0, wy + 0.42, 30.45, 0xfacc15, 1.8, 0.12, 0.12);

      // 4. WOODEN X-BRACED WATER TOWER (x = -24.4, z = 22.8)
      const wtX = -24.4, wtZ = 22.8;
      [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]].forEach(([ox, oz]) => {
        vb.add(wtX + ox, wy + 2.1, wtZ + oz, 0x5c3a21, 0.32, 4.2, 0.32);
      });
      [1.4, 2.8, 4.1].forEach(bh => {
        vb.add(wtX, wy + bh, wtZ - 1.15, 0x4a2c15, 2.45, 0.2, 0.2);
        vb.add(wtX, wy + bh, wtZ + 1.15, 0x4a2c15, 2.45, 0.2, 0.2);
        vb.add(wtX - 1.15, wy + bh, wtZ, 0x4a2c15, 0.2, 0.2, 2.45);
        vb.add(wtX + 1.15, wy + bh, wtZ, 0x4a2c15, 0.2, 0.2, 2.45);
      });
      for (let s = 0; s < 5; s++) {
        const f = (s + 0.5) / 5;
        const off = (f - 0.5) * 2.0;
        const y1 = wy + 0.3 + f * 3.6;
        const y2 = wy + 3.9 - f * 3.6;
        vb.add(wtX + off, y1, wtZ + 1.15, 0x6b4226, 0.38, 0.38, 0.18);
        vb.add(wtX + off, y2, wtZ + 1.15, 0x6b4226, 0.38, 0.38, 0.18);
        vb.add(wtX + off, y1, wtZ - 1.15, 0x6b4226, 0.38, 0.38, 0.18);
        vb.add(wtX + off, y2, wtZ - 1.15, 0x6b4226, 0.38, 0.38, 0.18);
      }
      vb.add(wtX, wy + 4.32, wtZ, 0x4a2c15, 3.2, 0.26, 3.2);
      vb.add(wtX, wy + 5.45, wtZ, 0x334155, 2.95, 2.05, 2.25);
      vb.add(wtX, wy + 5.45, wtZ, 0x334155, 2.25, 2.05, 2.95);
      vb.add(wtX, wy + 5.45, wtZ, 0x475569, 2.65, 2.05, 2.65);
      vb.add(wtX, wy + 4.95, wtZ, 0x1e293b, 3.04, 0.14, 3.04);
      vb.add(wtX, wy + 5.85, wtZ, 0x1e293b, 3.04, 0.14, 3.04);
      vb.add(wtX, wy + 6.62, wtZ, 0x64748b, 2.45, 0.32, 2.45);

      buildStreetLamp(vb, -26.4, 24.8, wy + 0.04);

      // 5. WAREHOUSE ANNEX + MAIN SKYLIGHT WAREHOUSE (x = -22.7 to -8.2)
      vb.addBox(-22.7, wy, 22.2, 4.4, 3.4, 6.2, 0x3b485b);
      vb.addBox(-22.4, wy + 3.4, 22.5, 3.8, 0.22, 5.6, 0x475569);
      vb.add(-20.5, wy + 3.58, 22.3, 0x64748b, 4.5, 0.34, 0.24);
      vb.add(-20.5, wy + 3.58, 28.3, 0x64748b, 4.5, 0.34, 0.24);
      vb.add(-22.6, wy + 3.58, 25.3, 0x64748b, 0.24, 0.34, 6.2);
      vb.add(-20.5, wy + 3.92, 25.8, 0x94a3b8, 1.55, 0.65, 2.8);
      vb.add(-20.5, wy + 4.02, 23.2, 0x64748b, 1.75, 0.85, 1.35);
      [-21.65, -20.5, -19.35].forEach(wx => {
        vb.add(wx, wy + 2.35, 28.45, 0x1e293b, 0.88, 0.68, 0.1);
        vb.add(wx, wy + 2.35, 28.49, 0xffd166, 0.72, 0.52, 0.08, true);
      });

      const whX = -13.2, whZ = 25.3, whW = 9.8, whD = 7.4, whH = 3.5;
      vb.addBox(whX - whW * 0.5, wy, whZ - whD * 0.5, whW, whH, whD, 0x3b485b);
      const roofSteps = 8;
      for (let s = 0; s < roofSteps; s++) {
        const frac = s / (roofSteps - 1);
        const spanW = (whW + 0.65) * (1.0 - frac * 0.92);
        const ry = wy + whH + 0.16 + s * 0.32;
        vb.add(whX, ry, whZ, s % 2 === 0 ? 0x334155 : 0x2b3748, spanW, 0.34, whD + 0.52);
        if (s < roofSteps - 1) {
          vb.add(whX - spanW * 0.5 + 0.14, ry, whZ + whD * 0.5 + 0.24, 0x1e293b, 0.28, 0.34, 0.22);
          vb.add(whX + spanW * 0.5 - 0.14, ry, whZ + whD * 0.5 + 0.24, 0x1e293b, 0.28, 0.34, 0.22);
        }
      }
      vb.add(whX, wy + whH + 0.16 + roofSteps * 0.32, whZ, 0x1e293b, 0.56, 0.22, whD + 0.6);

      // Dual Rows of 4 Glowing Golden Roof Skylights
      [-2.35, 2.35].forEach(sideX => {
        for (let k = 0; k < 4; k++) {
          const skZ = whZ - 2.35 + k * 1.56;
          vb.add(whX + sideX, wy + whH + 1.55, skZ, 0x1e293b, 1.65, 0.22, 1.24);
          vb.add(whX + sideX, wy + whH + 1.64, skZ, 0xfde047, 1.44, 0.14, 1.04, true);
          vb.add(whX + sideX, wy + whH + 1.70, skZ, 0x92400e, 0.08, 0.06, 1.04);
        }
      });

      const whFrontZ = whZ + whD * 0.5;
      vb.add(whX, wy + 1.15, whFrontZ + 0.06, 0x1e293b, 3.85, 2.3, 0.16);
      for (let gy = 0; gy < 5; gy++) {
        vb.add(whX, wy + 0.24 + gy * 0.42, whFrontZ + 0.12, gy % 2 === 0 ? 0x94a3b8 : 0x7c8b9e, 3.45, 0.34, 0.1);
      }
      [-1.1, 0, 1.1].forEach(tx => {
        vb.add(whX + tx, wy + 2.68, whFrontZ + 0.08, 0xffd166, 0.92, 0.46, 0.09, true);
      });
      [-2.85, 2.85].forEach(lx => {
        vb.add(whX + lx, wy + 2.35, whFrontZ + 0.2, 0x1e293b, 0.34, 0.16, 0.34);
        vb.add(whX + lx, wy + 2.08, whFrontZ + 0.2, 0xffcf56, 0.28, 0.38, 0.28, true);
      });
      vb.add(whX - 3.3, wy + 0.38, whFrontZ + 0.55, 0xb45309, 0.85, 0.72, 0.75);
      vb.add(whX - 2.3, wy + 0.28, whFrontZ + 0.5, 0xd97706, 0.95, 0.52, 0.65);
      vb.add(whX + 3.2, wy + 0.42, whFrontZ + 0.55, 0xd97706, 1.05, 0.82, 0.78);

      // 6. SHIPPING CONTAINERS, YELLOW FORKLIFT, QUAY RAILINGS & PROPS
      buildHarborCorrugatedContainer(vb, -21.2, 29.85, 4.2, 2.0, 2.0, 0xb91c1c, false, wy);
      vb.add(-18.35, wy + 0.48, 29.85, 0xf59e0b, 0.88, 0.92, 0.88);
      buildHarborIronRailing(vb, -24.2, 31.3, -18.8, 31.3, wy);
      buildHarborIronRailing(vb, -33.0, 31.3, -27.2, 31.3, wy);

      buildHarborCorrugatedContainer(vb, -6.85, 25.4, 1.75, 2.05, 3.35, 0xf59e0b, true, wy);
      buildHarborCorrugatedContainer(vb, -5.4, 25.6, 1.15, 1.85, 2.95, 0x0284c7, true, wy);
      buildHarborCorrugatedContainer(vb, -4.25, 25.8, 1.05, 1.7, 2.65, 0x06b6d4, true, wy);

      // Micro-Voxel Yellow Forklift (x = -6.7, z = 29.1)
      const fkX = -6.7, fkZ = 29.1;
      vb.add(fkX, wy + 0.58, fkZ, 0xfacc15, 1.45, 0.78, 1.15);
      vb.add(fkX + 0.48, wy + 0.65, fkZ, 0xeab308, 0.55, 0.65, 1.12);
      [[-0.45, -0.55], [0.45, -0.55], [-0.45, 0.55], [0.45, 0.55]].forEach(([wx, wz]) => {
        vb.add(fkX + wx, wy + 0.26, fkZ + wz, 0x0f172a, 0.42, 0.46, 0.22);
      });
      vb.add(fkX + 0.1, wy + 1.12, fkZ, 0x1e293b, 0.48, 0.36, 0.55);
      [[-0.3, -0.45], [0.45, -0.45], [-0.3, 0.45], [0.45, 0.45]].forEach(([px, pz]) => {
        vb.add(fkX + px, wy + 1.38, fkZ + pz, 0x1e293b, 0.1, 0.88, 0.1);
      });
      vb.add(fkX + 0.08, wy + 1.84, fkZ, 0x1e293b, 0.88, 0.1, 1.02);
      vb.add(fkX - 0.82, wy + 1.25, fkZ - 0.35, 0x334155, 0.16, 2.05, 0.14);
      vb.add(fkX - 0.82, wy + 1.25, fkZ + 0.35, 0x334155, 0.16, 2.05, 0.14);
      vb.add(fkX - 1.38, wy + 0.24, fkZ - 0.3, 0x94a3b8, 1.05, 0.1, 0.16);
      vb.add(fkX - 1.38, wy + 0.24, fkZ + 0.3, 0x94a3b8, 1.05, 0.1, 0.16);

      vb.add(-4.7, wy + 0.65, 30.15, 0xdc2626, 0.92, 1.15, 0.92);
      vb.add(-4.7, wy + 0.58, 30.65, 0xfef08a, 0.55, 0.55, 0.1, true);
      buildHarborIronRailing(vb, -8.4, 31.3, -3.4, 31.3, wy);
      buildVillageLushTree(vb, -3.45, wy, 22.8, 0.82);
    }

    // =========================================================================
    // 12. HEAVILY DETAILED EAST INDUSTRIAL HARBOR & BOX-GIRDER CRANE
    // =========================================================================
    function buildEastHarbor(vb) {
      const wy = 0.06;

      // 1. Gridded Industrial Concrete Apron Slabs
      const slabSize = 1.4;
      const slabCols = [0xa8b3c2, 0x9aa6b6, 0xb2bcc9, 0x919dad];
      const nSlabX = Math.round(42.0 / slabSize);
      const nSlabZ = Math.round(10.6 / slabSize);
      const sdx = 42.0 / nSlabX;
      const sdz = 10.6 / nSlabZ;
      for (let ix = 0; ix < nSlabX; ix++) {
        for (let iz = 0; iz < nSlabZ; iz++) {
          const sxPos = 3.2 + (ix + 0.5) * sdx;
          const szPos = 21.0 + (iz + 0.5) * sdz;
          const isWeathered = sxPos > 29.0 && szPos > 22.0 && szPos < 30.2;
          const baseSlabCol = isWeathered ? 0x7c8a9b : slabCols[(ix * 5 + iz * 3) % slabCols.length];
          vb.add(sxPos, wy + 0.03, szPos, jitterColor(baseSlabCol, 0.025), sdx * 0.94, 0.08, sdz * 0.94);
        }
      }

      // North Railway Grassy Strip, Retaining Edge & NE Lush Grass Corner
      vb.addBox(3.2, wy, 20.55, 42.0, 0.24, 0.58, 0x4d8b31);
      vb.addBox(3.2, wy + 0.02, 21.05, 42.0, 0.36, 0.32, 0x78716c);
      vb.addBox(40.2, wy + 0.03, 21.1, 4.4, 0.14, 4.1, 0x4d8b31);

      // Perimeter Dark Iron Safety Railings
      buildHarborIronRailing(vb, 4.15, 22.6, 4.15, 31.3, wy);
      buildHarborIronRailing(vb, 44.55, 22.0, 44.55, 31.3, wy);
      buildHarborIronRailing(vb, 4.15, 31.3, 10.6, 31.3, wy);
      buildHarborIronRailing(vb, 22.4, 31.3, 32.0, 31.3, wy);
      buildHarborIronRailing(vb, 28.0, 30.4, 32.0, 30.4, wy);
      buildHarborIronRailing(vb, 34.6, 31.3, 39.2, 31.3, wy);

      // NW & NE Corner Lush Trees
      buildVillageLushTree(vb, 3.65, wy + 0.04, 21.85, 0.72);
      buildVillageLushTree(vb, 42.45, wy + 0.1, 22.95, 0.92);

      // 2. LEFT OPEN-FRONT CARGO SHED & STACKED CRATES (x = 5.4 to 9.6, z = 21.6..25.0)
      vb.addBox(5.5, wy, 21.7, 4.1, 2.55, 3.3, 0x3b485b);
      vb.addBox(5.7, wy + 2.55, 21.9, 3.7, 0.18, 2.9, 0x475569);
      vb.add(7.55, wy + 2.7, 21.8, 0x64748b, 4.2, 0.32, 0.22);
      vb.add(7.55, wy + 2.7, 24.9, 0x64748b, 4.2, 0.32, 0.22);
      vb.add(5.6, wy + 2.7, 23.35, 0x64748b, 0.22, 0.32, 3.3);
      vb.add(9.5, wy + 2.7, 23.35, 0x64748b, 0.22, 0.32, 3.3);
      vb.add(7.55, wy + 1.05, 25.02, 0x1e293b, 3.35, 1.9, 0.16);
      vb.add(6.45, wy + 0.55, 25.12, 0xd97706, 0.75, 0.95, 0.65);
      vb.add(8.05, wy + 0.48, 25.65, 0xf59e0b, 0.92, 0.88, 0.88);
      vb.add(9.05, wy + 0.52, 25.6, 0xd97706, 0.95, 0.96, 0.88);
      vb.add(9.05, wy + 1.32, 25.6, 0xfbbf24, 0.72, 0.66, 0.72);
      vb.add(9.85, wy + 0.42, 25.75, 0xb45309, 0.68, 0.76, 0.68);
      vb.add(8.5, wy + 0.45, 28.4, 0xdc2626, 1.15, 0.82, 0.95);
      vb.add(8.65, wy + 1.15, 28.25, 0xef4444, 0.82, 0.62, 0.78);
      vb.add(5.55, wy + 0.95, 29.8, 0xef4444, 0.24, 1.65, 0.24);
      vb.add(5.55, wy + 1.25, 29.8, 0xffffff, 0.26, 0.42, 0.26);
      buildStreetLamp(vb, 3.65, 23.85, wy + 0.04);
      buildStreetLamp(vb, 5.95, 30.1, wy + 0.04);
      buildStreetLamp(vb, 10.75, 30.1, wy + 0.04);

      // 3. MAIN TWIN-BAY EAST WAREHOUSE WITH DUAL ROOF MONITORS (x = 10.4 to 20.8)
      const ewX = 15.6, ewZ = 25.1, ewW = 10.4, ewD = 6.9, ewH = 3.65;
      vb.addBox(ewX - ewW * 0.5, wy, ewZ - ewD * 0.5, ewW, ewH, ewD, 0x6b7280);
      vb.addBox(ewX - ewW * 0.5 - 0.25, wy + ewH, ewZ - ewD * 0.5 - 0.25, ewW + 0.5, 0.48, ewD + 0.5, 0x2b3748);
      vb.addBox(ewX - ewW * 0.5 + 0.1, wy + ewH + 0.48, ewZ - ewD * 0.5 + 0.1, ewW - 0.2, 0.22, ewD - 0.2, 0x3b485b);
      for (let rx = ewX - 4.2; rx <= ewX + 4.2; rx += 1.4) {
        vb.add(rx, wy + ewH + 0.71, ewZ, 0x334155, 0.1, 0.05, ewD - 0.4);
      }

      // Twin Prominent Raised Rooftop Monitor / Ridge Vents
      [-2.05, 2.05].forEach(mx => {
        const rx = ewX + mx;
        const rz = ewZ - 0.45;
        vb.add(rx, wy + ewH + 0.95, rz, 0x263140, 1.75, 0.55, 4.35);
        vb.add(rx, wy + ewH + 1.38, rz, 0x334155, 1.25, 0.42, 4.25);
        vb.add(rx, wy + ewH + 1.72, rz, 0x475569, 0.68, 0.28, 4.15);
        vb.add(rx, wy + ewH + 1.02, rz + 2.18, 0x0f172a, 0.95, 0.46, 0.12);
        vb.add(rx, wy + ewH + 1.02, rz + 2.24, 0x94a3b8, 0.58, 0.22, 0.08);
      });

      const ewFrontZ = ewZ + ewD * 0.5;
      [-2.15, 2.15].forEach(bx => {
        vb.add(ewX + bx, wy + 1.05, ewFrontZ + 0.05, 0x1e293b, 3.25, 2.05, 0.14);
        for (let gy = 0; gy < 5; gy++) {
          vb.add(ewX + bx, wy + 0.22 + gy * 0.38, ewFrontZ + 0.11, gy % 2 === 0 ? 0x94a3b8 : 0x7c8b9e, 2.92, 0.3, 0.09);
        }
        for (let p = 0; p < 4; p++) {
          const px = ewX + bx - 1.12 + p * 0.75;
          vb.add(px, wy + 2.52, ewFrontZ + 0.07, 0x1e293b, 0.68, 0.54, 0.09);
          vb.add(px, wy + 2.52, ewFrontZ + 0.11, 0xffd166, 0.56, 0.42, 0.08, true);
        }
      });

      [-4.45, 0.0, 4.45].forEach(lx => {
        vb.add(ewX + lx, wy + 2.22, ewFrontZ + 0.18, 0x1e293b, 0.32, 0.16, 0.32);
        vb.add(ewX + lx, wy + 1.96, ewFrontZ + 0.18, 0xffcf56, 0.26, 0.36, 0.26, true);
      });
      vb.add(ewX - 4.3, wy + 0.36, ewFrontZ + 0.52, 0xb45309, 1.05, 0.68, 0.72);
      vb.add(ewX + 0.55, wy + 0.38, ewFrontZ + 0.42, 0xd97706, 0.68, 0.72, 0.62);
      vb.add(ewX + 4.45, wy + 0.42, ewFrontZ + 0.45, 0xd97706, 0.76, 0.82, 0.68);

      // 4. MICRO-VOXEL YELLOW FORKLIFT CARRYING A WOODEN CARGO PALLET (x = 18.0, z = 29.5)
      const efX = 17.95, efZ = 29.55;
      vb.add(efX, wy + 0.56, efZ, 0xfacc15, 1.48, 0.76, 1.15);
      vb.add(efX - 0.48, wy + 0.64, efZ, 0xeab308, 0.56, 0.64, 1.12);
      [[-0.45, -0.55], [0.45, -0.55], [-0.45, 0.55], [0.45, 0.55]].forEach(([wx, wz]) => {
        vb.add(efX + wx, wy + 0.26, efZ + wz, 0x0f172a, 0.42, 0.46, 0.22);
      });
      vb.add(efX - 0.08, wy + 1.12, efZ, 0x1e293b, 0.48, 0.36, 0.55);
      [[-0.42, -0.45], [0.32, -0.45], [-0.42, 0.45], [0.32, 0.45]].forEach(([px, pz]) => {
        vb.add(efX + px, wy + 1.38, efZ + pz, 0x1e293b, 0.1, 0.88, 0.1);
      });
      vb.add(efX - 0.05, wy + 1.84, efZ, 0x1e293b, 0.86, 0.1, 1.02);
      vb.add(efX + 0.82, wy + 1.25, efZ - 0.34, 0x334155, 0.16, 2.05, 0.14);
      vb.add(efX + 0.82, wy + 1.25, efZ + 0.34, 0x334155, 0.16, 2.05, 0.14);
      vb.add(efX + 1.42, wy + 0.24, efZ - 0.28, 0x94a3b8, 1.12, 0.1, 0.16);
      vb.add(efX + 1.42, wy + 0.24, efZ + 0.28, 0x94a3b8, 1.12, 0.1, 0.16);
      vb.add(efX + 1.65, wy + 0.82, efZ, 0x92400e, 1.15, 1.02, 1.18);
      vb.add(efX + 1.65, wy + 1.42, efZ, 0xb45309, 0.96, 0.28, 0.98);
      buildStreetLamp(vb, 21.75, 27.55, wy + 0.04);

      // 5. CENTRAL CONTAINER YARD (Red, Blue & Bright Yellow Corrugated Containers)
      buildHarborCorrugatedContainer(vb, 24.95, 23.35, 4.7, 2.1, 2.2, 0xdc2626, false, wy);
      vb.add(23.1, wy + 0.55, 25.15, 0xb91c1c, 1.05, 1.05, 1.05);
      buildHarborCorrugatedContainer(vb, 25.95, 25.85, 4.3, 2.05, 2.15, 0x0284c7, false, wy);
      vb.add(28.75, wy + 0.65, 25.45, 0xf59e0b, 1.05, 1.25, 1.05);
      buildHarborCorrugatedContainer(vb, 24.95, 28.95, 4.35, 2.05, 2.15, 0xfacc15, false, wy);
      buildStreetLamp(vb, 29.25, 27.35, wy + 0.04);
      buildStreetLamp(vb, 27.25, 30.25, wy + 0.04);

      // 6. HEAVY YELLOW INDUSTRIAL HARBOR CRANE LIFTING A RED CONTAINER (x = 31.3..37.8)
      const crX = 31.35, crZ = 27.75;
      vb.add(crX, wy + 0.32, crZ, 0x334155, 2.85, 0.58, 2.65);
      vb.add(crX - 1.15, wy + 0.18, crZ + 1.05, 0x1e293b, 0.65, 0.34, 0.85);
      vb.add(crX + 1.15, wy + 0.18, crZ + 1.05, 0x1e293b, 0.65, 0.34, 0.85);
      vb.add(crX, wy + 0.88, crZ, 0x475569, 2.25, 0.56, 2.05);
      vb.add(crX, wy + 1.38, crZ, 0xeab308, 1.85, 0.52, 1.85);
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const my = wy + 1.85 + t * 5.2;
        const mz = crZ - 0.15 - t * 3.15;
        vb.add(crX, my, mz, i % 2 === 0 ? 0xfacc15 : 0xeab308, 1.45, 0.72, 1.35);
        vb.add(crX + 0.68, my, mz, 0x334155, 0.24, 0.72, 0.42);
      }
      const topX = crX, topY = wy + 7.25, topZ = 24.35;
      vb.add(topX, topY, topZ, 0xfacc15, 2.35, 1.65, 2.35);
      vb.add(topX, topY + 0.85, topZ, 0x1e293b, 1.95, 0.22, 1.95);
      vb.add(topX - 0.2, topY + 0.1, topZ - 1.25, 0x334155, 1.9, 1.25, 0.55);
      vb.add(topX + 1.22, topY + 0.15, topZ + 0.25, 0x38bdf8, 0.12, 0.78, 0.95, true);

      const boomSteps = 12;
      for (let i = 0; i < boomSteps; i++) {
        const t = i / (boomSteps - 1);
        const bx = topX + 0.55 + t * 4.55;
        const by = topY + 0.25 + t * 1.15;
        const bz = topZ + 0.45 + t * 4.05;
        vb.add(bx, by, bz, i % 2 === 0 ? 0xfacc15 : 0xeab308, 1.25, 1.05, 1.25);
        vb.add(bx, by + 0.58, bz, 0x1e293b, 0.65, 0.22, 0.75);
      }
      const tipX = topX + 5.1, tipY = topY + 1.35, tipZ = topZ + 4.5;
      vb.add(tipX, tipY - 0.45, tipZ, 0x1e293b, 1.15, 0.75, 1.15);
      vb.add(tipX - 0.4, tipY - 0.85, tipZ, 0xfff3c4, 0.42, 0.28, 0.42, true);
      vb.add(tipX, tipY - 2.35, tipZ, 0x334155, 0.18, 3.25, 0.18);
      vb.add(tipX, tipY - 3.95, tipZ, 0x1e293b, 0.78, 0.42, 0.65);
      [[-0.85, -0.45], [0.85, -0.45], [-0.85, 0.45], [0.85, 0.45]].forEach(([sx, sz]) => {
        for (let k = 1; k <= 4; k++) {
          const f = k / 4;
          vb.add(tipX + sx * f, tipY - 4.15 - f * 1.35, tipZ + sz * f, 0x1e293b, 0.12, 0.36, 0.12);
        }
      });
      buildHarborCorrugatedContainer(vb, tipX + 0.15, tipZ + 0.05, 4.35, 2.05, 2.15, 0xdc2626, false, wy);

      // 7. FAR-EAST CONTAINERS, FLOODLIGHT POLE & SE STREETLAMP
      buildHarborCorrugatedContainer(vb, 41.95, 27.65, 4.15, 2.05, 2.15, 0xdc2626, false, wy);
      buildHarborCorrugatedContainer(vb, 41.95, 29.85, 4.15, 2.05, 2.15, 0x0284c7, false, wy);
      vb.add(39.45, wy + 0.45, 29.85, 0xf59e0b, 0.75, 0.85, 0.75);
      vb.add(39.65, wy + 2.45, 23.15, 0x1e293b, 0.26, 4.9, 0.26);
      vb.add(39.65, wy + 4.95, 23.35, 0x334155, 0.95, 0.36, 0.45);
      vb.add(39.65, wy + 4.82, 23.58, 0xfef08a, 0.78, 0.2, 0.14, true);
      buildStreetLamp(vb, 38.95, 30.2, wy + 0.04);
    }

    // =========================================================================
    // 13. CENTRAL PIER, BOBBING TUGBOATS & 360-DEGREE SEAMLESS OCEAN
    // =========================================================================
    function buildTugboat(x, z, facingRight = true) {
      const group = new THREE.Group();
      const dir = facingRight ? 1 : -1;

      const hullMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
      const redMat = new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.65 });
      const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6 });
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });

      // Lower red waterline & dark-slate hull
      const lower = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.55, 3.0), redMat);
      lower.position.y = 0.05;
      group.add(lower);

      const hull = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.82, 3.2), hullMat);
      hull.position.y = 0.65;
      group.add(hull);

      // Tire fenders along hull sides
      for (let fx = -2.6; fx <= 2.6; fx += 1.3) {
        [-1.65, 1.65].forEach(fz => {
          const fender = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.16), darkMat);
          fender.position.set(fx, 0.62, fz);
          group.add(fender);
        });
      }

      // White cabin & wheelhouse
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.35, 2.2), whiteMat);
      cabin.position.set(-0.6 * dir, 1.68, 0);
      group.add(cabin);

      const bridge = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.05, 1.85), whiteMat);
      bridge.position.set(-0.2 * dir, 2.75, 0);
      group.add(bridge);

      // Glowing cabin windows & masthead lantern
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.48, 1.92), glowMat);
      win.position.set(-0.2 * dir, 2.82, 0);
      group.add(win);

      const cabinWin = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.42, 2.26), glowMat);
      cabinWin.position.set(-0.6 * dir, 1.72, 0);
      group.add(cabinWin);

      // Funnel & mast
      const funnel = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.3, 0.65), redMat);
      funnel.position.set(-1.6 * dir, 2.85, 0);
      group.add(funnel);

      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 0.16), darkMat);
      mast.position.set(-0.1 * dir, 4.1, 0);
      group.add(mast);

      const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), glowMat);
      beacon.position.set(-0.1 * dir, 5.05, 0);
      group.add(beacon);

      group.position.set(x, -0.1, z);
      scene.add(group);
      animatedObjects.tugboats.push({ mesh: group, baseY: -0.1, phase: facingRight ? 0 : 2.1 });
    }


    function buildPierAndHarborWater(vb) {
      // Tree-Lined Central Pier Extending South into the Harbor (z: 32.5..44.5)
      vb.addBox(-5.2, -2.2, 32.5, 10.4, 2.3, 12.0, 0x7c8694);
      // Pier stone curbs, lush trees & warm streetlamps
      [-3.8, 3.8].forEach(px => {
        vb.add(px, 0.18, 38.5, 0x3f7d3a, 2.3, 0.16, 11.4);
        [34.2, 37.6, 41.0].forEach(tz => buildLushTree(vb, px, 0.25, tz, 0.72));
      });
      [[-3.2, 24], [3.2, 24], [-3.2, 29], [3.2, 29], [-2.8, 35.5], [2.8, 35.5], [-2.8, 42.5], [2.8, 42.5]].forEach(([lx, lz]) => {
        buildStreetLamp(vb, lx, lz, 0.1);
      });

      // Full 360-Degree Ocean Water Plane Spanning Both Islands & Mountains
      // Ocean only west of the quay (the rest of the world is land in the game)
      const waterGeo = new THREE.PlaneGeometry(300, 140, 96, 48);
      waterGeo.rotateX(-Math.PI / 2);
      harborWaterMesh = new THREE.Mesh(waterGeo, createHarborWaterMaterial());
      harborWaterMesh.position.set(44, -0.55, 102);
      scene.add(harborWaterMesh);

      // Harbor Tugboats
      buildTugboat(-25.0, 38.2, true);
      buildTugboat(26.0, 38.2, false);
    }


    // =========================================================================
    // 14. BORDER TREELINE & AURORA BOREALIS CURTAINS (GAME VERSION)
    //     The diorama's mountains / sky dome / cloud dome are dropped: the game owns the sky and
    //     Kopenhime Snowpeak already sits north of Aurora. The curtains now hang over the western sea.
    // =========================================================================
    function buildNorthernTreelineAndAurora(vb) {
      // Pine treeline along the Kuroba border (diorama north edge) with road gateways left open
      for (let x = -43; x <= 132; x += 3.6) {
        if (Math.abs(x) < 3.5) continue; // City Hall spine gateway (main highway)
        if (x > 60.5 && x < 71) continue; // Outskirts avenue gateway (south beltway)
        buildPineTree(vb, x + (rand() - 0.5) * 1.2, 0.05, -40.5 - rand() * 2.5, 0.95 + rand() * 0.45);
      }

      auroraGroup = new THREE.Group();
      for (let c = 0; c < 3; c++) {
        const geo = new THREE.PlaneGeometry(140, 38, 48, 8);
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            uTime:    { value: 0 },
            uOpacity: { value: 0.0 },
            uColA:    { value: new THREE.Color(c === 1 ? 0x38bdf8 : 0x34d399) },
            uColB:    { value: new THREE.Color(0xc084fc) }
          },
          vertexShader: `
            uniform float uTime;
            varying vec2 vUv;
            void main() {
              vUv = uv;
              vec3 p = position;
              p.z += sin(p.x * 0.06 + uTime * 0.55) * 8.0 + cos(p.x * 0.11 - uTime * 0.35) * 4.0;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
            }
          `,
          fragmentShader: `
            uniform float uTime;
            uniform float uOpacity;
            uniform vec3 uColA;
            uniform vec3 uColB;
            varying vec2 vUv;
            void main() {
              float wave = sin(vUv.x * 16.0 + uTime * 0.9) * 0.5 + 0.5;
              float rays = pow(sin(vUv.x * 46.0 - uTime * 1.4) * 0.5 + 0.5, 2.0);
              float vFade = smoothstep(0.0, 0.32, vUv.y) * smoothstep(1.0, 0.25, vUv.y);
              float hFade = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
              vec3 col = mix(uColA, uColB, vUv.y * 0.75 + wave * 0.25);
              float alpha = (0.35 + 0.65 * rays) * vFade * hFade * uOpacity;
              gl_FragColor = vec4(col, alpha);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          depthWrite: false,
          fog: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(44 + (c - 1) * 34, 38 + c * 4, 92 + c * 10);
        mesh.rotation.y = (c - 1) * 0.12;
        mesh.frustumCulled = false;
        mesh.visible = false;
        auroraGroup.add(mesh);
        animatedObjects.auroraCurtains.push(mesh);
        disposables.push(geo, mat);
      }
      scene.add(auroraGroup);
    }

    // =========================================================================
    // 15. ANIMATED MICRO-VOXEL ROAD TRAFFIC
    // =========================================================================
    function buildTraffic() {
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
      const headMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 });
      const tailMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      const truckCabMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
      const shadowMat = new THREE.MeshBasicMaterial({ color: 0x050814, transparent: true, opacity: 0.32, depthWrite: false });
      const carBodyGeo = new THREE.BoxGeometry(1.15, 0.55, 2.1);
      const truckBodyGeo = new THREE.BoxGeometry(1.15, 0.55, 3.2);
      const carCabGeo = new THREE.BoxGeometry(1.05, 0.48, 1.05);
      const truckCabGeo = new THREE.BoxGeometry(1.05, 0.95, 1.9);
      const lightGeo = new THREE.BoxGeometry(0.95, 0.18, 0.08);
      const wheelGeo = new THREE.BoxGeometry(0.18, 0.36, 0.36);

      function createCar(color, isTruck = false) {
        const g = new THREE.Group();
        const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
        const len = isTruck ? 3.2 : 2.1;
        g.userData.halfLen = len * 0.5;

        const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.45, len + 0.35), shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.04;
        g.add(shadow);

        const body = new THREE.Mesh(isTruck ? truckBodyGeo : carBodyGeo, bodyMat);
        body.position.y = 0.42;
        g.add(body);

        const cab = new THREE.Mesh(isTruck ? truckCabGeo : carCabGeo, isTruck ? truckCabMat : bodyMat);
        cab.position.set(0, isTruck ? 1.05 : 0.86, isTruck ? -0.45 : -0.1);
        g.add(cab);

        const hl = new THREE.Mesh(lightGeo, headMat);
        hl.position.set(0, 0.44, len * 0.5 + 0.03);
        g.add(hl);

        const tl = new THREE.Mesh(lightGeo, tailMat);
        tl.position.set(0, 0.44, -len * 0.5 - 0.03);
        g.add(tl);

        [[-0.56, len * 0.3], [0.56, len * 0.3], [-0.56, -len * 0.3], [0.56, -len * 0.3]].forEach(([wx, wz]) => {
          const w = new THREE.Mesh(wheelGeo, darkMat);
          w.position.set(wx, 0.22, wz);
          g.add(w);
        });

        scene.add(g);
        return g;
      }

      // Game version: cars ping-pong (U-turn into the opposite lane) instead of teleporting,
      // and yield to the player (see updateTraffic).
      const routes = [
        { car: createCar(0xf8fafc, true),  axis: 'z', center: 0,     lane: 1.05, min: 22,  max: 42,  speed: 4.2, dir: 1 },
        { car: createCar(0xf97316, false), axis: 'z', center: 10,    lane: 0.9,  min: -12, max: 13,  speed: 5.5, dir: 1 },
        { car: createCar(0xe2e8f0, false), axis: 'z', center: -10,   lane: -0.9, min: -12, max: 13,  speed: 5.0, dir: -1 },
        { car: createCar(0x38bdf8, false), axis: 'x', center: 16,    lane: 0.9,  min: -40, max: 104, speed: 6.2, dir: 1 },
        { car: createCar(0xfacc15, false), axis: 'x', center: 16,    lane: -0.9, min: -40, max: 104, speed: 5.8, dir: -1 },
        { car: createCar(0xef4444, false), axis: 'x', center: -13,   lane: -0.8, min: -22, max: 22,  speed: 5.2, dir: 1 },
        { car: createCar(0x22c55e, false), axis: 'z', center: 65.76, lane: 0.9,  min: -40, max: 28,  speed: 5.4, dir: 1 },
        { car: createCar(0xa78bfa, false), axis: 'x', center: -23.25, lane: 0.8, min: 46,  max: 104, speed: 4.8, dir: -1 }
      ];
      routes.forEach((r, idx) => {
        r.pos = r.min + ((idx * 17) % Math.max(1, r.max - r.min));
        animatedObjects.cars.push(r);
      });
    }


    // =========================================================================
    // 18. GAME ADDITIONS: KUROBA GATEWAY ROAD & AURORA OUTSKIRTS (x = 46..134)
    //     Fills the rest of the game's western quadrant in the same micro-voxel style.
    // =========================================================================
    const ROAD_COL = 0x262b36;
    function road(vb, x0, z0, w, d) {
      vb.addBox(x0, 0.0, z0, w, 0.08, d, ROAD_COL);
    }
    function dashesX(vb, x0, x1, z) {
      for (let x = x0; x < x1 - 1.0; x += 2.6) vb.add(x + 0.65, 0.09, z, 0xfacc15, 1.3, 0.04, 0.22);
    }
    function dashesZ(vb, x, z0, z1) {
      for (let z = z0; z < z1 - 1.0; z += 2.6) vb.add(x, 0.09, z + 0.65, 0xfacc15, 0.22, 0.04, 1.3);
    }

    const OUT_X0 = 46, OUT_X1 = 134, OUT_Z0 = -43.5, OUT_Z1 = 32.5;
    const AVE_A = 65.76; // N-S avenue (continues the game's south beltway)

    function buildGatewayAndOutskirts(vb) {
      // --- Gateway: City Hall spine reaches the Kuroba border (main highway joins here) ---
      road(vb, -2.5, -43.5, 5.0, 6.6);
      dashesZ(vb, 0, -43.5, -37);
      buildPlazaBanner(vb, -4.2, -41.2);
      buildPlazaBanner(vb, 4.2, -41.2);

      // --- Outskirts grass foundation + tonal patches ---
      vb.addBox(OUT_X0, -2.0, OUT_Z0, OUT_X1 - OUT_X0, 2.0, OUT_Z1 - OUT_Z0, 0x3f7d3a);
      for (let x = OUT_X0 + 1; x < OUT_X1 - 3; x += 4) {
        for (let z = OUT_Z0 + 1; z < OUT_Z1 - 3; z += 4) {
          if (rand() > 0.55) vb.add(x + 2, 0.01, z + 2, jitterColor(0x478c3e, 0.05), 3.9, 0.04, 3.9);
        }
      }
      // Rocky western sea shore along the outskirts
      const rockCols = [0x64748b, 0x57534e, 0x475569, 0x78716c];
      for (let x = OUT_X0; x <= OUT_X1; x += 2.0) {
        const col = rockCols[Math.floor(rand() * rockCols.length)];
        vb.add(x, -0.65 + rand() * 0.5, 33.4 + rand() * 0.8, jitterColor(col, 0.05), 2.3, 2.2, 2.2);
        if (rand() > 0.5) vb.add(x + 0.6, -0.9 + rand() * 0.3, 35.0 + rand() * 0.6, jitterColor(0x475569, 0.06), 1.6, 1.1, 1.6);
      }

      // --- Road network ---
      // Southern Boulevard continues east through the outskirts (z = 14..18)
      road(vb, 41, 14, OUT_X1 - 41, 4.0);
      dashesX(vb, 41, OUT_X1, 16);
      // Village Lane continues the East-side spur (z = -25..-21.5)
      road(vb, 41, -25, OUT_X1 - 41, 3.5);
      dashesX(vb, 41, OUT_X1, -23.25);
      // Avenue A: Kuroba border -> coast (continues the game's south beltway)
      road(vb, AVE_A - 2, OUT_Z0, 4.0, 30.5 - OUT_Z0);
      dashesZ(vb, AVE_A, OUT_Z0, 30.5);
      [[AVE_A, -20.5, true], [AVE_A, -26.0, true], [AVE_A, 13.5, true], [AVE_A, 18.6, true]].forEach(([cx, cz]) => {
        for (let i = -3; i <= 3; i++) vb.add(cx + i * 0.5, 0.095, cz, 0xf8fafc, 0.26, 0.04, 1.35);
      });
      // Coastal lookout at the end of Avenue A
      vb.addBox(AVE_A - 3.5, 0.0, 28.5, 7.0, 0.14, 4.2, 0x9ca3af);
      buildHarborIronRailing(vb, AVE_A - 3.4, 32.5, AVE_A + 3.4, 32.5, 0.14);
      buildStreetLamp(vb, AVE_A - 3.0, 29.2, 0.14);
      buildStreetLamp(vb, AVE_A + 3.0, 29.2, 0.14);

      // Sidewalk tiles along the residential streets
      buildTiledWalkway(vb, 46, -21.4, OUT_X1 - 46, 0.9);
      buildTiledWalkway(vb, 46, 13.0, OUT_X1 - 46, 0.9);

      // --- Row 1: houses north of Village Lane, facing the lane ---
      const roofSets = [
        [0x274472, 0x1d3557], [0xb91c1c, 0x991b1b], [0x2b4c7e, 0x213b63], [0x166534, 0x14532d],
        [0x475569, 0x334155], [0x9a3412, 0x7c2d12], [0x283e63, 0x1e2f4d], [0x7e22ce, 0x6b21a8]
      ];
      const walls = [0xefe2cf, 0xe8dcc8, 0xf0e4d2, 0xd6c7b2, 0xebdcca, 0xe6dac8];
      const row1 = [50, 56, 73, 79, 85, 91, 97, 103, 109, 115, 121, 127];
      row1.forEach((hx, i) => {
        const [rc, ra] = roofSets[i % roofSets.length];
        buildDetailedHouse(vb, {
          x: hx, z: -28.9, w: 4.4, d: 3.6, h: 2.35 + (i % 3) * 0.05,
          wallCol: walls[i % walls.length], roofCol: rc, roofAlt: ra,
          ridgeLeftRight: i % 3 === 1, hasDormer: i % 3 === 1, hasChimney: i % 4 === 0,
          hasSideDeck: i % 5 === 2, flatTerracotta: i % 7 === 3
        });
        buildVillageFlowerBed(vb, hx - 2.6, -26.4, 1.0, 1.0);
        buildPicketFence(vb, hx - 2.9, -25.6, hx - 0.8, -25.6);
        buildPicketFence(vb, hx + 0.8, -25.6, hx + 2.9, -25.6);
        if (i % 2 === 0) buildVillageLushTree(vb, hx + 2.95, 0.06, -32.6, 0.85);
      });

      // --- Row 2: houses north of the Boulevard, facing it (7-Eleven on the Avenue corner) ---
      buildDetailedSevenEleven(vb, 72.6, 10.0);
      const row2 = [50, 56, 80, 86, 92, 98, 104, 110, 116, 122, 128];
      row2.forEach((hx, i) => {
        const [rc, ra] = roofSets[(i + 3) % roofSets.length];
        buildDetailedHouse(vb, {
          x: hx, z: 10.3, w: 4.3, d: 3.5, h: 2.35,
          wallCol: walls[(i + 2) % walls.length], roofCol: rc, roofAlt: ra,
          ridgeLeftRight: i % 2 === 0, hasDormer: i % 4 === 0, hasChimney: i % 3 === 1
        });
        buildVillageFlowerBed(vb, hx + 1.4, 12.25, 1.2, 0.6);
        if (i % 2 === 1) buildVillageLushTree(vb, hx - 2.95, 0.06, 6.8, 0.8);
      });

      // --- Middle district: sakura park, playground & rice paddies ---
      buildDetailedPlayground(vb, 48.6, -10.6, 6.45, 9.9);
      [[58.5, -12.5, 1.15], [60.2, -4.0, 1.05], [72.5, -9.0, 1.2], [78.5, -2.0, 1.0], [84.5, -14.5, 1.1], [57.5, 3.2, 0.95]]
        .forEach(([sx, sz, sc]) => buildSakuraTree(vb, sx, 0.06, sz, sc));
      buildTiledWalkway(vb, 56.5, -19.5, 1.0, 25.0);
      buildTiledWalkway(vb, 68.6, -6.6, 20.0, 1.0);
      buildFlowerBed(vb, 70.0, -16.5, 4.0, 2.2);
      buildFlowerBed(vb, 76.0, 2.0, 5.0, 2.0);
      // Park benches
      [[62.0, -9.0], [75.5, -4.5], [81.5, -9.5]].forEach(([bx, bz]) => {
        vb.add(bx, 0.36, bz, 0x78350f, 1.15, 0.12, 0.42);
        vb.add(bx, 0.62, bz - 0.17, 0x78350f, 1.15, 0.34, 0.1);
      });
      // Rice paddies (flooded / young / golden) with raised earth bunds
      const paddyCols = [0x6aa5b5, 0x7fb64a, 0x93c35a, 0xd9c26a];
      for (let px = 90; px < OUT_X1 - 4; px += 7.0) {
        for (let pz = -18.5; pz < 6.0; pz += 6.0) {
          const pc = paddyCols[Math.floor(rand() * paddyCols.length)];
          vb.addBox(px, 0.0, pz, 6.4, 0.08, 5.4, jitterColor(pc, 0.04));
          vb.addBox(px - 0.3, 0.0, pz - 0.3, 7.0, 0.14, 0.3, 0x7c5c3b);
          vb.addBox(px - 0.3, 0.0, pz - 0.3, 0.3, 0.14, 6.0, 0x7c5c3b);
          if (pc !== 0x6aa5b5) {
            for (let rx = px + 0.5; rx < px + 6.2; rx += 0.9) {
              vb.add(rx, 0.18, pz + 2.7, jitterColor(pc, 0.08), 0.18, 0.22, 5.0);
            }
          }
        }
      }
      // Farmhouse & barn overlooking the paddies
      buildSimpleHouse(vb, 120.0, 0.0, 9.5 - 14.5, 5.0, 3.0, 4.2, 0xe2d5c3, 0x7c2d12, false);

      // --- South strip (between railway & sea): vegetable plots, orchard, fishing huts ---
      for (let fx = 48; fx < OUT_X1 - 6; fx += 9.0) {
        if (fx > AVE_A - 5 && fx < AVE_A + 3) continue;
        vb.addBox(fx, 0.0, 22.0, 7.4, 0.1, 6.5, 0x6b4f32);
        for (let r = 0; r < 6; r++) {
          vb.addBox(fx + 0.4, 0.1, 22.5 + r * 1.0, 6.6, 0.16, 0.42, jitterColor(r % 2 ? 0x4d7c0f : 0x65a30d, 0.06));
        }
      }
      [[78.0, 30.0], [96.0, 30.0], [114.0, 30.0]].forEach(([hx, hz]) => {
        buildSimpleHouse(vb, hx, 0.0, hz, 3.2, 2.2, 2.6, 0x94a3b8, 0x334155, true);
      });

      // --- Orchard rows & pines near the Kuroba border ---
      for (let ox = 72; ox < OUT_X1 - 2; ox += 5.5) {
        buildVillageLushTree(vb, ox, 0.06, -36.0, 0.8 + rand() * 0.2);
      }

      // --- Street lamps ---
      for (let lx = 48; lx < OUT_X1; lx += 8) {
        if (Math.abs(lx - AVE_A) > 3) {
          buildStreetLamp(vb, lx, -20.6, 0.1);
          buildStreetLamp(vb, lx + 4, 13.4, 0.1);
        }
      }
      for (let lz = -40; lz < 28; lz += 8) {
        if (lz > 10 && lz < 22) continue;
        buildStreetLamp(vb, AVE_A - 2.7, lz, 0.1);
      }
    }

    // =========================================================================
    // 19. BUILD THE CITY (or hand out the style kit)
    // =========================================================================
    function makeStyleKit() {
      const kitVb = new VoxelBuilder();
      let built = false;
      return {
        root: scene,
        vb: kitVb,
        rand,
        jitterColor,
        lushTree: (x, z, s = 1) => buildLushTree(kitVb, x, 0.05, z, s),
        villageTree: (x, z, s = 1) => buildVillageLushTree(kitVb, x, 0.06, z, s),
        sakuraTree: (x, z, s = 1) => buildSakuraTree(kitVb, x, 0.06, z, s),
        pineTree: (x, z, s = 1) => buildPineTree(kitVb, x, 0.05, z, s),
        streetLamp: (x, z, y = 0.1) => buildStreetLamp(kitVb, x, z, y),
        flowerBed: (x0, z0, w, d) => buildVillageFlowerBed(kitVb, x0, z0, w, d),
        gardenBed: (x0, z0, w, d) => buildFlowerBed(kitVb, x0, z0, w, d),
        picketFence: (x1, z1, x2, z2) => buildPicketFence(kitVb, x1, z1, x2, z2),
        walkway: (x0, z0, w, d, y = 0.07) => buildTiledWalkway(kitVb, x0, z0, w, d, y),
        cobbles: (x0, z0, w, d) => buildCobbleStrip(kitVb, x0, z0, w, d),
        banner: (x, z) => buildPlazaBanner(kitVb, x, z),
        house: (opts) => buildDetailedHouse(kitVb, opts),
        /** Drifting sakura petals around the given blossom canopies ({x, y, z, r, count}). */
        petals: (sources) => buildDriftingSakuraPetals(sources),
        /** Emits all queued voxels into `root` and returns generated colliders (kit-local units). */
        finish() {
          if (built) return [];
          built = true;
          kitVb.build(scene);
          return generateColliders(kitVb);
        },
        update(elapsed) {
          windUniforms.uTime.value = elapsed;
          if (sakuraPetalsMat) sakuraPetalsMat.uniforms.uTime.value = elapsed;
        },
        setTimeOfDay(isNight) {
          if (!sakuraPetalsMat) return;
          sakuraPetalsMat.uniforms.uTintColor.value.setHex(isNight ? 0xcbd5ff : 0xffffff);
          sakuraPetalsMat.uniforms.uLightMix.value = isNight ? 0.72 : 1.0;
        },
        dispose: () => disposeAll()
      };
    }

    function disposeAll() {
      const seen = new Set();
      scene.traverse((obj) => {
        if (obj.geometry && !seen.has(obj.geometry)) {
          seen.add(obj.geometry);
          obj.geometry.dispose();
        }
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        mats.forEach((m) => {
          if (!seen.has(m)) {
            seen.add(m);
            m.dispose();
          }
        });
      });
      disposables.forEach((d) => d.dispose && d.dispose());
    }

    if (mode === 'kit') return makeStyleKit();

    const vb = new VoxelBuilder();
    buildBaseAndRoads(vb);
    buildDowntown(vb);
    buildCentralFountainPlaza(vb);
    buildWaterfallPark(vb);
    buildEastVillage(vb);
    buildRailway(vb);
    buildWestHarbor(vb);
    buildEastHarbor(vb);
    buildPierAndHarborWater(vb);
    buildNorthernTreelineAndAurora(vb);
    buildGatewayAndOutskirts(vb);
    vb.build(scene);
    buildDriftingSakuraPetals();
    buildTraffic();

    // Accent lights (kept few: every point light costs shading time across the whole scene)
    fountainLight = new THREE.PointLight(0x38bdf8, 0, 26, 1.6);
    fountainLight.position.set(0, 3.8, 0);
    scene.add(fountainLight);
    cityHallLight = new THREE.PointLight(0xffcf70, 0, 30, 1.6);
    cityHallLight.position.set(0, 6.8, -20.35);
    scene.add(cityHallLight);

    // =========================================================================
    // 20. COLLIDERS GENERATED FROM THE VOXELS
    //     Solid voxels in the body-height band are rasterised onto a grid and greedily merged
    //     into a few hundred boxes (diorama-local units).
    // =========================================================================
    function generateColliders(vb, extraWalls) {
      const CELL = 0.4;
      const MIN_TOP = 0.42; // lower objects (curbs, rails, steps) are walked over
      const MAX_BOTTOM = 1.3; // higher objects (canopies, booms, signs) are walked under
      let gx0 = Infinity, gx1 = -Infinity, gz0 = Infinity, gz1 = -Infinity;
      for (const v of vb.matte) {
        gx0 = Math.min(gx0, v.x - v.sx * 0.5); gx1 = Math.max(gx1, v.x + v.sx * 0.5);
        gz0 = Math.min(gz0, v.z - v.sz * 0.5); gz1 = Math.max(gz1, v.z + v.sz * 0.5);
      }
      if (!isFinite(gx0)) return [];
      gx0 -= 1; gz0 -= 1; gx1 += 1; gz1 += 1;
      const nx = Math.ceil((gx1 - gx0) / CELL);
      const nz = Math.ceil((gz1 - gz0) / CELL);
      const heights = new Float32Array(nx * nz);

      for (const v of vb.matte) {
        if (v.sx > 30 || v.sz > 30) continue; // ground slabs & roads
        const top = v.y + v.sy * 0.5;
        const bottom = v.y - v.sy * 0.5;
        if (top < MIN_TOP || bottom > MAX_BOTTOM) continue;
        const ix0 = Math.max(0, Math.floor((v.x - v.sx * 0.5 - gx0) / CELL));
        const ix1 = Math.min(nx - 1, Math.floor((v.x + v.sx * 0.5 - gx0 - 1e-4) / CELL));
        const iz0 = Math.max(0, Math.floor((v.z - v.sz * 0.5 - gz0) / CELL));
        const iz1 = Math.min(nz - 1, Math.floor((v.z + v.sz * 0.5 - gz0 - 1e-4) / CELL));
        for (let iz = iz0; iz <= iz1; iz++) {
          for (let ix = ix0; ix <= ix1; ix++) {
            const k = iz * nx + ix;
            if (top > heights[k]) heights[k] = top;
          }
        }
      }

      const band = (h) => (h <= 0 ? 0 : h < 1.6 ? 1 : h < 3.2 ? 2 : 3);
      const used = new Uint8Array(nx * nz);
      const boxes = [];
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          const k = iz * nx + ix;
          if (used[k] || heights[k] <= 0) continue;
          const b = band(heights[k]);
          let w = 1;
          while (ix + w < nx && !used[k + w] && band(heights[k + w]) === b) w++;
          let d = 1;
          outer: while (iz + d < nz) {
            const row = (iz + d) * nx + ix;
            for (let j = 0; j < w; j++) {
              if (used[row + j] || band(heights[row + j]) !== b) break outer;
            }
            d++;
          }
          let maxH = 0;
          for (let r = 0; r < d; r++) {
            for (let j = 0; j < w; j++) {
              const kk = (iz + r) * nx + ix + j;
              used[kk] = 1;
              if (heights[kk] > maxH) maxH = heights[kk];
            }
          }
          boxes.push({
            minX: gx0 + ix * CELL,
            maxX: gx0 + (ix + w) * CELL,
            minZ: gz0 + iz * CELL,
            maxZ: gz0 + (iz + d) * CELL,
            maxY: maxH,
            blocksBullets: true
          });
        }
      }

      if (extraWalls) extraWalls((minX, maxX, minZ, maxZ) => boxes.push({ minX, maxX, minZ, maxZ, maxY: 2.0, blocksBullets: false }));
      return boxes;
    }
    // Invisible sea walls along the quay, pier and outskirts shore (not bullet-blocking)
    const colliders = generateColliders(vb, (wall) => {
      wall(-46, -5.2, 32.5, 33.3);
      wall(5.2, OUT_X1, 32.5, 33.3);
      wall(-5.9, -5.2, 32.5, 44.6);
      wall(5.2, 5.9, 32.5, 44.6);
      wall(-5.9, 5.9, 44.5, 45.2);
    });

    // Zombie approach points, all on open road (diorama-local x, z)
    const spawnAnchors = [
      [0, -39], [-22, -23.25], [0, 25], [39, 0], [-30, 16], [10, -26],
      [AVE_A, -10], [90, 16], [92, -23.25]
    ];

    // =========================================================================
    // 21. GAME-DRIVEN UPDATE, DAY/NIGHT & LIFECYCLE
    // =========================================================================
    const trainState = { dir: 1, min: -33.6, max: 95.6, speed: 9.5, wait: 0 };
    const _plLocal = new THREE.Vector3();
    let hasPlayer = false;

    function blockedAhead(laneAxis, alongPos, crossPos, dir, reach, halfWidth) {
      if (!hasPlayer) return false;
      const pAlong = laneAxis === 'x' ? _plLocal.x : _plLocal.z;
      const pCross = laneAxis === 'x' ? _plLocal.z : _plLocal.x;
      if (Math.abs(pCross - crossPos) > halfWidth) return false;
      const ahead = (pAlong - alongPos) * dir;
      return ahead > 0 && ahead < reach;
    }

    function updateTraffic(dt) {
      animatedObjects.cars.forEach((r) => {
        const fixed = r.center + r.lane;
        const halfLen = r.car.userData.halfLen || 1.6;
        if (!blockedAhead(r.axis, r.pos, fixed, r.dir, halfLen + 3.2, 1.6)) {
          r.pos += dt * r.speed * r.dir;
        }
        if (r.pos > r.max || r.pos < r.min) {
          r.pos = THREE.MathUtils.clamp(r.pos, r.min, r.max);
          r.dir = -r.dir;
          r.lane = -r.lane; // U-turn into the opposite lane
        }
        const lane = r.center + r.lane;
        if (r.axis === 'z') {
          r.car.position.set(lane, 0.08, r.pos);
          r.car.rotation.y = r.dir > 0 ? 0 : Math.PI;
        } else {
          r.car.position.set(r.pos, 0.08, lane);
          r.car.rotation.y = r.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      });

      const train = animatedObjects.train;
      if (train) {
        if (trainState.wait > 0) {
          trainState.wait -= dt;
        } else if (!blockedAhead('x', train.position.x, 19.3, trainState.dir, 10.8 + 4.5, 1.7)) {
          train.position.x += dt * trainState.speed * trainState.dir;
          if (train.position.x > trainState.max || train.position.x < trainState.min) {
            train.position.x = THREE.MathUtils.clamp(train.position.x, trainState.min, trainState.max);
            trainState.dir = -trainState.dir;
            trainState.wait = 4.0; // dwell at the buffer stop before heading back
          }
        }
      }
    }

    /**
     * @param elapsed seconds since start
     * @param dt frame delta (seconds)
     * @param playerWorld player position in world space (or null)
     */
    function update(elapsed, dt, playerWorld) {
      hasPlayer = !!playerWorld;
      if (playerWorld) {
        _plLocal.copy(playerWorld);
        scene.worldToLocal(_plLocal);
      }

      windUniforms.uTime.value = elapsed;
      if (harborWaterMesh) harborWaterMesh.material.uniforms.uTime.value = elapsed;
      if (pondWaterMesh) pondWaterMesh.material.uniforms.uTime.value = elapsed;
      if (fountainWaterMesh) fountainWaterMesh.material.uniforms.uTime.value = elapsed;
      if (waterfallMesh) waterfallMesh.material.uniforms.uTime.value = elapsed;
      if (waterfallMistMat) waterfallMistMat.uniforms.uTime.value = elapsed;
      if (sakuraPetalsMat) sakuraPetalsMat.uniforms.uTime.value = elapsed;
      animatedObjects.auroraCurtains.forEach((c) => {
        c.material.uniforms.uTime.value = elapsed;
      });

      // Rotate Aurora double-helix fountain spiral (direct InstancedMesh buffer write)
      if (spiralInstMesh) {
        const arr = spiralInstMesh.instanceMatrix.array;
        const data = animatedObjects.spiralData;
        for (let i = 0; i < data.length; i++) {
          const s = data[i];
          const a = s.baseAngle + elapsed * 1.45;
          const off = i * 16;
          arr[off + 12] = Math.cos(a) * s.r;
          arr[off + 13] = s.baseY + Math.sin(elapsed * 3.0 + s.t * 8.0) * 0.12;
          arr[off + 14] = Math.sin(a) * s.r;
        }
        spiralInstMesh.instanceMatrix.needsUpdate = true;
      }

      // Waterfall spray & foam droplets
      if (dropsInstMesh) {
        const arr = dropsInstMesh.instanceMatrix.array;
        const data = animatedObjects.dropsData;
        for (let i = 0; i < data.length; i++) {
          const d = data[i];
          const t = (elapsed * d.speed + d.phase) % 1.0;
          const sc = 0.65 + t * 0.9;
          const off = i * 16;
          arr[off] = sc;
          arr[off + 5] = sc;
          arr[off + 10] = sc;
          arr[off + 12] = -38.6 + t * 3.4 - d.uOff * 0.54;
          arr[off + 13] = 7.65 - t * t * 7.8;
          arr[off + 14] = -20.8 + t * 2.2 + d.uOff * 0.84;
        }
        dropsInstMesh.instanceMatrix.needsUpdate = true;
      }

      animatedObjects.tugboats.forEach((tb) => {
        tb.mesh.position.y = tb.baseY + Math.sin(elapsed * 1.8 + tb.phase) * 0.11;
        tb.mesh.rotation.z = Math.sin(elapsed * 1.4 + tb.phase) * 0.032;
        tb.mesh.rotation.x = Math.cos(elapsed * 1.1 + tb.phase) * 0.018;
      });

      updateTraffic(dt);

      animatedObjects.blinkBeacons.forEach((b) => {
        b.mesh.visible = Math.sin(elapsed * 4.0 + b.phase) > -0.2;
      });
      animatedObjects.crossingLights.forEach((cl) => {
        cl.mesh.visible = Math.sin(elapsed * 7.5 + cl.phase) > 0;
      });
    }

    const _sun = new THREE.Vector3();
    const _q = new THREE.Quaternion();
    /**
     * Matches the water/petal palettes to the game's day/night (diorama "day" and "aurora" moods).
     */
    function setTimeOfDay(isNight, fogHex, fogDensity, sunDirWorld) {
      const waterU = harborWaterMesh.material.uniforms;
      const pondU = pondWaterMesh.material.uniforms;
      const fntU = fountainWaterMesh ? fountainWaterMesh.material.uniforms : null;
      const wfU = waterfallMesh ? waterfallMesh.material.uniforms : null;

      waterU.uFogColor.value.setHex(fogHex);
      waterU.uFogDensity.value = fogDensity;
      if (sunDirWorld) {
        scene.getWorldQuaternion(_q).invert();
        _sun.copy(sunDirWorld).normalize().applyQuaternion(_q);
        waterU.uSunDir.value.copy(_sun);
        if (fntU) fntU.uSunDir.value.copy(_sun);
        if (wfU) wfU.uSunDir.value.copy(_sun);
      }

      if (isNight) {
        waterU.uShallowColor.value.setHex(0x0ea5b7);
        waterU.uMidColor.value.setHex(0x083358);
        waterU.uDeepColor.value.setHex(0x031124);
        waterU.uSkyColor.value.setHex(0x0f1f42);
        waterU.uHorizonColor.value.setHex(0x1e3a5f);
        waterU.uSunColor.value.setHex(0x93c5fd);
        waterU.uLampIntensity.value = 1.65;
        pondU.uLampIntensity.value = 1.45;
        if (fntU) {
          fntU.uShallowColor.value.setHex(0x06b6d4);
          fntU.uMidColor.value.setHex(0x0369a1);
          fntU.uDeepColor.value.setHex(0x041226);
          fntU.uSunColor.value.setHex(0x93c5fd);
          fntU.uGlowIntensity.value = 1.55;
        }
        if (sakuraPetalsMat) {
          sakuraPetalsMat.uniforms.uTintColor.value.setHex(0xcbd5ff);
          sakuraPetalsMat.uniforms.uLightMix.value = 0.72;
        }
        if (wfU) {
          wfU.uDeepCol.value.setHex(0x075985);
          wfU.uMidCol.value.setHex(0x38bdf8);
          wfU.uSunColor.value.setHex(0x7dd3fc);
          wfU.uGlowBoost.value = 0.65;
        }
        if (waterfallMistMat) {
          waterfallMistMat.uniforms.uMistColor.value.setHex(0x99f6e4);
          waterfallMistMat.uniforms.uOpacity.value = 0.55;
        }
        animatedObjects.auroraCurtains.forEach((c) => {
          c.visible = true;
          c.material.uniforms.uOpacity.value = 0.85;
        });
        fountainLight.intensity = 9.0;
        cityHallLight.intensity = 7.0;
      } else {
        waterU.uShallowColor.value.setHex(0x2dd4bf);
        waterU.uMidColor.value.setHex(0x0284c7);
        waterU.uDeepColor.value.setHex(0x075985);
        waterU.uSkyColor.value.setHex(0x60a5fa);
        waterU.uHorizonColor.value.setHex(0xbae6fd);
        waterU.uSunColor.value.setHex(0xffffff);
        waterU.uLampIntensity.value = 0.18;
        pondU.uLampIntensity.value = 0.2;
        if (fntU) {
          fntU.uShallowColor.value.setHex(0x2dd4bf);
          fntU.uMidColor.value.setHex(0x0ea5e9);
          fntU.uDeepColor.value.setHex(0x075985);
          fntU.uSunColor.value.setHex(0xffffff);
          fntU.uGlowIntensity.value = 0.55;
        }
        if (sakuraPetalsMat) {
          sakuraPetalsMat.uniforms.uTintColor.value.setHex(0xffffff);
          sakuraPetalsMat.uniforms.uLightMix.value = 1.0;
        }
        if (wfU) {
          wfU.uDeepCol.value.setHex(0x0284c7);
          wfU.uMidCol.value.setHex(0x38bdf8);
          wfU.uSunColor.value.setHex(0xffffff);
          wfU.uGlowBoost.value = 0.15;
        }
        if (waterfallMistMat) {
          waterfallMistMat.uniforms.uMistColor.value.setHex(0xffffff);
          waterfallMistMat.uniforms.uOpacity.value = 0.42;
        }
        animatedObjects.auroraCurtains.forEach((c) => {
          c.visible = false;
          c.material.uniforms.uOpacity.value = 0.0;
        });
        fountainLight.intensity = 0;
        cityHallLight.intensity = 0;
      }
    }

    /** Call after positioning `root` in the world so the water shaders map world <-> city space. */
    function syncWorldMatrix() {
      scene.updateMatrixWorld(true);
      cityUniforms.uCity.value.copy(scene.matrixWorld);
      cityUniforms.uCityInv.value.copy(scene.matrixWorld).invert();
    }


    return {
      root: scene,
      colliders,
      spawnAnchors,
      update,
      setTimeOfDay,
      syncWorldMatrix,
      dispose: disposeAll
    };
}
