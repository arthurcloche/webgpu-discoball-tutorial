import * as THREE from "three/webgpu";
import {
  positionLocal,
  uv,
  mul,
  sub,
  distance,
  length,
  vec2,
  vec3,
  vec4,
  uniform,
  smoothstep,
  oneMinus,
  instancedArray,
  instanceIndex,
  Fn,
} from "three/tsl";
import { OrbitControls } from "three/examples/jsm/Addons.js";
import { GLTFLoader } from "three/examples/jsm/Addons.js";
import { DRACOLoader } from "three/examples/jsm/Addons.js";

import cube from "./src/cube.glb?url";
import ball from "./src/ball.glb?url";
import env from "./src/env.jpg?url";

if (!navigator.gpu) {
  throw new Error("WebGPU not supported");
}

let scene, camera, renderer, controls, mouse, computeUpdate, raycaster;
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

function addObjects() {
  const number = 100;
  const mousePosition = uniform(mouse.position);
  let particlePosition = new Float32Array(number * 3);
  for (let i = 0; i < number; i++) {
    particlePosition[i * 3 + 0] = Math.random() * 2 - 1;
    particlePosition[i * 3 + 1] = Math.random() * 2 - 1;
    particlePosition[i * 3 + 2] = Math.random() * 2 - 1;
  }
  const positions = instancedArray(particlePosition, "vec3");

  computeUpdate = Fn(() => {
    const position = positions.element(instanceIndex);
    const distance = position.sub(mousePosition).length();
    const sdf = smoothstep(0, 1, distance).oneMinus();
    position.addAssign(vec3(sdf.mul(1), 0, 0));
  })().compute(number);

  const material = new THREE.SpriteMaterial({ color: 0x00ff00 });
  // material.colorNode = Fn(() => {
  //   return vec3(1, 1, 0);
  // })();
  material.colorNode = uv();
  material.scaleNode = 0.2;
  material.positionNode = positions.toAttribute();

  const particles = new THREE.Sprite(material);
  particles.count = number;
  scene.add(particles);
}

function addControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;
  controls.enableZoom = false;
}

function addRaycaster() {
  raycaster = new THREE.Raycaster();
  raycaster.caster = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 3, 1, 1),
    new THREE.MeshBasicNodeMaterial({
      color: 0x00000,
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
        // console.log(intersects[0].point);
        mouse.position.copy(intersects[0].point);
      }
    }
  };

  window.addEventListener("mousemove", mouse.update);
}

const render = () => {
  if (controls) controls.update();
  renderer.renderAsync(scene, camera);
  renderer.compute(computeUpdate);
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
    console.log("Good to go!");
  });

  setScene();
  addControls();
  addRaycaster();
  addMouse();
  addObjects();
  resize();
  render();
})();
