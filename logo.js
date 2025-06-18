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
import bag from "./src/logo.glb?url";
import env from "./src/env.jpg?url";

if (!navigator.gpu) {
  throw new Error("WebGPU not supported");
}

let scene,
  camera,
  renderer,
  controls,
  mouse,
  computeUpdate,
  raycaster,
  frame,
  casted;
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
  const loadBag = new Promise((resolve, reject) => {
    gltfloader.load(bag, resolve, undefined, reject);
  });
  const loadEnvmap = new Promise((resolve, reject) => {
    loader.load(env, resolve, undefined, reject);
  });

  return Promise.all([loadBall, loadCube, loadBag, loadEnvmap])
    .then(([_ball, _cube, _bag, _envmap]) => {
      assets.ball = _ball.scene;
      assets.cube = _cube.scene;
      assets.bag = _bag.scene;
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
  const staticMaterial = new THREE.MeshPhysicalNodeMaterial({
    roughness: 0.001,
    metalness: 1,
    side: THREE.DoubleSide,
  });
  const glowMaterial = new THREE.MeshPhysicalNodeMaterial({
    roughness: 0.001,
    metalness: 0,
    emissive: 0x00ff00,
    emissiveIntensity: 2,
    side: THREE.DoubleSide,
  });
  const [bag, handles, caster] = assets.bag.children;

  scene.add(handles);
  // scene.add(caster);
  handles.material = staticMaterial;
  // caster.material = glowMaterial;
  // console.log(bag.geometry.attributes);
  // assets.cube.children[0].material = _material;
  // scene.add(assets.cube);
  // scene.add(assets.bag);
  // console.log(assets.bag);

  const time = uniform(0);
  frame = time;
  const particleCount = bag.geometry.attributes.position.count;
  const particlePosition = bag.geometry.attributes.position.array;
  const particleNormals = bag.geometry.attributes.normal.array;
  const mousePosition = uniform(mouse.position);
  // console.log(mouse.position);
  const particleGeometry = assets.cube.children[0].geometry;
  particleGeometry.scale(0.04, 0.02, 0.04);
  particleGeometry.rotateY(-Math.PI * 0.5);
  particleGeometry.rotateZ(Math.PI * 0.5);

  const computedPosition = new Float32Array(particleCount * 3);
  const originalPosition = new Float32Array(particleCount * 3);
  const computedNormals = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i++) {
    computedPosition[i * 3 + 0] = particlePosition[i * 3 + 0];
    computedPosition[i * 3 + 1] = particlePosition[i * 3 + 1];
    computedPosition[i * 3 + 2] = particlePosition[i * 3 + 2];

    originalPosition[i * 3 + 0] = particlePosition[i * 3 + 0];
    originalPosition[i * 3 + 1] = particlePosition[i * 3 + 1];
    originalPosition[i * 3 + 2] = particlePosition[i * 3 + 2];

    computedNormals[i * 3 + 0] = particleNormals[i * 3 + 0];
    computedNormals[i * 3 + 1] = particleNormals[i * 3 + 1];
    computedNormals[i * 3 + 2] = particleNormals[i * 3 + 2];
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
  const originalPositions = instancedArray(originalPosition, "vec3");
  const normals = instancedArray(computedNormals, "vec3");
  const twopi = uniform(Math.PI * 2);

  computeUpdate = Fn(() => {
    const position = positions.element(instanceIndex);
    const originalPos = originalPositions.element(instanceIndex);
    const normal = normals.element(instanceIndex);
    const psdrd = hash(instanceIndex);

    // Mouse interaction
    const distanceFromMouse = originalPos.sub(mousePosition).length();
    const maxRange = float(0.5);
    const pushStrength = float(0.8);
    const influence = smoothstep(maxRange, float(0), distanceFromMouse);
    const pushDirection = normal.normalize();
    let pushedPos = originalPos.add(
      pushDirection.mul(pushStrength).mul(influence)
    );

    // Secondary animation - subtle sine waves for life
    const sine = sin(psdrd.mul(twopi).add(float(time.mul(0.03))))
      .add(1)
      .mul(0.5);
    const smallsine = sin(psdrd.mul(113).add(float(time.mul(0.7))))
      .add(1)
      .mul(0.01);
    pushedPos = pushedPos.add(smallsine);
    // Combine mouse interaction with subtle breathing animation
    const breathingOffset = pushDirection.mul(smallsine);
    const finalPos = mix(originalPos, pushedPos, influence).add(
      breathingOffset
    );

    const returnSpeed = float(0.08);
    position.assign(mix(position, finalPos, returnSpeed));
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
    const normal = normals.element(id);
    const forward = normal.normalize();
    const right = forward.cross(vec3(0, 1, 0)).normalize();
    const up = right.cross(forward).normalize();
    const rotation = mat3(right, up, forward);
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
    const _normals = normals.element(id);
    const __normals = normalLocal.toVar();
    const normalMatrix = lookAt(pos, vec3(0));
    const normalRotated = normalMatrix.mul(_normals).normalize();
    const steps = float(16);
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
    assets.bag.children[0].geometry,
    new THREE.MeshBasicNodeMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.2,
    })
  );
  raycaster.casted = new THREE.Mesh(
    new THREE.SphereGeometry(0.01),
    new THREE.MeshBasicNodeMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.8,
    })
  );
  // scene.add(raycaster.caster);
  // scene.add(raycaster.casted);
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
        // raycaster.casted.position.copy(intersects[0].point);
        // raycaster.casted.position.set(intersects[0].point);
      } else {
        mouse.position.set(1000, 1000);
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
  // console.log(frame);
  requestAnimationFrame(render);
};

const resize = () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  // if (raycaster)
  //   raycaster.caster.scale.set(
  //     window.innerWidth / 100,
  //     window.innerHeight / 100,
  //     1
  //   );
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
