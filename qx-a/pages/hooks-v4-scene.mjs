// /hooks v4 (2026-11-12): the lit set for the Builders Lab. The same stage as /create and Portfolio (the pre-rendered
// void with its light shaft, dust and polished floor from /qx-a/set/), with the live object on top in real PBR:
// the QHooks hook (brushed steel, gold eye, collar and studs) hanging in the shaft, and a launch block (the v6 film
// prop, /qx-a/props/launch-block.glb) that seats onto its shank. The block's glass face carries real data from the
// page: the latest trade that ran through launch blocks, or the count of launches running blocks. Motion comes
// from real events only: the block seats when the page opens, re-seats when a trade runs through (the page's own
// live rows), and otherwise only sways. Reduced motion: one still frame. Paused off screen and in background tabs.
// Camera, floor and plate crop match /qx-a/scene3d.mjs so the floor reflection lands on the plate's floor.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Object3D, BoxGeometry, PlaneGeometry, TorusGeometry, CylinderGeometry,
  TubeGeometry, ConeGeometry, SphereGeometry, CatmullRomCurve3, BufferGeometry, BufferAttribute, Points, ShaderMaterial,
  MeshPhysicalMaterial, MeshBasicMaterial, MeshStandardMaterial, CanvasTexture, SRGBColorSpace, ACESFilmicToneMapping, PMREMGenerator,
  Color, Vector2, Vector3, Quaternion, BackSide, DoubleSide, AdditiveBlending, RepeatWrapping, SpotLight, PointLight, AmbientLight, DirectionalLight,
} from '/qx-a/vendor/three/three.module.js';
import { GLTFLoader } from '/qx-a/vendor/three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from '/qx-a/vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '/qx-a/vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/qx-a/vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/qx-a/vendor/three/addons/postprocessing/OutputPass.js';
import { mintedArt } from '/qx-a/minted.mjs';

const PLATE = { w: 1080, h: 1350 }, CAM = { fov: 36, pos: [0, 1.6, 12.5], look: [0, .9, 0] }, FLOOR_Y = -1.62, GOLD = 0xd2ad72;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
// glow pass (2026-11-12, Randall: "add the glow and denser dust"): full on desktop and capable phones; lighter on low-power or Save-Data
const LOW = !!(navigator.connection?.saveData || matchMedia('(prefers-reduced-data: reduce)').matches || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory && navigator.deviceMemory <= 4));
const WIDE = matchMedia('(min-width: 900px)').matches;
const BLOOM = { strength: .22, radius: .28, threshold: 1.0 }; // only HDR highlights (> 1) bloom: speculars on the gold, never the type or the face
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeInOut = (t) => { t = Math.min(1, Math.max(0, t)); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const BLOCK_K = 1.42, SEAT_Y = 1.5, SEAT = new Vector3(0, SEAT_Y, .126 * BLOCK_K); // the block's seat on the shank (PROPS.md: seat at block-local (0,0,-.126))

// the warm strip-light room the gold and steel reflect (the same room as scene3d.mjs and the film)
function roomScene() {
  const s = new Scene(), v = (x, y, z) => new Vector3(x, y, z);
  const strip = (w, h, at, color, k) => { const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color, side: DoubleSide })); m.material.color.multiplyScalar(k); m.position.copy(at); m.lookAt(0, 0, 0); s.add(m); };
  s.add(new Mesh(new BoxGeometry(40, 40, 40), new MeshBasicMaterial({ color: 0x0a0b0a, side: BackSide })));
  strip(14, 1.2, v(0, 9, 0), new Color(0xfff4d0), 2.2); strip(1.4, 12, v(-10, 2, 4), new Color(0xf0d6a0), 1.4); strip(1, 12, v(10, -1, -3), new Color(0xd2ad72), 1.8);
  strip(10, .6, v(0, -9, 2), new Color(0x8e6c3a), 1.5); strip(12, 5, v(0, 5, 10), new Color(0xfff6dc), 1.7); strip(4, 8, v(-7, 1, 8), new Color(0xf6dfae), .9);
  return s;
}
// brushed steel: streaked noise along u, turned into a normal map
function brushedNormal() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) { let vv = rnd(); for (let i = 0; i < S; i++) { vv = vv * .86 + rnd() * .14; h[y * S + i] = vv; } }
  const img = x.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let i = 0; i < S; i++) {
    const l = h[y * S + ((i - 1 + S) % S)], r = h[y * S + ((i + 1) % S)], u = h[((y - 1 + S) % S) * S + i], d = h[((y + 1) % S) * S + i];
    const nx = (l - r) * .5, ny = (u - d) * 2.2, len = Math.hypot(nx, ny, 1), o = (y * S + i) * 4;
    img.data[o] = (nx / len * .5 + .5) * 255; img.data[o + 1] = (ny / len * .5 + .5) * 255; img.data[o + 2] = (1 / len * .5 + .5) * 255; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(1, 6); return t;
}

// the hook: shank, bend and point as one tube; eye, collar and studs in gold (after /qx-a/img/hook-cut.png)
function buildHook(steel, gold) {
  const g = new Group();
  const pts = [[0, 3.15], [0, 2.4], [0, 1.2], [0, .45], [-.02, .05], [-.2, -.42], [-.62, -.7], [-1.08, -.6], [-1.4, -.22], [-1.48, .25], [-1.4, .66]].map(([x, y]) => new Vector3(x, y, 0));
  const curve = new CatmullRomCurve3(pts, false, 'catmullrom', .5);
  const tube = new Mesh(new TubeGeometry(curve, 160, .08, 14, false), steel); g.add(tube);
  const tip = curve.getPoint(1), tan = curve.getTangent(1).normalize();
  const point = new Mesh(new ConeGeometry(.08, .42, 14), steel); point.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), tan);
  point.position.copy(tip).addScaledVector(tan, .17); g.add(point);
  const barb = new Mesh(new ConeGeometry(.055, .3, 10), steel); barb.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), new Vector3(-.5, .45, 0).normalize());
  barb.position.copy(tip).add(new Vector3(-.03, .02, 0)); g.add(barb);
  const eye = new Mesh(new TorusGeometry(.23, .072, 14, 40), gold); eye.position.set(0, 3.38, 0); g.add(eye);
  const collar = new Mesh(new CylinderGeometry(.108, .108, .4, 24), gold); collar.position.set(0, 2.88, 0); g.add(collar);
  for (let i = 0; i < 7; i++) { const r = new Mesh(new TorusGeometry(.108, .012, 6, 28), gold); r.rotation.x = Math.PI / 2; r.position.set(0, 2.72 + i * .052, 0); g.add(r); }
  const studGeo = new BoxGeometry(.075, .05, .085);
  for (let t = .52; t <= .98; t += .036) { // studs on the outside of the bend
    const p = curve.getPoint(t), tn = curve.getTangent(t), out = new Vector3(tn.y, -tn.x, 0).normalize(); if (out.dot(new Vector3(p.x + .74, p.y + .2, 0)) < 0) out.negate();
    const s = new Mesh(studGeo, gold); s.position.copy(p).addScaledVector(out, .078); s.lookAt(s.position.clone().add(out)); s.rotateX(Math.PI / 2); g.add(s);
  }
  return g;
}

// the block's glass face: a canvas of real data, lit as dark glass with gold type
function faceCanvas({ title, sub, note, index, img, sym }) {
  const W = 1024, H = 614, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const bg = x.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#15171a'); bg.addColorStop(.55, '#0a0b0b'); bg.addColorStop(1, '#131312');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const sheen = x.createLinearGradient(0, 0, W * .6, H); sheen.addColorStop(0, 'rgba(255,240,210,.10)'); sheen.addColorStop(.5, 'rgba(255,240,210,0)'); x.fillStyle = sheen; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(232,200,140,.35)'; x.lineWidth = 2; x.strokeRect(28, 28, W - 56, H - 56);
  x.strokeStyle = 'rgba(232,200,140,.7)'; x.lineWidth = 3; // corner ticks
  for (const [cx, cy, sx, sy] of [[28, 28, 1, 1], [W - 28, 28, -1, 1], [28, H - 28, 1, -1], [W - 28, H - 28, -1, -1]]) { x.beginPath(); x.moveTo(cx, cy + sy * 34); x.lineTo(cx, cy); x.lineTo(cx + sx * 34, cy); x.stroke(); }
  x.textBaseline = 'alphabetic'; x.fillStyle = 'rgba(232,200,140,.85)'; x.font = '700 24px "Mona Sans", system-ui, sans-serif'; x.letterSpacing = '4px';
  x.fillText(index, 72, 96); x.textAlign = 'right'; x.fillText('LAUNCH BLOCK', W - 72, 96); x.textAlign = 'left'; x.letterSpacing = '0px';
  let tx = 72;
  const art = img ? mintedArt(img, 300) : null;
  if (art || sym) { // the token minted into gold
    const R = 92, cx = 72 + R, cy = H / 2 + 10; const rg = x.createRadialGradient(cx - R * .4, cy - R * .5, R * .1, cx, cy, R * 1.1);
    rg.addColorStop(0, '#fff2cf'); rg.addColorStop(.4, '#e4c284'); rg.addColorStop(1, '#6e5021'); x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fill();
    x.save(); x.beginPath(); x.arc(cx, cy, R * .82, 0, Math.PI * 2); x.clip();
    if (art) x.drawImage(art, cx - R * .82, cy - R * .82, R * 1.64, R * 1.64);
    else { x.fillStyle = 'rgba(40,28,10,.55)'; x.font = '880 110px "Mona Sans", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(sym.slice(0, 1).toUpperCase(), cx, cy + 6); x.textAlign = 'left'; x.textBaseline = 'alphabetic'; }
    x.restore(); x.lineWidth = 3; x.strokeStyle = 'rgba(255,244,214,.6)'; x.beginPath(); x.arc(cx, cy, R * .9, 0, Math.PI * 2); x.stroke();
    tx = 72 + R * 2 + 44;
  }
  x.fillStyle = '#f3efe6'; x.font = '880 92px "Mona Sans", system-ui, sans-serif'; x.letterSpacing = '-3px';
  let t = title; while (x.measureText(t).width > W - tx - 72 && t.length > 4) t = t.slice(0, -2) + '…';
  x.fillText(t, tx, H / 2 + 6); x.letterSpacing = '0px';
  x.fillStyle = 'rgba(243,239,230,.62)'; x.font = '500 34px "Mona Sans", system-ui, sans-serif'; x.fillText(sub, tx, H / 2 + 64);
  x.fillStyle = 'rgba(232,200,140,.75)'; x.font = '700 22px "Mona Sans", system-ui, sans-serif'; x.letterSpacing = '3px'; x.fillText(note.toUpperCase(), 72, H - 72); x.letterSpacing = '0px';
  const vg = x.createRadialGradient(W * .5, H * .5, H * .3, W * .5, H * .5, W * .75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)'); x.fillStyle = vg; x.fillRect(0, 0, W, H);
  return c;
}

const CSS = `.hk4-set{position:absolute;inset:0;overflow:hidden;background:#050605}.hk4-set>video,.hk4-set>canvas{position:absolute;inset:0;width:100%;height:100%;display:block}.hk4-set>video{object-fit:cover}
.hk4-grain{position:absolute;inset:-50%;pointer-events:none;opacity:.09;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.4 -.2'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");animation:hk4-grain .5s steps(5) infinite}
@keyframes hk4-grain{0%{transform:translate(0,0)}20%{transform:translate(-7%,4%)}40%{transform:translate(5%,-6%)}60%{transform:translate(-3%,8%)}80%{transform:translate(8%,2%)}}
@media (prefers-reduced-motion:reduce){.hk4-grain{animation:none}}`;

export function mountHookSet(host, { posY = .62, plate = '/qx-a/set/', prop = '/qx-a/props/launch-block.glb' } = {}) {
  if (!document.getElementById('hk4-css')) document.head.append(Object.assign(document.createElement('style'), { id: 'hk4-css', textContent: CSS }));
  const cv = document.createElement('canvas'); let renderer;
  try { renderer = new WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'high-performance' }); } catch { return null; }
  if (!renderer.getContext()) return null;
  const stage = document.createElement('div'); stage.className = 'hk4-set'; stage.setAttribute('aria-hidden', 'true');
  const video = document.createElement('video'); video.muted = true; video.loop = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('muted', ''); video.preload = 'auto';
  video.poster = `${plate}set-create.webp`;
  for (const [ext, type] of [['webm', 'video/webm'], ['mp4', 'video/mp4']]) { const s = document.createElement('source'); s.src = `${plate}set-create.${ext}`; s.type = type; video.append(s); }
  video.style.objectPosition = `50% ${posY * 100}%`;
  const grain = document.createElement('div'); grain.className = 'hk4-grain';
  stage.append(video, cv, grain); host.append(stage);
  renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1; renderer.outputColorSpace = SRGBColorSpace; renderer.setClearColor(0, 0);
  const scene = new Scene(); scene.environment = new PMREMGenerator(renderer).fromScene(roomScene(), .04).texture;
  const cam = new PerspectiveCamera(CAM.fov, PLATE.w / PLATE.h, .1, 100); cam.position.set(...CAM.pos); cam.lookAt(...CAM.look);
  // the glow: a restrained bloom over the HDR frame (gold speculars, the eye, studs, the block's edge); type and the face stay under its threshold
  const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, cam));
  const bloom = new UnrealBloomPass(new Vector2(256, 256), BLOOM.strength, BLOOM.radius, BLOOM.threshold); composer.addPass(bloom); composer.addPass(new OutputPass());
  // lights: the shaft from above, a gold rim from behind right, a cool edge, a low fill
  const key = new SpotLight(0xffe6c4, 70, 0, .42, .85, 1.2); key.position.set(0, 6.4, 1.2); key.target.position.set(0, FLOOR_Y + .8, 0); scene.add(key, key.target);
  const rim = new PointLight(GOLD, 22, 0, 1.4); rim.position.set(3.4, 1.6, -3); scene.add(rim);
  const edge = new DirectionalLight(0xcfe0ff, 1.4); edge.position.set(-5, 4, -2); scene.add(edge);
  scene.add(new AmbientLight(0x1a1918, .6));
  // materials (the film's)
  const steel = new MeshPhysicalMaterial({ color: 0xcbc6bc, metalness: 1, roughness: .32, clearcoat: .3, clearcoatRoughness: .2, envMapIntensity: 1.15, normalMap: brushedNormal(), normalScale: new Vector2(.22, .22) });
  const gold = new MeshPhysicalMaterial({ color: GOLD, metalness: 1, roughness: .26, clearcoat: .3, clearcoatRoughness: .3, envMapIntensity: 1.6, emissive: GOLD, emissiveIntensity: .05 });
  const slab = new MeshPhysicalMaterial({ color: 0x0c0d0c, metalness: .5, roughness: .5, clearcoat: .3, clearcoatRoughness: .4 });
  const glass = new MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: .08, clearcoat: 1, clearcoatRoughness: .06, envMapIntensity: .9 });
  // the assembly swings from the eye
  const pivot = new Group(); pivot.position.set(0, 3.38, 0); pivot.scale.setScalar(1.16); scene.add(pivot); // the assembly swings from the eye; scaled about it so it fills the band
  const rig = new Group(); rig.position.set(0, -3.38, 0); pivot.add(rig);
  rig.add(buildHook(steel, gold));
  const block = new Group(); block.visible = false; rig.add(block);
  let faceMesh = null, faceCv = null;
  // the floor reflection: the same objects mirrored under the floor, faint
  const mirror = new Group(); mirror.scale.y = -1; mirror.position.y = 2 * FLOOR_Y; scene.add(mirror);
  const mPivot = new Group(); mPivot.position.copy(pivot.position); mPivot.scale.copy(pivot.scale); mirror.add(mPivot);
  const ghost = (m) => { const c = m.clone(); c.transparent = true; c.opacity = .22; c.depthWrite = false; return c; };
  const gSteel = ghost(steel), gGold = ghost(gold), gSlab = ghost(slab), gGlass = ghost(glass);
  const mRig = rig.clone(true); mRig.traverse((o) => { if (o.isMesh) o.material = o.material === steel ? gSteel : gGold; }); mPivot.add(mRig);
  let mBlock = null;
  // dust in the shaft: fine, slow, additive
  const N = LOW ? 1200 : WIDE ? 5000 : 2200, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 2.4; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = FLOOR_Y + Math.random() * 7; pos[i * 3 + 2] = Math.sin(a) * r * .6; seed[i] = Math.random(); }
  const dustGeo = new BufferGeometry(); dustGeo.setAttribute('position', new BufferAttribute(pos, 3)); dustGeo.setAttribute('seed', new BufferAttribute(seed, 1));
  // depth of field: motes near the hook's plane are small and sharp, those nearer or farther are bigger and softer
  const dustMat = new ShaderMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, uniforms: { uT: { value: 0 }, uPx: { value: 1 }, uA: { value: .8 } },
    vertexShader: 'attribute float seed; uniform float uT; uniform float uPx; varying float vS; varying float vD; varying float vTw; void main(){ vS = seed; vec3 p = position; p.y = -1.62 + mod(p.y + 1.62 - uT * (.07 + .11 * seed), 7.0); p.x += sin(uT * .4 + seed * 20.0) * .12; vD = clamp(abs(p.z) * .8 + abs(p.x) * .12, 0.0, 1.0); vTw = .55 + .45 * sin(uT * (1.5 + seed * 2.5) + seed * 60.0); vec4 mv = modelViewMatrix * vec4(p,1.0); gl_PointSize = (1.1 + seed * 2.4) * (1.0 + vD * 2.4) * uPx * (12.5 / -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform float uA; varying float vS; varying float vD; varying float vTw; void main(){ float r = length(gl_PointCoord - .5) * 2.0; float edge = mix(.3, .0, vD); float a = (1.0 - smoothstep(edge, 1.0, r)) * uA * (.3 + .7 * vS) * (1.0 - .6 * vD) * vTw; gl_FragColor = vec4(vec3(1.0, .88, .64) * a, a); }' });
  scene.add(new Points(dustGeo, dustMat));

  let W = 1, H = 1, raf = 0, visible = true, t0 = performance.now(), seatAt = -1e9, pulseAt = -1e9, swing = 0, swingV = 0, seated = false;
  function size() {
    const r = stage.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    const dpr = Math.min(devicePixelRatio || 1, LOW ? 1.25 : W < 700 ? 1.75 : 2); renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    composer.setPixelRatio(dpr); composer.setSize(W, H); if (LOW || W < 700) bloom.setSize(W * dpr * .5, H * dpr * .5); // lighter bloom resolution on phones and low-power
    const l = Math.max(W / PLATE.w, H / PLATE.h), cw = W / l, ch = H / l;
    cam.setViewOffset(PLATE.w, PLATE.h, (PLATE.w - cw) / 2, (PLATE.h - ch) * posY, cw, ch); cam.updateProjectionMatrix();
    dustMat.uniforms.uPx.value = dpr * l;
  }
  function setFaceCanvas(c) {
    if (!faceMesh) return; faceCv = c;
    const old = faceMesh.material.map; const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.anisotropy = 4; t.flipY = false; // the glTF face's UV is already flipped
    faceMesh.material.map = t; faceMesh.material.emissiveMap = t; faceMesh.material.needsUpdate = true; old?.dispose();
    if (mBlock) { const mf = mBlock.getObjectByName('face'); if (mf) { mf.material.map = t; mf.material.needsUpdate = true; } }
  }
  let pendingFace = null;
  const loaded = new GLTFLoader().loadAsync(prop).then((g) => {
    const root = g.scene;
    root.traverse((o) => { if (!o.isMesh) return; const n = o.material?.name || ''; if (n === 'Gold') o.material = gold; else if (n === 'Slab') o.material = slab; else if (o.name === 'face') { faceMesh = o; o.material = new MeshStandardMaterial({ color: 0xffffff, roughness: .18, metalness: .1, emissive: 0xffffff, emissiveIntensity: .62, envMapIntensity: .35 }); } else o.material = slab; });
    // a glass pane over the face, for the room's reflection
    const pane = new Mesh(new PlaneGeometry(1.5, .9), glass); pane.position.z = .062; pane.material.transparent = true; pane.material.opacity = .18; root.add(pane);
    block.add(root); block.position.copy(SEAT); block.scale.setScalar(BLOCK_K); block.visible = seated;
    mBlock = block.clone(true); mBlock.traverse((o) => { if (!o.isMesh) return; o.material = o.material === gold ? gGold : o.material === glass ? gGlass : o.name === 'face' ? ghost(o.material) : gSlab; }); mRig.add(mBlock);
    if (pendingFace) setFaceCanvas(pendingFace); go();
  }).catch((e) => { console.warn('hooks-v4: launch block', e?.message || e); });
  function frame(now) {
    raf = 0; const t = RM ? 0 : (now - t0) / 1000, dt = 1 / 60;
    const since = (now - seatAt) / 1000, sp = (now - pulseAt) / 1000;
    // the sway: a slow pendulum from the eye, plus the tug when the block lands
    swingV += (-swing * 4.5 - swingV * 1.2) * dt; swing += swingV * dt;
    pivot.rotation.z = RM ? .02 : Math.sin(t * .55) * .028 + swing; pivot.rotation.y = RM ? -.18 : -.18 + Math.sin(t * .31) * .14;
    if (block.visible) {
      let k = RM ? 1 : easeInOut(since / 1.5), lift = 0, ry = 0;
      if (!RM && since < 1.5) { block.position.set(0, SEAT_Y + .55 * (1 - k), SEAT.z + 2.1 * (1 - k)); ry = -.7 * (1 - k); if (since > 1.38 && since < 1.5 && !block.userData.tugged) { block.userData.tugged = true; swingV -= .22; } }
      else if (!RM && sp < .95) { const u = Math.sin(Math.min(1, sp / .95) * Math.PI); lift = .14 * u; block.position.set(0, SEAT_Y + lift, SEAT.z + .35 * u); ry = -.25 * u; if (sp > .8 && !block.userData.tug2) { block.userData.tug2 = true; swingV -= .12; } }
      else block.position.copy(SEAT);
      block.rotation.set(0, ry, 0);
      if (mBlock) { mBlock.position.copy(block.position); mBlock.rotation.copy(block.rotation); }
    }
    key.intensity = 70 * (1 + .35 * Math.max(0, 1 - sp / 1.2)); bloom.strength = BLOOM.strength + .22 * Math.max(0, 1 - sp / 1.2);
    dustMat.uniforms.uT.value = t; dustMat.uniforms.uA.value = .7 + .4 * Math.max(0, 1 - sp / 1.4);
    mPivot.rotation.copy(pivot.rotation);
    composer.render();
    if (!RM && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }
  const go = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const play = () => { if (RM) return; const p = video.play(); p?.catch?.(() => {}); };
  size(); new ResizeObserver(() => { size(); go(); }).observe(stage);
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible) { play(); go(); } else video.pause(); }).observe(stage);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { play(); go(); } });
  play(); go();
  const api = {
    stage, _dbg: () => ({ seated, vis: block.visible, kids: block.children.length, pos: block.position.toArray(), face: !!faceMesh, mb: !!mBlock, mbVis: mBlock?.visible }),
    /** The face's data: { title, sub, note, index, img, sym }. */
    setFace(data) { const c = faceCanvas(data); if (faceMesh) setFaceCanvas(c); else pendingFace = c; go(); },
    /** The block seats onto the hook (page open). */
    form() { seated = true; block.visible = !!block.children.length; block.userData.tugged = false; seatAt = performance.now(); loaded.then(() => { block.visible = true; go(); }); go(); },
    /** A trade ran through: the block lifts and re-seats, the light flares. */
    pulse() { if (!seated) return this.form(); block.userData.tug2 = false; pulseAt = performance.now(); go(); },
  };
  stage.hk4 = api; return api;
}
