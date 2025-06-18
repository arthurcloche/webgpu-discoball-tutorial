import * as THREE from "three/webgpu";
import {
  positionLocal,
  uv,
  add,
  mul,
  sub,
  distance,
  length,
  vec2,
  min,
  vec3,
  vec4,
  uniform,
  cos,
  sin,
  atan2,
  acos,
  asin,
  smoothstep,
  oneMinus,
  instancedArray,
  instanceIndex,
  Fn,
  texture,
  attribute,
  mat4,
  mat3,
  negate,
  fract,
  float,
  mix,
  hash,
  normalLocal,
  atan,
} from "three/tsl";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { DRACOLoader } from "three/examples/jsm/Addons.js";

if (!navigator.gpu) {
  throw new Error("WebGPU not supported");
}

let scene, camera, renderer, controls, mouse, computeUpdate, raycaster, frame;
const assets = {};
const canvas = document.getElementById("webgpu");
function setScene() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 2;
}

// const textureLoader = new THREE.TextureLoader()

function loadAssets() {
  const loader = new THREE.TextureLoader();
  //  const gltfloader = new GLTFLoader();

  const loadEnvmap = new Promise((resolve, reject) => {
    loader.load(env, resolve, undefined, reject);
  });

  return Promise.all([loadEnvmap])
    .then(([_ball, _cube, _bag, _envmap]) => {
      assets.envmap = _envmap;
      assets.envmap.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = assets.envmap;
      scene.background = assets.envmap;
      scene.backgroundBlurriness = 0.3;
    })
    .catch((error) => {
      console.error(error);
    });
}

function addObjects() {
  const _material = new THREE.MeshPhysicalNodeMaterial({
    roughness: 0.001,
    metalness: 1,
    side: THREE.DoubleSide,
  });
  const _geo = new THREE.SphereGeometry(1, 24, 24);
  const mesh = new THREE.Mesh();
  const time = uniform(0);
  frame = time;
  _material.colorNode = Fn(() => {
    return vec3(1, sin(time).mul(0.5).add(0.5), 0);
  })();
}

function orbitChange() {
  if (raycaster) {
    // raycaster.caster.lookAt(camera.position);
  }
}

function addControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.addEventListener("change", orbitChange);
  // controls.enableZoom = false;
}

function addRaycaster() {
  raycaster = new THREE.Raycaster();
  raycaster.caster = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1, 1, 1),
    new THREE.MeshBasicNodeMaterial({
      color: 0xff000,
      transparent: true,
      opacity: 0.2,
    })
  );
  scene.add(raycaster.caster);
}

function addMouse() {
  mouse = new THREE.Vector2();
  mouse.position = new THREE.Vector3(0, 0, 0);
  mouse.update = (event) => {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    if (raycaster) {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects([raycaster.caster]);
      if (intersects.length > 0) {
        mouse.position.copy(intersects[0].point);
      }
    }
  };

  window.addEventListener("mousemove", mouse.update);
}

const render = () => {
  if (controls) {
    controls.update();
  }
  renderer.renderAsync(scene, camera);
  frame++;
  requestAnimationFrame(render);
};

const resize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  window.addEventListener("resize", resize);
};

(async () => {
  renderer = new THREE.WebGPURenderer({
    canvas: canvas,
    antialias: true,
    alpha: true,
  });
  await renderer.init().then(() => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor("#0000AA");
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    console.log("You're good to go!");
  });

  setScene();
  await loadAssets();
  addControls();
  addRaycaster();
  addMouse();
  addObjects();
  resize();
  render();
})();
