import * as THREE from "three/webgpu";
import { positionLocal, vec4 } from "three/tsl";
import { OrbitControls } from "three/examples/jsm/Addons.js";

// Check for WebGPU support
if (!navigator.gpu) {
  throw new Error("WebGPU not supported");
}
let scene, camera, renderer, controls;
function setScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 5;
}

function addObjects() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicNodeMaterial({ color: 0x00ff00 });
  material.positionNode = positionLocal;
  material.colorNode = vec4(positionLocal.y, 0, 1, 1);
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
}

function addControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.enableZoom = false;
}

const render = () => {
  controls.update();
  renderer.renderAsync(scene, camera);
  requestAnimationFrame(render);
};

(async () => {
  const canvas = document.getElementById("webgpu");
  renderer = new THREE.WebGPURenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
  });
  await renderer.init().then(() => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    console.log("Renderer initialized");
  });

  setScene();
  addObjects();
  addControls();
  render();
})();
