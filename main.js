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
import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";
import cube from "./src/cube.glb?url";
import ball from "./src/ball.glb?url";
import env from "./src/env.jpg?url";

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
  const gltfloader = new GLTFLoader();

  const loadBall = new Promise((resolve, reject) => {
    gltfloader.load(ball, resolve, undefined, reject);
  });
  const loadCube = new Promise((resolve, reject) => {
    gltfloader.load(cube, resolve, undefined, reject);
  });
  const loadEnvmap = new Promise((resolve, reject) => {
    loader.load(env, resolve, undefined, reject);
  });

  return Promise.all([loadBall, loadCube, loadEnvmap])
    .then(([_ball, _cube, _envmap]) => {
      assets.ball = _ball.scene;
      assets.cube = _cube.scene;
      assets.envmap = _envmap;
      assets.envmap.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = assets.envmap;
      scene.background = assets.envmap;
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
  // assets.cube.children[0].material = _material;
  // scene.add(assets.cube);
  const time = uniform(0);
  frame = time;
  const particleCount =
    assets.ball.children[0].geometry.attributes.position.count;
  const particlePosition =
    assets.ball.children[0].geometry.attributes.position.array;
  const ringPosition =
    assets.ball.children[0].geometry.attributes._ringid.array;
  const mousePosition = uniform(mouse.position);
  const particleGeometry = assets.cube.children[0].geometry;
  particleGeometry.scale(0.04, 0.02, 0.04);
  particleGeometry.rotateY(-Math.PI * 0.5);
  particleGeometry.rotateZ(Math.PI * 0.5);

  const computedPosition = new Float32Array(particleCount * 3);
  const ringIndex = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    computedPosition[i * 3 + 0] = particlePosition[i * 3 + 0];
    computedPosition[i * 3 + 1] = particlePosition[i * 3 + 1];
    computedPosition[i * 3 + 2] = particlePosition[i * 3 + 2];
    ringIndex[i] = ringPosition[i];
  }

  const geos = [];
  for (let i = 0; i < particleCount; i++) {
    const geo = particleGeometry.clone();
    const index = i;
    const len = geo.attributes.position.count;
    const indexArray = new Float32Array(len).fill(index);
    geo.setAttribute("particleindex", new THREE.BufferAttribute(indexArray, 1));
    geos.push(geo);
  }
  const mergedGeometry = BufferGeometryUtils.mergeGeometries(geos);
  const mergedMesh = new THREE.Mesh(mergedGeometry, _material);
  scene.add(mergedMesh);

  const positions = instancedArray(computedPosition, "vec3");
  const ringIndices = instancedArray(ringIndex, "float");
  const twopi = uniform(Math.PI * 2);

  computeUpdate = Fn(() => {
    const position = positions.element(instanceIndex);
    const ringIndex = ringIndices.element(instanceIndex);
    const distance = position.xy.sub(mousePosition.xy).length();
    const sdf = smoothstep(0, 0.5, distance).oneMinus();
    const speed = sin(float(ringIndex).mul(1001)).add(1).mul(0.5);
    const angle = float(0.002).add(speed.mul(0.002));
    const psdrd = hash(instanceIndex);
    const rotationMatrix = mat3(
      vec3(cos(angle), 0, sin(angle)),
      vec3(0, 1, 0),
      vec3(negate(sin(angle)), 0, cos(angle))
    );
    position.assign(position.mul(rotationMatrix));
    let targeted = position.toVar().normalize();
    let target = float(1);
    let sine = sin(psdrd.mul(twopi).add(float(time.mul(0.03))))
      .add(1)
      .mul(0.5);
    let smallsine = sin(psdrd.mul(113).add(float(time.mul(0.07))))
      .add(1)
      .mul(0.01);

    target = min(float(1.2), float(1).add(sdf.mul(sine)));
    target = target.add(smallsine);
    position.assign(mix(position, targeted.toVar().mul(target), 0.05));
    // position.mulAssign(target);
  })().compute(particleCount);

  const lookAt = Fn(([position, target]) => {
    const localUp = vec3(0, 1, 0);
    const forward = target.sub(position).normalize();

    const right = forward.cross(localUp).normalize();
    const up = right.cross(forward).normalize();
    const rotation = mat3(right, up, forward);
    return rotation;
  });

  _material.positionNode = Fn(() => {
    const pos = positionLocal.toVar();
    const id = attribute("particleindex");
    const position = positions.element(id);
    const rotation = lookAt(position.xyz, vec3(0, 0, 0));
    pos.xyz = rotation.mul(pos.xyz);
    pos.addAssign(position);

    return pos;
  })();

  const sphericals = Fn(([normals]) => {
    return vec2(
      atan(normals.z, normals.x).mul(0.5).div(Math.PI).add(0.5),
      acos(normals.y).div(Math.PI)
    );
  });

  _material.colorNode = Fn(() => {
    const id = attribute("particleindex");
    const pos = positions.element(id);
    const color = pos.xyz.mul(0.5).add(0.5);
    const normals = normalLocal.toVar();
    const normalMatrix = lookAt(pos, vec3(0));
    const normalRotated = normalMatrix.mul(normals).normalize();
    const steps = float(12);
    const quantized = normalRotated.mul(steps).floor().div(steps).normalize();
    const env = texture(scene.environment);
    const envUv = sphericals(quantized);
    return env.sample(envUv);
  })();

  /*
  const material = new THREE.SpriteMaterial({ color: 0x00ff00 });
  // material.colorNode = Fn(() => {
  //   return vec3(1, 1, 0);
  // })();
  material.colorNode = uv();
  material.scaleNode = 0.01;
  material.positionNode = positions.toAttribute();

  const particles = new THREE.Sprite(material);
  particles.count = particleCount;
  scene.add(particles);
  */
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
      opacity: 0.0,
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
  renderer.compute(computeUpdate);
  frame++;
  requestAnimationFrame(render);
};

const resize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  if (raycaster)
    raycaster.caster.scale.set(
      window.innerWidth / 100,
      window.innerHeight / 100,
      1
    );
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
