import * as THREE from 'three';

/**
 * Core rendering engine: renderer, scene, camera, lights, sky and fog.
 * Stylized art direction lives here — a clean limited palette, soft sun,
 * and light distance fog so the streaming horizon edge is hidden.
 */
export function createEngine() {
  const container = document.getElementById('app');

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();

  // Stylized sky + matching fog. The fog color and the sky dome share a hue
  // so the horizon dissolves cleanly.
  const SKY_TOP = new THREE.Color(0x4a8fe0);
  const SKY_HORIZON = new THREE.Color(0xcfe6ff);
  scene.background = SKY_HORIZON.clone();
  const FOG_FAR = 2600;
  scene.fog = new THREE.Fog(SKY_HORIZON.clone(), 600, FOG_FAR);

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.5,
    8000,
  );
  camera.position.set(0, 120, 220);
  camera.lookAt(0, 0, 0);

  // Lighting: a warm key sun + cool sky/hemisphere fill for that clean,
  // characterful look. Shadows added in a later phase if budget allows.
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(-0.5, 1.0, 0.3).multiplyScalar(1000);
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(SKY_TOP, 0x8a7f6f, 0.9);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(ambient);

  // A large gradient sky dome behind everything.
  const sky = makeSkyDome(SKY_TOP, SKY_HORIZON);
  scene.add(sky);

  // Resize handling.
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  return { renderer, scene, camera, sun, sky };
}

function makeSkyDome(topColor, horizonColor) {
  const geo = new THREE.SphereGeometry(7000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: topColor.clone() },
      horizonColor: { value: horizonColor.clone() },
    },
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
