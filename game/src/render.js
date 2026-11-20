// three.js renderer, sun-soaked lighting, warm sky, sun disc, clouds and fog.
import * as THREE from 'three';

export function createRender(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(1280, 720, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffb36b);
  scene.fog = new THREE.Fog(0xf2b27a, 120, 420);

  const camera = new THREE.PerspectiveCamera(62, 1280 / 720, 0.1, 900);
  camera.position.set(0, 70, 130);

  const sun = new THREE.DirectionalLight(0xffe0a8, 2.8);
  sun.position.set(120, 140, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.camera.far = 500;
  sun.shadow.bias = -0.0006;
  scene.add(sun);

  const hemi = new THREE.HemisphereLight(0x9fd4e8, 0x8a7d55, 1.15);
  scene.add(hemi);

  const fill = new THREE.DirectionalLight(0xffd9a0, 0.35);
  fill.position.set(-80, 40, -100);
  scene.add(fill);

  // Sun disc + flat-shaded clouds drifting high above the city.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(18, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }),
  );
  sunDisc.position.set(180, 150, -260);
  sunDisc.lookAt(0, 0, 0);
  scene.add(sunDisc);

  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xfff6e8, transparent: true, opacity: 0.92 });
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(7 + j * 2.5, 10, 8), cloudMat);
      puff.scale.y = 0.45;
      puff.position.set(j * 9 - 9, j * 1.5, (j % 2) * 4 - 2);
      cloud.add(puff);
    }
    cloud.position.set(-260 + i * 55, 95 + (i % 3) * 14, -220 + (i % 4) * 90);
    scene.add(cloud);
    clouds.push(cloud);
  }

  return { renderer, scene, camera, sun, clouds };
}

export function renderFrame(render, scene, camera) {
  render.renderer.render(scene, camera);
}

export function resizeRender(render, width, height) {
  render.renderer.setSize(width, height, false);
  render.camera.aspect = width / height;
  render.camera.updateProjectionMatrix();
}
