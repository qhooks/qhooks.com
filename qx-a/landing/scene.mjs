// QHooks landing scene (2026-11-12): one fixed WebGL canvas behind the home page, driven by scroll progress P in [0, 6):
//   0 hero · 1 builders · 2 callers · 3 holders · 4 traders · 5 close.
// The look is the commercial's (work/qhooks-film-20261112/film.js): the same room environment, lights, brushed steel and
// gold, the same bloom + grade pass (vignette, grain, aberration, light sweep). The gold hook (the film's model, packed to
// hook.bin) forms out of sparks once at load, then each chapter gives it one hero object: launch blocks docking on the
// shank, the latest call's outcome as extruded type, QHOOKS coins on the floor that burn into embers, the chain names
// slamming in as type with one coin flipping. Every motion beyond the scroll choreography is a real event the page hands
// in (hit, call, burn). No rings, orbits, halos or node lines anywhere (Randall, 2026-11-12: they read as bubble maps).
// Phone first: DPR capped, no DoF pass (dust fakes it by depth), a top band for the object in portrait so the words
// never sit on it. three lives at /qx-a/vendor/three (shared with /create); the addons carry one patch: `from 'three'`
// → a relative path, because the CSP (script-src 'self') forbids an inline import map.
import * as THREE from '../vendor/three/three.module.js';
import { EffectComposer } from '../vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/three/addons/postprocessing/OutputPass.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeOutQuint = (t) => 1 - Math.pow(1 - clamp(t), 5);
const easeInOut = (t) => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const span = (t, a, b) => clamp((t - a) / (b - a));
function seeded(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const GOLD = 0xd2ad72, GOLD_HI = 0xf0daae;
const FONT = '"Mona Sans", ui-sans-serif, system-ui, sans-serif';
const CHAIN_NAMES = ['ROBINHOOD.', 'BASE.', 'BNB.', 'ARBITRUM.', 'ETHEREUM.', 'ELYSIUM.', 'MONAD.', 'SOLANA.'];

export async function mountScene(canvas, { icons = [], logo = '/qhooks-logo.jpg', portrait = () => innerHeight > innerWidth } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
  const DPR = Math.min(devicePixelRatio || 1, 1.6);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050505);
  scene.fog = new THREE.FogExp2(0x050505, .03);
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
  let W = 1, H = 1, PORT = false, P = 0, Pt = 0, t = 0, running = false, raf = 0, last = 0;
  const texLoader = new THREE.TextureLoader();
  const imgTex = (src) => { const tx = texLoader.load(src); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx; };

  /* ---------- environment: the film's dark room with warm strip lights ---------- */
  const envScene = new THREE.Scene();
  {
    const add = (w, h, pos, col, inten) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); m.material.color.multiplyScalar(inten); m.position.copy(pos); m.lookAt(0, 0, 0); envScene.add(m); };
    envScene.add(new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshBasicMaterial({ color: 0x0a0b0a, side: THREE.BackSide })));
    add(14, 1.2, new THREE.Vector3(0, 9, 0), new THREE.Color(0xfff0d0), 1.7);
    add(1.4, 12, new THREE.Vector3(-10, 2, 4), new THREE.Color(0xf0d6a0), 1.4);
    add(1.0, 12, new THREE.Vector3(10, -1, -3), new THREE.Color(GOLD), 1.8);
    add(10, .6, new THREE.Vector3(0, -9, 2), new THREE.Color(0x8e6c3a), .6);
    add(3, 3, new THREE.Vector3(2, 3, 12), new THREE.Color(0xffffff), .5);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, .04).texture; pmrem.dispose();

  /* ---------- lights (film.js) ---------- */
  const key = new THREE.SpotLight(0xfff1d6, 36, 30, .6, .5, 1.2); key.position.set(-4, 6, 6); scene.add(key); scene.add(key.target);
  const rim = new THREE.PointLight(GOLD, 30, 30, 1.6); rim.position.set(4, 2, -3); scene.add(rim);
  const sweep = new THREE.PointLight(0xffe7b8, 0, 12, 1.4); scene.add(sweep);
  scene.add(new THREE.AmbientLight(0x141414, .5));

  /* ---------- the set: a near-black void, two or three parallel vertical shafts, dust, polished floor and plinth ---------- */
  const backMat = new THREE.ShaderMaterial({
    uniforms: { uGlow: { value: .5 }, uCenter: { value: new THREE.Vector2(.5, .5) }, uTint: { value: new THREE.Color(GOLD) }, uAspect: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uGlow; uniform vec2 uCenter; uniform vec3 uTint; uniform float uAspect;
      void main(){ vec2 d = (vUv - uCenter) * vec2(uAspect, 1.0); float r = length(d); float g = exp(-r * r * 7.0) * uGlow;
        vec3 base = vec3(0.020, 0.020, 0.020); gl_FragColor = vec4(base + uTint * g * 0.05, 1.0); }`, depthWrite: false, fog: false });
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(60, 34), backMat); backdrop.position.z = -14; scene.add(backdrop);
  const shaftTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d');
    const v = g.createLinearGradient(0, 0, 0, 512); v.addColorStop(0, 'rgba(255,247,232,1)'); v.addColorStop(.5, 'rgba(255,244,226,.4)'); v.addColorStop(1, 'rgba(255,244,226,0)'); g.fillStyle = v; g.fillRect(0, 0, 128, 512);
    const hz = g.createLinearGradient(0, 0, 128, 0); hz.addColorStop(0, 'rgba(0,0,0,1)'); hz.addColorStop(.3, 'rgba(0,0,0,0)'); hz.addColorStop(.7, 'rgba(0,0,0,0)'); hz.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = hz; g.fillRect(0, 0, 128, 512);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; })();
  const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: .11, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shaft = new THREE.Group(); scene.add(shaft);
  [[1.0, -.05, -.9], [1.7, 1.9, -3.2], [.6, -2.4, -3.8]].forEach(([w, x, z]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 18), shaftMat); m.position.set(x, 4.5, z); shaft.add(m); });
  const FLOOR_Y = -1.62, PLINTH_TOP = -1.52;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: .14, metalness: .75, clearcoat: 1, clearcoatRoughness: .08 })); floor.rotation.x = -Math.PI / 2; floor.position.y = FLOOR_Y; scene.add(floor);
  const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, 'rgba(240,218,174,.2)'); r.addColorStop(.4, 'rgba(210,173,114,.04)'); r.addColorStop(1, 'rgba(210,173,114,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; })();
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); pool.rotation.x = -Math.PI / 2; pool.position.y = FLOOR_Y + .01; scene.add(pool);
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.12, .1, 72), new THREE.MeshPhysicalMaterial({ color: 0x070708, roughness: .1, metalness: .8, clearcoat: 1, clearcoatRoughness: .05 })); plinth.position.y = PLINTH_TOP - .05; scene.add(plinth);

  /* ---------- dust: fine particles caught in the beam, soft by depth ---------- */
  const DUST = 2600;
  const dustGeo = new THREE.BufferGeometry();
  { const rnd = seeded(5), p = new Float32Array(DUST * 3), s = new Float32Array(DUST); for (let i = 0; i < DUST; i++) { p[i * 3] = (rnd() - .5) * 7; p[i * 3 + 1] = -1.6 + rnd() * 7; p[i * 3 + 2] = (rnd() - .5) * 6; s[i] = rnd(); } dustGeo.setAttribute('position', new THREE.BufferAttribute(p, 3)); dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(s, 1)); }
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uFocus: { value: 6 }, uCenter: { value: new THREE.Vector3() }, uOpacity: { value: 1 } },
    vertexShader: `attribute float aSeed; uniform float uTime, uPx, uFocus; uniform vec3 uCenter; varying float vA; varying float vS;
      void main(){ vec3 p = position + uCenter; float w = uTime * (0.03 + 0.05 * aSeed);
        p.x += sin(w * 1.7 + aSeed * 31.0) * 0.35; p.y += sin(w * 1.1 + aSeed * 17.0) * 0.25 - mod(uTime * (0.02 + 0.03 * aSeed), 7.0) + 3.5; p.z += cos(w * 1.3 + aSeed * 11.0) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        float d = abs(-mv.z - uFocus); float blur = clamp(d / 3.0, 0.0, 1.0);
        float beam = exp(-position.x * position.x * 0.9) * (0.45 + 0.55 * smoothstep(-1.6, 3.0, p.y));
        vA = (0.35 + 0.65 * aSeed) * beam * (1.0 - 0.85 * blur); vS = blur;
        gl_PointSize = uPx * (1.0 + 1.4 * aSeed) * (1.0 + 1.6 * blur) * 20.0 / -mv.z; }`,
    fragmentShader: `uniform float uOpacity; varying float vA; varying float vS; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
      float core = exp(-r * r * mix(22.0, 6.0, vS)); gl_FragColor = vec4(vec3(1.0, 0.92, 0.74) * core, core * vA * uOpacity * 0.55); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dustGeo, dustMat); dust.frustumCulled = false; scene.add(dust);

  /* ---------- the hook (hook.bin: int16 positions, int8 normals, int16 uvs, uint16 indices) ---------- */
  const hookRoot = new THREE.Group(); scene.add(hookRoot);
  const hookSpin = new THREE.Group(); hookRoot.add(hookSpin);
  const model = new THREE.Group(); hookSpin.add(model);
  function brushedNormalMap() {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const ctx = c.getContext('2d');
    const rnd = seeded(3), hgt = new Float32Array(S * S);
    for (let y = 0; y < S; y++) { let v = rnd(); for (let x = 0; x < S; x++) { v = v * .86 + rnd() * .14; hgt[y * S + x] = v + .35 * Math.sin(y * .9 + rnd() * .3) * rnd(); } }
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const l = hgt[y * S + ((x - 1 + S) % S)], r = hgt[y * S + ((x + 1) % S)], u = hgt[((y - 1 + S) % S) * S + x], d = hgt[((y + 1) % S) * S + x];
      const nx = (l - r) * .6, ny = (u - d) * 2.4, len = Math.hypot(nx, ny, 1), i = (y * S + x) * 4;
      img.data[i] = (nx / len * .5 + .5) * 255; img.data[i + 1] = (ny / len * .5 + .5) * 255; img.data[i + 2] = (1 / len * .5 + .5) * 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); const tx = new THREE.CanvasTexture(c); tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(1, 3); return tx;
  }
  const steelMat = new THREE.MeshPhysicalMaterial({ color: 0xd4c6ad, metalness: 1, roughness: .3, clearcoat: .3, clearcoatRoughness: .2, emissive: 0x000000, normalMap: brushedNormalMap(), normalScale: new THREE.Vector2(.22, .22) });
  const goldMat = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: .28, emissive: 0x000000 });
  const studMat = new THREE.MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: .3, emissive: GOLD, emissiveIntensity: .6 });
  const threadMat = new THREE.MeshBasicMaterial({ color: GOLD_HI, transparent: true, opacity: .9 });
  const MATS = { Steel: steelMat, Gold: goldMat, GoldLit: studMat, Thread: threadMat };
  const surface = []; const reflection = new THREE.Group(); scene.add(reflection);
  const reflMat = new THREE.MeshPhysicalMaterial({ color: 0xd4c6ad, metalness: 1, roughness: .5, transparent: true, opacity: .3, depthTest: false, depthWrite: false, clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, -1, 0), PLINTH_TOP)] });
  {
    const buf = await (await fetch(new URL('./hook.bin', import.meta.url), { cache: 'force-cache' })).arrayBuffer();
    const dv = new DataView(buf), hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)).replace(/\0+$/, '')), base = 8 + hl;
    const rnd = seeded(7);
    for (const p of head.parts) {
      const q = new Int16Array(buf, base + p.pos, p.vc * 3), qn = new Int8Array(buf, base + p.nor, p.vc * 3), ix = new Uint16Array(buf, base + p.idx, p.ic);
      const pos = new Float32Array(p.vc * 3), nor = new Float32Array(p.vc * 3);
      for (let i = 0; i < p.vc * 3; i++) { const k = i % 3; pos[i] = (q[i] + 32767) / 65534 * (p.max[k] - p.min[k]) + p.min[k]; nor[i] = qn[i] / 127; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(new THREE.BufferAttribute(new Uint16Array(ix), 1));
      if (p.uv != null) { const quv = new Int16Array(buf, base + p.uv, p.vc * 2), uv = new Float32Array(p.vc * 2); for (let i = 0; i < p.vc * 2; i++) uv[i] = quv[i] / 32767 * 4; g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
      model.add(new THREE.Mesh(g, MATS[p.material] || steelMat));
      if (p.material !== 'Thread') { const m = new THREE.Mesh(g, reflMat); m.renderOrder = 2; reflection.add(m); }
      if (p.material === 'Steel' || p.material === 'Gold') for (let i = 0; i < (p.material === 'Steel' ? 5600 : 1400); i++) { const vi = Math.floor(rnd() * p.vc) * 3; surface.push(pos[vi], pos[vi + 1], pos[vi + 2]); }
    }
    model.position.set(.455, -1.085, 0); // the bend's centre on the origin; the eye at (0.45, 1.1); the thread rises to 3.4
  }

  /* ---------- particles: sparks that assemble into the hook at load (film.js forge) ---------- */
  const N = surface.length / 3;
  const pStart = new Float32Array(N * 3), pEnd = new Float32Array(surface), pSeed = new Float32Array(N);
  { const rnd = seeded(3); for (let i = 0; i < N; i++) { const r = 3.5 + rnd() * 5, th = rnd() * 6.283, ph = Math.acos(2 * rnd() - 1); pStart[i * 3] = r * Math.sin(ph) * Math.cos(th); pStart[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * .7; pStart[i * 3 + 2] = r * Math.cos(ph) * .6; pSeed[i] = rnd(); } }
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pStart, 3)); pGeo.setAttribute('aEnd', new THREE.BufferAttribute(pEnd, 3)); pGeo.setAttribute('aSeed', new THREE.BufferAttribute(pSeed, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uAssemble: { value: 0 }, uSize: { value: 1 }, uOpacity: { value: 1 }, uTime: { value: 0 }, uPx: { value: 1 }, uScatter: { value: 0 } },
    vertexShader: `attribute vec3 aEnd; attribute float aSeed; uniform float uAssemble, uSize, uTime, uPx, uScatter; varying float vA; varying float vSeed;
      void main(){ float a = clamp(uAssemble * 1.25 - aSeed * 0.25, 0.0, 1.0); a = a*a*(3.0-2.0*a); vec3 p = mix(position, aEnd, a);
        float sw = (1.0 - a) * 0.6; float ang = uTime * (0.6 + aSeed) + aSeed * 6.283; p.x += sin(ang) * sw; p.y += cos(ang * 1.3) * sw * 0.5;
        p += (position - aEnd) * uScatter * (0.5 + aSeed);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPx * (2.0 + 4.0 * aSeed) * (1.0 - 0.6 * a) * 30.0 / -mv.z; vA = a; vSeed = aSeed; }`,
    fragmentShader: `uniform float uOpacity; varying float vA; varying float vSeed;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float core = exp(-r * r * 18.0);
        vec3 c = mix(vec3(1.0, 0.62, 0.22), vec3(1.0, 0.85, 0.55), vSeed); gl_FragColor = vec4(c * (0.4 + 1.1 * core), core * uOpacity * (1.0 - 0.75 * vA)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const particles = new THREE.Points(pGeo, pMat); particles.position.copy(model.position); particles.frustumCulled = false; hookSpin.add(particles);

  /* ---------- bursts: a real trade, burn or call throws sparks; a burning coin rises as embers ---------- */
  const bursts = [];
  const burstMat = (color) => new THREE.ShaderMaterial({
    uniforms: { uT: { value: 9 }, uStrength: { value: 1 }, uColor: { value: new THREE.Color(color) }, uPx: { value: 1 }, uUp: { value: 1 }, uSize: { value: 1 } },
    vertexShader: `attribute vec3 aDir; attribute float aSeed; uniform float uT, uStrength, uPx, uUp, uSize; varying float vL;
      void main(){ float t = uT; float e = 1.0 - exp(-3.2 * t); vec3 p = aDir * (uStrength * (0.5 + aSeed) * e); p.y += (uUp > 1.5 ? 0.25 * e + t * 0.55 : uUp * 0.9 * e - 0.9 * t * t);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; vL = clamp(1.0 - t / 1.3, 0.0, 1.0);
        gl_PointSize = uSize * uPx * (3.0 + 5.0 * aSeed) * vL * 32.0 / -mv.z; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uSize; varying float vL; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float core = exp(-r * r * 14.0); gl_FragColor = vec4(uColor * (0.5 + core), core * vL * min(1.0, uSize)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  { const rnd = seeded(21); for (let b = 0; b < 5; b++) { const M = 260, dir = new Float32Array(M * 3), sd = new Float32Array(M), pos = new Float32Array(M * 3);
    for (let i = 0; i < M; i++) { const th = rnd() * 6.283, ph = Math.acos(2 * rnd() - 1); dir[i * 3] = Math.sin(ph) * Math.cos(th); dir[i * 3 + 1] = Math.abs(Math.sin(ph) * Math.sin(th)); dir[i * 3 + 2] = Math.cos(ph) * .7; sd[i] = rnd(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    const m = new THREE.Points(g, burstMat(GOLD_HI)); m.visible = false; m.frustumCulled = false; scene.add(m); bursts.push(m); } }
  let burstI = 0;
  const COLORS = { buy: 0x9ff0c2, sell: 0xff8a8e, burn: 0xffa352, call: 0xf0daae, gold: 0xf0daae, ember: 0xff7a2a };
  function burst(worldPos, { color = 'gold', strength = 1, up = 1, size = 1 } = {}) {
    const b = bursts[burstI++ % bursts.length]; b.position.copy(worldPos); b.visible = true; b.material.uniforms.uT.value = 0; b.material.uniforms.uStrength.value = strength; b.material.uniforms.uUp.value = up; b.material.uniforms.uSize.value = size; b.material.uniforms.uColor.value.setHex(COLORS[color] || COLORS.gold);
  }

  /* ---------- post: bloom + the film's grade (vignette, grain, aberration, sweep, flash) ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), .3, .4, .96); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const gradePass = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: .9 }, uGrain: { value: .045 }, uAb: { value: .004 }, uFlash: { value: 0 }, uSweep: { value: -2 }, uSweepW: { value: .09 }, uZoom: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uGrain, uAb, uFlash, uSweep, uSweepW, uZoom; uniform vec2 uRes; varying vec2 vUv;
      float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main(){
        vec2 uv = vUv; vec2 c = uv - 0.5; vec3 col = vec3(0.0);
        if (uZoom > 0.001) { for (int i = 0; i < 6; i++) { float s = 1.0 - uZoom * float(i) / 6.0; col += texture2D(tDiffuse, c * s + 0.5).rgb; } col /= 6.0; }
        else { float ab = uAb * length(c); col.r = texture2D(tDiffuse, uv + c * ab).r; col.g = texture2D(tDiffuse, uv).g; col.b = texture2D(tDiffuse, uv - c * ab).b; }
        float d = (uv.x + uv.y * 0.35) - uSweep; float sw = exp(-d * d / (uSweepW * uSweepW)) * 0.28; col += vec3(1.0, 0.9, 0.72) * sw;
        float tall = uRes.y / uRes.x > 1.0 ? 0.75 : 1.0; vec2 cc = c * vec2(1.0, tall);
        col *= clamp(1.0 - uVig * dot(cc, cc) * 1.6, 0.0, 1.0);
        float g = hash(uv * uRes.xy + fract(uTime * 7.31) * 100.0) - 0.5; col += g * uGrain * (0.6 + 0.4 * (1.0 - col.g));
        col = mix(col, vec3(1.0, 0.93, 0.8), uFlash);
        gl_FragColor = vec4(col, 1.0); }`,
  });
  composer.addPass(gradePass);
  const G = gradePass.uniforms;
  let flashV = 0, zoomV = 0, sweepT = 99;

  /* ---------- canvas text textures (Mona Sans, loaded by the page) ---------- */
  function textTex({ text, w = 1024, h = 320, size = 220, weight = 860, color = '#F4F1E9', stretch = 'expanded', tracking = -.045 }) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
    g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle';
    try { g.fontStretch = stretch; } catch {}
    try { g.letterSpacing = (tracking * size).toFixed(1) + 'px'; } catch {}
    g.font = `${weight} ${size}px ${FONT}`; g.fillStyle = color; g.fillText(text, w / 2, h / 2);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.generateMipmaps = true; return tx;
  }
  // extruded type: the same glyph texture on a stack of planes, the back ones darker
  function extruded(w, h, depth = 8, step = .045) {
    const g = new THREE.Group(); const geo = new THREE.PlaneGeometry(w, h); g.userData.planes = [];
    for (let i = depth; i >= 0; i--) { const front = i === 0; const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, color: front ? 0xffffff : new THREE.Color().setScalar(lerp(.16, .46, 1 - i / depth)), opacity: 1, toneMapped: false })); m.position.z = -i * step; m.renderOrder = 10 - i; g.add(m); g.userData.planes.push(m); }
    g.userData.setMap = (tx) => g.userData.planes.forEach((m) => { m.material.map = tx; m.material.needsUpdate = true; });
    g.userData.setOpacity = (o) => g.userData.planes.forEach((m) => { m.material.opacity = o; });
    g.visible = false; scene.add(g); return g;
  }
  // a coin: a gold edge with two faces, no rim ring
  const faceMat = new THREE.MeshPhysicalMaterial({ color: 0x151a18, metalness: .2, roughness: .35, clearcoat: 1 });
  function makeCoin(tex, r = .32) {
    const g = new THREE.Group();
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(r, r, .07, 48), goldMat); edge.rotation.x = Math.PI / 2; g.add(edge);
    const faces = [];
    [1, -1].forEach((s) => { const f = new THREE.Mesh(new THREE.CircleGeometry(r * .9, 48), faceMat); f.position.z = s * .0356; if (s < 0) f.rotation.y = Math.PI; g.add(f);
      const ic = new THREE.Mesh(new THREE.CircleGeometry(r * .74, 48), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })); ic.position.z = s * .037; if (s < 0) ic.rotation.y = Math.PI; g.add(ic); faces.push(ic); });
    g.userData.faces = faces; g.userData.setMap = (tx) => faces.forEach((f) => { f.material.map = tx; f.material.needsUpdate = true; });
    return g;
  }

  /* ---------- builders: six launch blocks dock onto the hook (no links between them) ---------- */
  const BLOCKS = ['ANTI-SNIPE', 'BUYBACK + BURN', 'AUTO BURN', 'BUY / SELL TAX', 'KING OF THE POOL', 'LAST BUYER WINS'];
  const blocks = [], blockGroup = new THREE.Group(); scene.add(blockGroup);
  const slabMat = new THREE.MeshPhysicalMaterial({ color: 0x14181a, metalness: .35, roughness: .32, clearcoat: 1, clearcoatRoughness: .25 });
  const edgeMat = new THREE.LineBasicMaterial({ color: GOLD_HI, transparent: true, opacity: .75 });
  {
    const bw = 1.05, bh = .16, bd = .62, box = new THREE.BoxGeometry(bw, bh, bd), edges = new THREE.EdgesGeometry(box);
    BLOCKS.forEach((label, i) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(box, slabMat)); g.add(new THREE.LineSegments(edges, edgeMat));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(bw * .92, bd * .72), new THREE.MeshBasicMaterial({ map: textTex({ text: label, w: 512, h: 192, size: 54, weight: 760, color: '#F0DAAE', stretch: 'normal', tracking: .02 }), transparent: true, toneMapped: false, depthWrite: false }));
      face.rotation.x = -Math.PI / 2; face.position.y = bh / 2 + .004; g.add(face);
      const led = new THREE.Mesh(new THREE.SphereGeometry(.03, 10, 10), new THREE.MeshBasicMaterial({ color: GOLD_HI })); led.position.set(-bw / 2 + .09, bh / 2 + .02, bd / 2 - .09); g.add(led);
      g.userData.i = i; g.userData.led = led; g.visible = false; blockGroup.add(g); blocks.push(g);
    });
  }

  /* ---------- callers: the latest call's outcome as extruded type ---------- */
  const numberG = extruded(4.6, 1.44, 9, .05);
  const numberSub = new THREE.Mesh(new THREE.PlaneGeometry(4.6, .5), new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false })); numberSub.visible = false; scene.add(numberSub);
  let callData = { pct: null, label: '' }, callTexKey = '', callShown = 0;

  /* ---------- holders: QHOOKS coins drop onto the floor; a real burn takes one and it rises as embers ---------- */
  const qTex = imgTex(logo);
  const PILE = [[-.95, .35], [-.55, -.15], [-.15, .45], [.25, -.3], [.6, .25], [1.0, -.1], [-.75, .75], [.05, .85], [.8, .7]]; // x, z around the hook's bend
  const coinPile = PILE.map(([x, z], k) => { const c = makeCoin(qTex, .3); c.userData = { ...c.userData, x, z, k, burn: null, gone: false, respawn: 0, rot: (k * 1.7) % 1 - .5 }; c.visible = false; scene.add(c); return c; });
  let burnQueue = 0;

  /* ---------- traders: the chain names slam in as type; one coin flips as each lands ---------- */
  const nameG = extruded(5.8, 1.36, 7, .05);
  const nameTex = CHAIN_NAMES.map((n) => textTex({ text: n, w: 1536, h: 360, size: 236, weight: 900, color: '#F4F1E9', tracking: -.045 }));
  const chainTex = icons.map(imgTex);
  const chainCoin = makeCoin(chainTex[0] || qTex, .36); chainCoin.visible = false; scene.add(chainCoin);
  let nameIdx = -1, coinFlash = 0;

  /* ---------- layout ---------- */
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight; if (w === W && h === H) return;
    W = w; H = h; PORT = portrait(); renderer.setSize(W, H, false); composer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
    G.uRes.value.set(W * DPR, H * DPR); backMat.uniforms.uAspect.value = W / H;
    const px = (PORT ? W / 1080 : H / 1080) * DPR * 1.6; pMat.uniforms.uPx.value = px; dustMat.uniforms.uPx.value = px; bursts.forEach((b) => (b.material.uniforms.uPx.value = px));
  }
  const cam = { x: 0, y: 0, z: 6 };
  const hookPos = new THREE.Vector3();
  const bendWorld = () => { hookRoot.updateWorldMatrix(true, false); return new THREE.Vector3(0, -.4, 0).applyMatrix4(hookRoot.matrixWorld); };
  // chapter layouts: [landscape, portrait] → hook [x, y, scale] and camera [x, y, z]. Portrait keeps the object in the DOM's
  // band (setBands) so the words below never sit on it.
  const L = {
    hero:     { hook: [[1.75, .1, 1], [.1, 1.2, .68]], cam: [[.9, .2, 6.2], [0, .25, 7.4]] },
    builders: { hook: [[2.0, .1, .92], [.05, 1.35, .56]], cam: [[1.0, .2, 6.4], [0, .3, 7.8]] },
    callers:  { hook: [[-2.6, .9, .5], [-1.2, 2.4, .26]], cam: [[.6, .2, 6.4], [0, .3, 7.6]] },
    holders:  { hook: [[1.9, .15, .8], [.05, 1.55, .42]], cam: [[1.0, .1, 6.4], [0, .3, 7.8]] },
    traders:  { hook: [[-2.6, .9, .5], [-1.25, 2.4, .26]], cam: [[.6, .2, 6.6], [0, .3, 8.0]] },
    close:    { hook: [[0, .3, .92], [0, 1.15, .7]], cam: [[0, .2, 5.6], [0, .25, 6.8]] },
  };
  const CH = ['hero', 'builders', 'callers', 'holders', 'traders', 'close'];
  const pick = (k) => { const a = L[k], i = PORT ? 1 : 0; return { h: a.hook[i], c: a.cam[i] }; };
  let bands = null;
  function layoutFor(p) {
    const i = clamp(Math.floor(p), 0, 5), u = p - i, a = pick(CH[i]), b = pick(CH[Math.min(i + 1, 5)]);
    const m = easeInOut(span(u, .65, 1)); // the hand-over happens in the last 35% of a chapter
    cam.x = lerp(a.c[0], b.c[0], m); cam.y = lerp(a.c[1], b.c[1], m); cam.z = lerp(a.c[2], b.c[2], m);
    let hx = lerp(a.h[0], b.h[0], m), hy = lerp(a.h[1], b.h[1], m), hs = lerp(a.h[2], b.h[2], m), bandY = null, bandH = 0;
    if (PORT && bands) {
      const ba = bands[i] || bands[bands.length - 1], bb = bands[Math.min(i + 1, 5)] || ba;
      const top = lerp(ba.top, bb.top, m), bot = lerp(ba.bottom, bb.bottom, m), Hw = 2 * cam.z * Math.tan(25 * Math.PI / 180);
      bandY = .15 + (.5 - (top + bot) / 2) * Hw; bandH = Math.max(0, (bot - top) - 32 / Math.max(1, H)) * Hw;
      const ch = CH[i], ext = ch === 'holders' ? 2.75 : 2.32; // the object's height per unit of hook scale (holders: the coins under the bend)
      hs = Math.min(hs, bandH / ext); hy = bandY + (ch === 'holders' ? .2 * hs : 0);
    }
    return { i, u, m, hx, hy, hs, bandY, bandH };
  }

  /* ---------- real events ---------- */
  let spring = null, studFlash = 0, forgeT = 0;
  const mountedAt = performance.now();
  const pointer = { x: 0, y: 0 }, pointerT = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { pointerT.x = (e.clientX / innerWidth - .5) * 2; pointerT.y = (e.clientY / innerHeight - .5) * 2; } }, { passive: true });
  function tug(side, usd = 0) {
    const k = Math.min(1, .35 + Math.log10(1 + usd) / 3.2);
    spring = { t0: t, a: (side === 'sell' ? -1.1 : side === 'burn' ? .7 : 1.6) * k * .07, y: (side === 'sell' ? -.05 : .1) * k };
    flashV = Math.max(flashV, .12 * k); zoomV = Math.max(zoomV, .03 * k);
  }
  const api = {
    hit(side, usd = 0) { tug(side, usd); const s = .5 + Math.min(1.6, Math.log10(1 + usd) / 2.2); burst(bendWorld(), { color: side, strength: s, up: side === 'sell' ? .2 : 1 }); if (side === 'burn') studFlash = 1; },
    call() { burst(bendWorld(), { color: 'call', strength: 1.3, up: 1.2 }); flashV = .2; zoomV = .04; },
    // a real burn: one coin on the floor burns into rising embers (the number of coins taken scales with the QHOOKS burned)
    burn(tok = 0) { tug('burn', tok); studFlash = 1; burnQueue += 1 + Math.min(2, Math.floor(Math.log10(1 + tok) / 3)); },
    coin(i) { if (i === nameIdx) coinFlash = 1; },
    setCall({ pct, label }) { callData = { pct, label }; },
    setBands(arr) { bands = Array.isArray(arr) && arr.length ? arr : null; },
    setProgress(p) { Pt = clamp(p, 0, 5.999); if (!running) api.resume(); },
    resume() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); },
    pause() { running = false; cancelAnimationFrame(raf); },
    dispose() { api.pause(); renderer.dispose(); },
    get running() { return running; },
    debug() { const low = new THREE.Vector3(0, -1.14, 0).applyMatrix4(hookRoot.matrixWorld).project(camera); const num = numberG.visible ? new THREE.Vector3(0, -.72, 0).applyMatrix4(numberG.matrixWorld).project(camera) : null;
      const pile = coinPile.filter((c) => c.visible); const pileLow = pile.length ? Math.max(...pile.map((c) => (1 - new THREE.Vector3(0, -.32, 0).applyMatrix4(c.matrixWorld).project(camera).y) / 2 * H)) : null;
      const nm = nameG.visible ? (1 - new THREE.Vector3(0, -.68, 0).applyMatrix4(nameG.matrixWorld).project(camera).y) / 2 * H : null;
      return { P, forgeT, hook: { visible: hookRoot.visible, pos: hookRoot.position.toArray(), scale: hookRoot.scale.x, bottomPx: (1 - low.y) / 2 * H }, numberBottomPx: num ? (1 - num.y) / 2 * H : null, vaultBottomPx: Math.max(pileLow || 0, nm || 0) || null, cam: camera.position.toArray(), parts: model.children.length, dpr: DPR, bands }; },
  };

  /* ---------- the frame ---------- */
  const tmpV = new THREE.Vector3();
  let lastChapter = -1;
  function frame(now) {
    if (!running) return;
    const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
    resize();
    P += (Pt - P) * (1 - Math.exp(-dt * 7));
    pointer.x += (pointerT.x - pointer.x) * (1 - Math.exp(-dt * 3)); pointer.y += (pointerT.y - pointer.y) * (1 - Math.exp(-dt * 3));
    const { i, u, hx, hy, hs, bandY, bandH } = layoutFor(P);
    const ch = CH[i];
    if (i !== lastChapter) { if (lastChapter >= 0) sweepT = 0; lastChapter = i; }
    forgeT = (now - mountedAt) / 1000;
    const forge = span(forgeT, .15, 2.4);

    // hook: position, scale, the slow idle turn and sway, the spring of a real hit
    hookPos.set(hx, hy, 0);
    hookRoot.position.copy(hookPos); hookRoot.scale.setScalar(hs * (ch === 'hero' ? lerp(.92, 1, forge) : 1));
    hookSpin.rotation.y = .2 + Math.sin(t * .21) * .6 + (PORT ? 0 : pointer.x * .18);
    hookSpin.rotation.z = -.05 + Math.sin(t * .5) * .02;
    hookRoot.rotation.set(0, 0, Math.sin(t * 1.25) * .018);
    if (spring) { const st = t - spring.t0, e = Math.exp(-st * 3.2); hookRoot.rotation.z += spring.a * e * Math.cos(st * 8.5); hookRoot.position.y += spring.y * e * Math.cos(st * 11); if (st > 2.6) spring = null; }
    hookRoot.visible = forge > .35;
    const heat = (1 - smooth(span(forgeT, 1.7, 3.3))) * (forge > .35 ? 1 : 0);
    steelMat.emissive.setRGB(1, .42, .1); steelMat.emissiveIntensity = heat * .7;
    studFlash = Math.max(0, studFlash - dt * 1.4); studMat.emissiveIntensity = .6 + 1.2 * heat + 1.6 * studFlash;
    particles.visible = forgeT < 3.3;
    pMat.uniforms.uAssemble.value = forge; pMat.uniforms.uTime.value = t; pMat.uniforms.uOpacity.value = 1 - easeOut(span(forgeT, 2.2, 3.1)); pMat.uniforms.uScatter.value = 0;
    threadMat.opacity = .9 * smooth(span(forgeT, 1.9, 2.7));
    if (forgeT > 2.2 && forgeT - dt <= 2.2) { flashV = .3; zoomV = .08; sweepT = 0; }

    // the set follows the hook
    key.target.position.copy(hookPos); key.position.set(hookPos.x - 4, 6, 6);
    rim.position.set(hookPos.x + 4, 2, -3);
    shaft.position.set(hookPos.x, 0, 0); shaftMat.opacity = (.1 + .02 * Math.sin(t * .37)) * (ch === 'callers' ? .6 : 1) + .15 * heat;
    dustMat.uniforms.uTime.value = t; dustMat.uniforms.uCenter.value.set(hookPos.x, .2, 0); dustMat.uniforms.uFocus.value = cam.z; dustMat.uniforms.uOpacity.value = ch === 'callers' ? .5 : 1;
    pool.position.x = plinth.position.x = hookPos.x; pool.scale.setScalar(hs); plinth.scale.set(hs, 1, hs);
    const plinthOn = ch !== 'callers' && ch !== 'traders' && !PORT; plinth.visible = pool.visible = plinthOn && hs > .55;
    floor.visible = !PORT;
    reflection.visible = hookRoot.visible && plinth.visible;
    if (reflection.visible) { reflection.position.set(hookRoot.position.x, 2 * PLINTH_TOP - hookRoot.position.y, hookRoot.position.z); reflection.scale.set(hookRoot.scale.x, -hookRoot.scale.y, hookRoot.scale.z); reflection.rotation.set(0, 0, -hookRoot.rotation.z); reflection.children.forEach((c) => { c.rotation.copy(hookSpin.rotation); c.position.copy(model.position).applyEuler(hookSpin.rotation); }); }
    backMat.uniforms.uGlow.value = (ch === 'close' ? .5 : .35) + .5 * heat; backMat.uniforms.uCenter.value.set(.5 + hookPos.x * .05, .5 + hookPos.y * .05);
    backMat.uniforms.uTint.value.setHex(ch === 'callers' ? 0x3edd8f : GOLD);
    bloom.strength = .3 + .4 * heat + .25 * studFlash;

    // ---- builders: blocks fly in and dock on the shank, one by one, by scroll
    const bOn = ch === 'builders' || (ch === 'callers' && u < .2) || (ch === 'hero' && u > .8);
    blockGroup.visible = bOn;
    if (bOn) {
      const bu = ch === 'builders' ? u : ch === 'callers' ? 1 : 0;
      const leave = ch === 'callers' ? easeInOut(span(u, 0, .2)) : 0;
      hookRoot.updateWorldMatrix(true, false);
      blocks.forEach((g, k) => {
        const dock = easeOutQuint(span(bu, .05 + k * .085, .3 + k * .085));
        const side = k % 2 ? 1 : -1, yy = .85 - k * .27;
        tmpV.set(.45 + side * .78, yy, .12).applyMatrix4(hookRoot.matrixWorld);
        const outX = side * (PORT ? 3.2 : 5.5), outY = hookPos.y + yy + (k % 3 - 1) * 1.2 - 1.6, outZ = 1.5;
        g.position.set(lerp(hookPos.x + outX, tmpV.x, dock), lerp(outY, tmpV.y, dock), lerp(outZ, tmpV.z, dock));
        g.position.x += leave * side * 6 * easeInOut(leave); g.position.y -= leave * 2;
        g.rotation.set(lerp(.9, .42, dock), lerp(side * 1.4, side * -.62, dock), lerp(side * .3, 0, dock));
        g.scale.setScalar(lerp(.55, 1, dock) * hs / .92 * (1 - leave * .5)); g.visible = dock > 0 && leave < 1;
        g.userData.led.material.color.setHex(dock >= .999 ? 0x9ff0c2 : GOLD_HI);
        if (dock > .999 && !g.userData.snapped) { g.userData.snapped = true; burst(g.position, { color: 'gold', strength: .45, up: .5 }); flashV = Math.max(flashV, .05); } if (dock < .5) g.userData.snapped = false;
      });
    }

    // ---- callers: the number rises as extruded type and counts to the real value
    const cOn = ch === 'callers' || (ch === 'builders' && u > .85) || (ch === 'holders' && u < .15);
    numberG.visible = numberSub.visible = cOn && callData.pct != null;
    if (numberG.visible) {
      const cu = ch === 'callers' ? u : ch === 'builders' ? 0 : 1;
      const rise = easeOutQuint(span(cu, 0, .22)), leave = ch === 'holders' ? easeInOut(span(u, 0, .15)) : 0;
      const target = callData.pct, shown = target * easeOut(span(cu, .08, .62));
      if (Math.abs(shown - callShown) > Math.max(.05, Math.abs(target) * .004) || callTexKey !== callData.label) {
        callShown = shown; callTexKey = callData.label;
        const pos = shown >= 0; const txt = (pos ? '+' : '') + (Math.abs(shown) >= 100 ? shown.toFixed(0) : shown.toFixed(1)) + '%';
        numberG.userData.planes.forEach((pl) => pl.material.map?.dispose());
        numberG.userData.setMap(textTex({ text: txt, w: 1536, h: 480, size: 380, weight: 900, color: pos ? '#3EDD8F' : '#FF5E64', tracking: -.06 }));
        numberSub.material.map?.dispose(); numberSub.material.map = textTex({ text: callData.label, w: 1536, h: 160, size: 50, weight: 680, color: 'rgba(244,241,233,.86)', stretch: 'normal', tracking: 0 }); numberSub.material.needsUpdate = true;
      }
      const nx = PORT ? 0 : 1.45, ny = PORT ? (bandY != null ? bandY + .25 : 1.5) : .35, sc = PORT ? Math.min(.56, bandH ? bandH / 2.1 : .56) : .74;
      numberG.position.set(nx, ny + (1 - rise) * -1.6 + leave * 1.4, lerp(-1.5, .2, rise) - leave * 3); numberG.scale.setScalar(sc * lerp(.86, 1, rise));
      numberG.rotation.set(-.08 + pointer.y * .05, PORT ? 0 : -.22 + pointer.x * .08, 0);
      numberG.userData.setOpacity(rise * (1 - leave));
      numberSub.position.set(nx, ny - 1.02 * sc, numberG.position.z + .02); numberSub.scale.setScalar(sc); numberSub.rotation.copy(numberG.rotation); numberSub.material.opacity = easeOut(span(cu, .15, .35)) * (1 - leave);
    }

    // ---- holders: QHOOKS coins drop onto the floor under the hook by scroll; a real burn takes one and it rises as embers
    const hOn = ch === 'holders' || (ch === 'callers' && u > .85) || (ch === 'traders' && u < .15);
    if (hOn) {
      const vu = ch === 'holders' ? u : ch === 'callers' ? 0 : 1, leave = ch === 'traders' ? easeInOut(span(u, 0, .15)) : 0;
      const pileY = PORT ? hookPos.y - 1.16 * hs - .02 : PLINTH_TOP + .035, spread = PORT ? hs * 2.1 : hs * 1.1, cs = PORT ? Math.max(.5, hs * 1.25) : .95;
      coinPile.forEach((c) => {
        const d = c.userData;
        if (vu < .03 && d.gone) { d.gone = false; d.burn = null; } // scrolling back in drops a fresh set
        const drop = easeOutQuint(span(vu, .04 + d.k * .06, .3 + d.k * .06));
        if (d.gone && d.respawn && t > d.respawn) { d.gone = false; d.respawn = 0; d.redrop = t; }
        const re = d.redrop ? easeOutQuint(span(t - d.redrop, 0, .8)) : 1;
        const fall = Math.min(drop, re);
        c.visible = fall > 0 && !d.gone && leave < 1;
        if (!c.visible) return;
        const x = hookPos.x + d.x * spread, z = d.z * spread * (PORT ? .35 : 1) + (PORT ? .5 : .2);
        c.position.set(x, pileY + (1 - fall) * 3.2 + (PORT ? .3 * cs : .12 * cs), z);
        c.rotation.set(PORT ? -1.3 + d.rot * .2 : Math.PI / 2 - .55 + d.rot * .3, d.rot * 1.3, 0);
        c.scale.setScalar(cs * (1 - leave * .6));
        if (fall > .999 && !d.landed) { d.landed = true; burst(c.position, { color: 'gold', strength: .1, up: .3, size: .3 }); } if (fall < .5) d.landed = false;
        // burning: the coin lifts, shrinks and goes dark while embers rise from it
        if (d.burn != null) {
          const bt = t - d.burn, e = span(bt, 0, 1.3);
          c.position.y += e * .5; c.scale.setScalar(cs * (1 - e * .85)); c.rotation.y += bt * 2.5;
          if (bt > .02 && !d.embered) { d.embered = true; burst(c.position, { color: 'ember', strength: .28, up: 2.2, size: .4 }); }
          if (e >= 1) { d.gone = true; d.burn = null; d.embered = false; d.landed = false; d.redrop = 0; d.respawn = t + 9; c.visible = false; }
        }
      });
      if (burnQueue > 0 && vu > .3) { const cand = coinPile.filter((c) => c.visible && c.userData.burn == null && !c.userData.gone); if (cand.length) { const c = cand[Math.floor(Math.random() * cand.length)]; c.userData.burn = t; burnQueue--; flashV = Math.max(flashV, .12); } else burnQueue = 0; }
    } else coinPile.forEach((c) => (c.visible = false));

    // ---- traders: the chain names slam in as type, one after another, by scroll; the coin flips to each chain as it lands
    const tOn = ch === 'traders' || (ch === 'holders' && u > .85) || (ch === 'close' && u < .2);
    nameG.visible = chainCoin.visible = tOn;
    if (tOn) {
      const tu = ch === 'traders' ? u : ch === 'holders' ? 0 : 1, leave = ch === 'close' ? easeInOut(span(u, 0, .2)) : 0;
      const slot = .112, k = clamp(Math.floor((tu - .04) / slot), 0, CHAIN_NAMES.length - 1), at = .04 + k * slot, slam = easeOutQuint(span(tu, at, at + .06));
      if (k !== nameIdx) { nameIdx = k; nameG.userData.setMap(nameTex[k]); chainCoin.userData.setMap(chainTex[k] || qTex); flashV = Math.max(flashV, .08); zoomV = Math.max(zoomV, .03); }
      const sc = PORT ? Math.min(.5, bandH ? bandH / 2.9 : .5) : .8, nx = PORT ? .25 : 1.6, ny = PORT ? (bandY != null ? bandY - .15 * sc : 1.3) : .1;
      nameG.position.set(nx, ny, lerp(-.8, .3, slam) - leave * 3); nameG.scale.setScalar(sc * lerp(1.3, 1, slam)); nameG.userData.setOpacity(slam * (1 - leave) * (tu > .02 ? 1 : 0));
      nameG.rotation.set(-.06 + pointer.y * .04, PORT ? 0 : -.18 + pointer.x * .06, 0);
      const cs = PORT ? sc * 1.15 : 1.0;
      chainCoin.position.set(nx + (PORT ? 0 : .1), ny + (PORT ? 1.02 * sc : 1.45), .6); chainCoin.scale.setScalar(cs * (1 - leave * .5) * (1 + .25 * coinFlash));
      chainCoin.rotation.set(.12, Math.PI * 2 * slam + .25 + Math.sin(t * .7) * .12, 0); chainCoin.visible = tu > .02 && leave < 1;
      coinFlash = Math.max(0, coinFlash - dt * 1.5); chainCoin.children[0].material = coinFlash > .05 ? studMat : goldMat;
    } else nameIdx = -1;

    bursts.forEach((b) => { if (!b.visible) return; b.material.uniforms.uT.value += dt; if (b.material.uniforms.uT.value > 1.4) b.visible = false; });

    // post: the sweep after a chapter lands, flashes and kicks from real hits
    sweepT += dt; const su = span(sweepT, 0, .55);
    if (su > 0 && su < 1) { G.uSweep.value = -.3 + su * 1.9; sweep.intensity = 6 * Math.sin(su * Math.PI); sweep.position.set(hookPos.x - 3 + su * 6, 2 - su, 3); } else { G.uSweep.value = -2; sweep.intensity = 0; }
    flashV = Math.max(0, flashV - dt * 2.2); zoomV = Math.max(0, zoomV - dt * .4);
    G.uFlash.value = flashV; G.uZoom.value = zoomV; G.uTime.value = t; G.uAb.value = .004 + .02 * zoomV;

    camera.position.set(cam.x + pointer.x * .12, cam.y + .04 * Math.sin(t * .3) - pointer.y * .08, cam.z);
    camera.lookAt(cam.x * .55, PORT ? .15 : cam.y * .6, 0);
    camera.fov = PORT ? 50 : 34; camera.updateProjectionMatrix();
    composer.render();
    raf = requestAnimationFrame(frame);
  }
  resize();
  return api;
}
