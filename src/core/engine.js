import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Core rendering engine: renderer, scene, the lone real light (sun/moon),
 * stylized sky + fog, a day/night cycle, and a single bloom pass so every
 * emissive thing (lit windows, streetlights, head/tail lights, signs) glows
 * cheaply. The directional light is the ONLY real light in the whole game.
 */

const DAY_TOP = new THREE.Color(0x4a8fe0);
const DAY_HOR = new THREE.Color(0xcfe6ff);
const NIGHT_TOP = new THREE.Color(0x060912);
const NIGHT_HOR = new THREE.Color(0x141d30);
const DUSK = new THREE.Color(0xff9e5a);
const SUN_DAY = new THREE.Color(0xfff3df);
const SUN_LOW = new THREE.Color(0xff8a4a);
const MOON = new THREE.Color(0x9fb4e0);
const HEMI_SKY_DAY = new THREE.Color(0x9fc3ff);
const HEMI_SKY_NIGHT = new THREE.Color(0x12203a);
const HEMI_GND = new THREE.Color(0x6b6256);

export function createEngine() {
  const container = document.getElementById('app');

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = DAY_HOR.clone();
  const FOG_FAR = 2600;
  scene.fog = new THREE.Fog(DAY_HOR.clone(), 600, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.5, 9000);
  camera.position.set(0, 120, 220);
  camera.lookAt(0, 0, 0);

  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-0.5, 1.0, 0.3).multiplyScalar(1000);
  scene.add(sun);
  const hemi = new THREE.HemisphereLight(HEMI_SKY_DAY, HEMI_GND, 0.9);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(ambient);

  const skyUniforms = {
    topColor: { value: DAY_TOP.clone() },
    horizonColor: { value: DAY_HOR.clone() },
  };
  const sky = makeSkyDome(skyUniforms);
  scene.add(sky);

  // --- post: bloom (threshold high so only emissive glows, not the day scene) ---
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.5, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  const _top = new THREE.Color(), _hor = new THREE.Color(), _c = new THREE.Color();

  /**
   * Set time of day. t in [0,1): 0 = midnight, 0.5 = noon. Returns the night
   * factor (0 day .. 1 night) for emissive systems.
   */
  function setTimeOfDay(t) {
    const elev = Math.sin((t - 0.25) * Math.PI * 2);  // -1 midnight .. 1 noon
    const az = t * Math.PI * 2;
    const daylight = smooth(-0.08, 0.22, elev);        // 0 night .. 1 day
    const night = 1 - daylight;
    const dusk = Math.max(0, 1 - Math.abs(elev) / 0.28) * (1 - night * 0.4); // warm near horizon

    // Light: sun above horizon by day, "moon" up at night, never from below.
    const y = Math.abs(elev) * 0.85 + 0.18;
    sun.position.set(Math.cos(az), y, Math.sin(az)).normalize().multiplyScalar(1500);
    _c.copy(SUN_LOW).lerp(SUN_DAY, smooth(0.0, 0.4, elev));
    _c.lerp(MOON, night);
    sun.color.copy(_c);
    sun.intensity = 0.35 + daylight * 2.4;

    hemi.color.copy(HEMI_SKY_NIGHT).lerp(HEMI_SKY_DAY, daylight);
    hemi.intensity = 0.22 + daylight * 0.7;
    ambient.intensity = 0.05 + daylight * 0.16;

    _top.copy(NIGHT_TOP).lerp(DAY_TOP, daylight);
    _hor.copy(NIGHT_HOR).lerp(DAY_HOR, daylight).lerp(DUSK, dusk * 0.7);
    skyUniforms.topColor.value.copy(_top);
    skyUniforms.horizonColor.value.copy(_hor);
    scene.background.copy(_hor);
    scene.fog.color.copy(_hor);
    scene.fog.far = FOG_FAR * (0.7 + daylight * 0.3);

    return night;
  }

  return { renderer, scene, camera, composer, sun, sky, setTimeOfDay };
}

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function makeSkyDome(uniforms) {
  const geo = new THREE.SphereGeometry(8000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      void main() {
        float t = clamp(vDir.y * 1.2, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizonColor, topColor, t), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}
