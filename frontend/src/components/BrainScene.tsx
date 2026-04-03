import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const P_ = [151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,
  103,30,69,142,8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,
  94,252,219,203,117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,
  168,68,175,74,165,71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,
  211,133,230,220,105,92,41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,
  80,73,209,76,132,187,208,89,18,169,200,196,135,130,116,188,159,86,164,100,
  109,198,173,186,3,64,52,217,226,250,124,123,5,202,38,147,118,126,255,82,
  85,212,207,206,59,227,47,16,58,17,182,189,28,42,223,183,170,213,119,248,
  152,2,44,154,163,70,221,153,101,155,167,43,172,9,129,22,39,253,19,98,108,
  110,79,113,224,232,178,185,112,104,218,246,97,228,251,34,242,193,238,210,
  144,12,191,179,162,241,81,51,145,235,249,14,239,107,49,192,214,31,181,199,
  106,157,184,84,204,176,115,121,50,45,127,4,150,254,138,236,205,93,222,114,
  67,29,24,72,243,141,128,195,78,66,215,61,156,180];
const PM = new Uint8Array(512);
for (let i = 0; i < 256; i++) { PM[i] = P_[i]; PM[i + 256] = P_[i]; }

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lrp  = (a: number, b: number, t: number) => a + t * (b - a);

function grad3(h: number, x: number, y: number, z: number) {
  const hh = h & 15;
  const u = hh < 8 ? x : y;
  const v = hh < 4 ? y : (hh === 12 || hh === 14 ? x : z);
  return ((hh & 1) === 0 ? u : -u) + ((hh & 2) === 0 ? v : -v);
}

function perlin3(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = PM[X]+Y, AA = PM[A]+Z, AB = PM[A+1]+Z;
  const B = PM[X+1]+Y, BA = PM[B]+Z, BB = PM[B+1]+Z;
  return lrp(
    lrp(lrp(grad3(PM[AA],x,y,z),      grad3(PM[BA],x-1,y,z),   u),
        lrp(grad3(PM[AB],x,y-1,z),    grad3(PM[BB],x-1,y-1,z), u), v),
    lrp(lrp(grad3(PM[AA+1],x,y,z-1),  grad3(PM[BA+1],x-1,y,z-1),u),
        lrp(grad3(PM[AB+1],x,y-1,z-1),grad3(PM[BB+1],x-1,y-1,z-1),u), v),
    w);
}

function ridged(x: number, y: number, z: number) {
  return 1 - Math.abs(perlin3(x, y, z));
}

function brainFBM(x: number, y: number, z: number): number {
  let v = 0;
  v += ridged(x * 2.2, y * 2.2, z * 2.2) * 0.08;
  v += ridged(x * 4.5, y * 4.5, z * 4.5) * 0.04;
  v += perlin3(x * 9,  y * 9,  z * 9)  * 0.018;
  v += perlin3(x * 18, y * 18, z * 18) * 0.008;
  return v;
}

function buildCerebrumGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(1, 5);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const len = Math.sqrt(x*x + y*y + z*z);
    x /= len; y /= len; z /= len;

    const bx = x * 1.0, by = y * 0.82, bz = z * 1.12;

    const fissureGauss = Math.exp(-(bx * bx) / 0.008);
    const fissureTop   = Math.max(0, by + 0.15);
    const fissureDepth = 0.13 * fissureGauss * fissureTop;

    const latAngle = Math.atan2(by, Math.abs(bx));
    const sylvian  = Math.exp(-((latAngle + 0.25) ** 2) / 0.015)
                   * Math.max(0, Math.abs(bx) - 0.2) * 0.18;

    const noise     = brainFBM(bx, by, bz);
    const flatBot   = by < -0.55 ? 0.08 * (-0.55 - by) : 0;
    const scale     = 1.0 + noise - fissureDepth - sylvian - flatBot;

    pos.setXYZ(i, bx * scale, by * scale, bz * scale);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildCerebellumGeometry(): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.38, 4);
  const pos = geo.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const len = Math.sqrt(x*x + y*y + z*z);
    x /= len; y /= len; z /= len;

    const bx = x * 0.38, by = y * 0.22, bz = z * 0.32;
    const n = ridged(bx * 12 + 100, by * 12, bz * 12) * 0.018
            + perlin3(bx * 24 + 100, by * 24, bz * 24) * 0.008;
    pos.setXYZ(i, bx * (1 + n), by * (1 + n), bz * (1 + n));
  }
  geo.computeVertexNormals();
  return geo;
}

const BRAIN_VS = `
varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec3 vLocalPos;
varying float vAO;
uniform float uTime;

void main() {
  vNormal   = normalize(normalMatrix * normal);
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vLocalPos = position;
  vAO       = length(position);

  float breath = 1.0 + 0.003 * sin(uTime * 0.8);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position * breath, 1.0);
}
`;

const BRAIN_FS = `
varying vec3  vNormal;
varying vec3  vWorldPos;
varying vec3  vLocalPos;
varying float vAO;
uniform float uTime;
uniform float uOpacity;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);

  vec3 L1 = normalize(vec3(1.0, 1.0, 0.5));
  vec3 L2 = normalize(vec3(-0.5, 0.3, -1.0));

  float w1 = max(dot(N, L1) * 0.5 + 0.5, 0.0);
  float w2 = max(dot(N, L2) * 0.5 + 0.5, 0.0);

  vec3 base = vec3(0.76, 0.66, 0.62);
  vec3 diff = base * (w1 * 0.7 * vec3(1.0, 0.96, 0.91) + w2 * 0.3 * vec3(0.72, 0.82, 1.0));

  float ao = smoothstep(0.70, 1.02, vAO);
  diff *= (0.55 + 0.45 * ao);

  float sss  = pow(max(dot(V, -(L1 + N * 0.5)), 0.0), 3.0) * 0.12;
  vec3  sssC = vec3(1.0, 0.42, 0.35) * sss;

  float fres = pow(1.0 - max(dot(V, N), 0.0), 3.5);
  vec3  rim  = vec3(0.024, 0.714, 0.831) * fres * 0.4;

  vec3 H    = normalize(L1 + V);
  float spec = pow(max(dot(N, H), 0.0), 50.0) * 0.1;

  float scanY = sin(uTime * 0.35) * 1.3;
  float scan  = exp(-pow((vLocalPos.y - scanY) / 0.04, 2.0)) * 0.3;
  vec3  scanC = vec3(0.02, 0.72, 0.84) * scan;

  vec3 color = diff + sssC + rim + vec3(spec) + scanC;

  float alpha = uOpacity * (0.25 + 0.75 * fres);
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.9));
}
`;

function createTissue(): THREE.Group {
  const g = new THREE.Group();

  const wm = new THREE.Mesh(
    (() => {
      const s = new THREE.SphereGeometry(0.56, 28, 28);
      s.scale(1.05, 0.88, 1.1);
      return s;
    })(),
    new THREE.MeshPhysicalMaterial({
      color: 0xc5b0ad, roughness: 0.7, metalness: 0,
      transparent: true, opacity: 0.28, depthWrite: false,
    }),
  );
  wm.renderOrder = 1;
  g.add(wm);

  const dn = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 20, 20),
    new THREE.MeshPhysicalMaterial({
      color: 0xa08880, roughness: 0.8,
      transparent: true, opacity: 0.38, depthWrite: false,
    }),
  );
  dn.scale.set(0.9, 0.78, 1.05);
  dn.position.set(0.04, -0.06, 0.05);
  dn.renderOrder = 1;
  g.add(dn);

  return g;
}

function createVessels(count: number): THREE.Group {
  const g = new THREE.Group();

  for (let i = 0; i < count; i++) {
    const isArtery = i % 3 === 0;
    const start = new THREE.Vector3(
      (Math.random() - 0.5) * 0.9,
      (Math.random() - 0.5) * 0.8,
      (Math.random() - 0.5) * 0.9,
    );
    const pts: THREE.Vector3[] = [start];
    const segs = 4 + Math.floor(Math.random() * 3);
    for (let s = 1; s <= segs; s++) {
      const t = s / segs;
      pts.push(new THREE.Vector3(
        start.x * (1 - t) + (Math.random() - 0.5) * 0.55 * t,
        start.y * (1 - t) + (Math.random() - 0.5) * 0.45 * t,
        start.z * (1 - t) + (Math.random() - 0.5) * 0.55 * t,
      ));
    }

    const tube = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.3),
      24, isArtery ? 0.008 : 0.005, 7, false,
    );
    const mat = new THREE.MeshPhysicalMaterial({
      color: isArtery ? 0xcc2840 : 0x2860b8,
      emissive: isArtery ? 0x4a0a14 : 0x0a1e3e,
      roughness: 0.45, metalness: 0.02,
      transparent: true, opacity: 0.58, depthWrite: false,
    });
    const mesh = new THREE.Mesh(tube, mat);
    mesh.renderOrder = 2;
    g.add(mesh);
  }
  return g;
}

function distortSphere(
  radius: number, detail: number, amp: number, seed: number,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const len = Math.sqrt(x*x + y*y + z*z);
    x /= len; y /= len; z /= len;
    const n = brainFBM(x + seed, y + seed * 0.5, z + seed * 0.2);
    const s = 1 + n * amp;
    pos.setXYZ(i, x * radius * s * (1.02 + n * 0.06),
                  y * radius * s * (0.85 + n * 0.03),
                  z * radius * s);
  }
  geo.computeVertexNormals();
  return geo;
}

interface TumorObjects {
  group: THREE.Group;
  ring: THREE.Mesh;
  box: THREE.LineSegments;
}

function createTumor(center: THREE.Vector3, R: number): TumorObjects {
  const g = new THREE.Group();

  const wt = new THREE.Mesh(
    distortSphere(R * 0.58, 4, 0.5, 11.3),
    new THREE.MeshPhysicalMaterial({
      color: 0xf0b33a, emissive: 0x5a2e00, roughness: 0.35,
      transparent: true, opacity: 0.62, depthWrite: false,
    }),
  );
  wt.position.copy(center);
  wt.renderOrder = 3;
  g.add(wt);

  const tc = new THREE.Mesh(
    distortSphere(R * 0.33, 3, 0.42, 19.7),
    new THREE.MeshPhysicalMaterial({
      color: 0xd43030, emissive: 0x56100a, roughness: 0.3,
      transparent: true, opacity: 0.75, depthWrite: false,
    }),
  );
  tc.position.copy(center).add(new THREE.Vector3(0.01, -0.01, 0.005));
  tc.renderOrder = 3;
  g.add(tc);

  const et = new THREE.Mesh(
    new THREE.SphereGeometry(R * 0.15, 18, 18),
    new THREE.MeshBasicMaterial({
      color: 0x18e8ff,
      transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  et.position.copy(center).add(new THREE.Vector3(0.016, 0.008, -0.01));
  et.renderOrder = 3;
  g.add(et);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(R * 0.72, R * 0.016, 12, 56),
    new THREE.MeshBasicMaterial({
      color: 0xf7cf5a, transparent: true, opacity: 0.45, depthWrite: false,
    }),
  );
  ring.position.copy(center);
  ring.rotation.set(0.4, -0.2, 0.2);
  ring.renderOrder = 3;
  g.add(ring);

  const box = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(R * 1.42, R * 1.32, R * 1.42)),
    new THREE.LineBasicMaterial({
      color: 0xf5cf6a, transparent: true, opacity: 0.85, depthWrite: false,
    }),
  );
  box.position.copy(center);
  box.renderOrder = 4;
  g.add(box);

  return { group: g, ring, box };
}

function makeLabel(text: string, accentHex: string): THREE.Sprite {
  const W = 240, H = 56;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(4,10,20,0.42)';
  ctx.beginPath();
  ctx.moveTo(10, 0); ctx.lineTo(W - 10, 0);
  ctx.lineTo(W, H / 2); ctx.lineTo(W - 10, H);
  ctx.lineTo(10, H); ctx.lineTo(0, H / 2); ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 1.5;
  const c = 10;
  ctx.beginPath();

  ctx.moveTo(c + 14, 2); ctx.lineTo(c + 2, 2); ctx.lineTo(c + 2, 2 + 12);

  ctx.moveTo(W - c - 14, H - 2); ctx.lineTo(W - c - 2, H - 2); ctx.lineTo(W - c - 2, H - 14);
  ctx.stroke();

  ctx.fillStyle = '#e8f4ff';
  ctx.font = '600 15px Consolas, Inconsolata, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.60, 0.14, 1);
  sprite.renderOrder = 6;
  return sprite;
}

interface Callout { group: THREE.Group }

function createCallout(
  text: string,
  labelPos: THREE.Vector3,
  tipPos: THREE.Vector3,
  colorHex: number,
): Callout {
  const g = new THREE.Group();
  const color = new THREE.Color(colorHex);
  const hexStr = '#' + color.getHexString();

  const sprite = makeLabel(text, hexStr);
  sprite.position.copy(labelPos);
  g.add(sprite);

  const pts = [
    tipPos.clone(),
    tipPos.clone().lerp(labelPos, 0.7),
    labelPos.clone(),
  ];
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({
      color: colorHex, transparent: true, opacity: 0.45, depthTest: false, depthWrite: false,
    }),
  );
  line.renderOrder = 5;
  g.add(line);

  return { group: g };
}

function createParticles(count: number): THREE.Points {
  const pos   = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 1.35 + Math.random() * 0.8;
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.cos(phi);
    pos[i*3+2] = r * Math.sin(phi) * Math.sin(theta);
    sizes[i]   = 0.5 + Math.random() * 1.6;
    phases[i]  = Math.random() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('size',     new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('phase',    new THREE.BufferAttribute(phases, 1));

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size; attribute float phase; varying float vA; uniform float uTime;
      void main() {
        float a = uTime * 0.15 + phase;
        vec3 p = position;
        p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * (280.0 / -mv.z);
        gl_Position  = projectionMatrix * mv;
        vA = 0.4 + 0.6 * sin(uTime * 1.4 + phase);
      }
    `,
    fragmentShader: `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(0.1, 0.72, 0.9, (1.0 - d) * vA * 0.5);
      }
    `,
  });

  return new THREE.Points(geo, mat);
}

export default function BrainScene() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 100);
    camera.position.set(0, 0.3, 3.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.55;
    controls.minDistance = 1.8;
    controls.maxDistance = 6;
    controls.enablePan = false;

    scene.add(new THREE.AmbientLight(0x334466, 0.4));
    const key = new THREE.DirectionalLight(0xfff5ee, 1.0);
    key.position.set(5, 5, 3); scene.add(key);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
    fill.position.set(-3, 1, -4); scene.add(fill);
    const rim = new THREE.PointLight(0x06b6d4, 1.1, 12);
    rim.position.set(0, 4, -4); scene.add(rim);

    const tissue = createTissue();
    scene.add(tissue);

    const vessels = createVessels(32);
    scene.add(vessels);

    const tumorCenter = new THREE.Vector3(0.40, 0.05, 0.20);
    const tumorR = 0.36;
    const tumor = createTumor(tumorCenter, tumorR);
    scene.add(tumor.group);

    const cerebrumGeo = buildCerebrumGeometry();
    const shellMat = new THREE.ShaderMaterial({
      vertexShader:   BRAIN_VS,
      fragmentShader: BRAIN_FS,
      uniforms: {
        uTime:    { value: 0 },
        uOpacity: { value: 0.40 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cerebrumMesh = new THREE.Mesh(cerebrumGeo, shellMat);
    cerebrumMesh.renderOrder = 5;
    scene.add(cerebrumMesh);

    const cerebellumGeo = buildCerebellumGeometry();
    const cerebellumMat = new THREE.MeshPhysicalMaterial({
      color: 0xc8aaa5, roughness: 0.75,
      transparent: true, opacity: 0.38, depthWrite: false,
    });
    const cerebellumMesh = new THREE.Mesh(cerebellumGeo, cerebellumMat);
    cerebellumMesh.position.set(0, -0.55, -0.55);
    cerebellumMesh.renderOrder = 5;
    scene.add(cerebellumMesh);

    const brainstemMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.10, 0.34, 14, 1),
      new THREE.MeshPhysicalMaterial({
        color: 0xbda8a3, roughness: 0.8,
        transparent: true, opacity: 0.42, depthWrite: false,
      }),
    );
    brainstemMesh.position.set(0, -0.78, -0.44);
    brainstemMesh.rotation.x = 0.25;
    brainstemMesh.renderOrder = 5;
    scene.add(brainstemMesh);

    const callouts = [
      createCallout(
        'Tumor Region [ WT ]',
        new THREE.Vector3(1.12, 0.48, 0.42),
        tumorCenter.clone().add(new THREE.Vector3(0.10, 0.08, 0.02)),
        0xf7cf6a,
      ),
      createCallout(
        'Core & Enhancing [ TC/ET ]',
        new THREE.Vector3(1.14, 0.14, -0.18),
        tumorCenter.clone().add(new THREE.Vector3(0.02, 0.00, -0.01)),
        0x18e8ff,
      ),
      createCallout(
        'Vascular Network',
        new THREE.Vector3(-1.15, -0.18, 0.16),
        new THREE.Vector3(-0.22, -0.14, 0.06),
        0x6ec5ff,
      ),
    ];
    callouts.forEach((c) => scene.add(c.group));

    const particles = createParticles(220);
    scene.add(particles);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(el.clientWidth, el.clientHeight), 0.7, 0.45, 0.72,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(9999, 9999);
    let hovering = false;

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      mouse.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
    };
    el.addEventListener('mousemove', onMove);

    let rsTimer = 0;
    const onResize = () => {
      clearTimeout(rsTimer);
      rsTimer = window.setTimeout(() => {
        const w = el.clientWidth, h = el.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        composer.setSize(w, h);
      }, 80);
    };
    window.addEventListener('resize', onResize);

    const clock = new THREE.Clock();
    let animId = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      shellMat.uniforms.uTime.value = t;
      (particles.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

      vessels.rotation.y = t * 0.035;
      tissue.rotation.y  = -t * 0.010;

      const pulse = 0.88 + Math.sin(t * 2.2) * 0.1;
      tumor.ring.scale.setScalar(pulse);
      tumor.box.scale.setScalar(0.92 + Math.sin(t * 2.5) * 0.06);

      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObject(cerebrumMesh);
      if (hits.length > 0) {
        const wt = tumorCenter.clone().applyMatrix4(cerebrumMesh.matrixWorld);
        const onTumor = hits[0].point.distanceTo(wt) < tumorR * 1.1;
        if (onTumor && !hovering) {
          hovering = true;
          renderer.domElement.style.cursor = 'pointer';
          bloom.strength = 1.1;
        } else if (!onTumor && hovering) {
          hovering = false;
          renderer.domElement.style.cursor = 'default';
          bloom.strength = 0.7;
        }
      } else if (hovering) {
        hovering = false;
        renderer.domElement.style.cursor = 'default';
        bloom.strength = 0.7;
      }

      controls.update();
      composer.render();
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      el.removeEventListener('mousemove', onMove);
      controls.dispose();
      composer.dispose();
      renderer.dispose();

      [cerebrumGeo, cerebellumGeo].forEach((g) => g.dispose());
      [shellMat, cerebellumMat].forEach((m) => m.dispose());

      const disposeGroup = (group: THREE.Group) => {
        group.traverse((obj) => {
          const m = obj as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          if (m.material) {
            if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
            else m.material.dispose();
          }
        });
      };
      [tissue, vessels, tumor.group].forEach(disposeGroup);

      callouts.forEach(({ group }) => {
        group.traverse((obj) => {
          if (obj instanceof THREE.Sprite) {
            const mat = obj.material as THREE.SpriteMaterial;
            mat.map?.dispose();
            mat.dispose();
          }
          if (obj instanceof THREE.Line) {
            obj.geometry.dispose();
            (obj.material as THREE.Material).dispose();
          }
        });
      });

      particles.geometry.dispose();
      (particles.material as THREE.Material).dispose();

      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={ref}
      style={{ position: 'absolute', inset: 0, zIndex: 0, background: 'transparent' }}
    />
  );
}
