"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

type TerrainLayerConfig = {
  color: string;
  yOffset: number;
  depthOffset: number;
  amplitude: number;
  noiseScale: number;
  seed: number;
  opacity: number;
  widthScale: number;
  ridgeX: number;
  ridgeStrength: number;
};

const vertexShader = `
uniform float uAmplitude;
uniform float uNoiseScale;
uniform float uYOffset;
uniform float uSeed;
uniform float uRidgeX;
uniform float uRidgeStrength;

varying float vHeight;

vec3 mod289(vec3 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 10.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(
    permute(
      permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)
    ) + i.x + vec4(0.0, i1.x, i2.x, 1.0)
  );

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;

  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < 5; i++) {
    value += amplitude * snoise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }

  return value;
}

void main() {
  vec3 transformed = position;
  vec3 noisePoint = vec3(position.xz * uNoiseScale, uSeed);

  float ridge = fbm(noisePoint);
  float ripple = snoise(noisePoint * 2.8 + vec3(0.0, 0.0, 1.9 + uSeed));
  float ridgeShape = exp(-pow((position.x - uRidgeX) / 78.0, 2.0)) * uRidgeStrength;
  float trench = exp(-pow((position.x + 10.0) / 36.0, 2.0)) * 8.0;

  transformed.y += (ridge * 1.28 + ripple * 0.22) * uAmplitude + ridgeShape - trench + uYOffset;

  vHeight = transformed.y;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const fragmentShader = `
uniform vec3 uColor;
uniform float uOpacity;

varying float vHeight;

void main() {
  float intensity = smoothstep(-20.0, 24.0, vHeight);
  vec3 color = mix(uColor * 0.55, uColor, intensity);
  gl_FragColor = vec4(color, uOpacity);
}
`;

function createTerrainLayer(config: TerrainLayerConfig): {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
} {
  const geometry = new THREE.PlaneGeometry(
    220 * config.widthScale,
    108,
    176,
    104,
  );

  geometry.rotateX(-Math.PI / 2.55);
  geometry.rotateZ(-0.12);

  const uniforms = {
    uAmplitude: { value: config.amplitude },
    uNoiseScale: { value: config.noiseScale },
    uSeed: { value: config.seed },
    uRidgeX: { value: config.ridgeX },
    uRidgeStrength: { value: config.ridgeStrength },
    uColor: { value: new THREE.Color(config.color) },
    uOpacity: { value: config.opacity },
    uYOffset: { value: config.yOffset },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    wireframe: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, config.depthOffset);

  return { mesh };
}

export default function TerrainCanvas() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x06090d, 96, 230);

    const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 500);
    camera.position.set(0, 35, 128);

    const terrainGroup = new THREE.Group();
    scene.add(terrainGroup);

    const ambient = new THREE.AmbientLight(0x9bc87d, 0.2);
    scene.add(ambient);

    const point = new THREE.PointLight(0x95cb78, 0.5, 260);
    point.position.set(12, 48, 76);
    scene.add(point);

    const terrainLayers = [
      createTerrainLayer({
        color: "#aac84e",
        yOffset: 9,
        depthOffset: -16,
        amplitude: 20,
        noiseScale: 0.017,
        seed: 1.35,
        opacity: 0.74,
        widthScale: 1.05,
        ridgeX: 10,
        ridgeStrength: 22,
      }),
      createTerrainLayer({
        color: "#cf8153",
        yOffset: -2,
        depthOffset: -3,
        amplitude: 23,
        noiseScale: 0.02,
        seed: 5.9,
        opacity: 0.64,
        widthScale: 1.12,
        ridgeX: -6,
        ridgeStrength: 18,
      }),
      createTerrainLayer({
        color: "#9bb2bc",
        yOffset: -14,
        depthOffset: 16,
        amplitude: 19,
        noiseScale: 0.019,
        seed: 11.25,
        opacity: 0.6,
        widthScale: 1.34,
        ridgeX: -22,
        ridgeStrength: 14,
      }),
    ];

    terrainLayers.forEach((layer) => terrainGroup.add(layer.mesh));

    const hazeGeometry = new THREE.PlaneGeometry(220, 110, 1, 1);
    hazeGeometry.rotateX(-Math.PI / 2.2);
    const hazeMaterial = new THREE.MeshBasicMaterial({
      color: 0x7d9748,
      transparent: true,
      opacity: 0.09,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const haze = new THREE.Mesh(hazeGeometry, hazeMaterial);
    haze.position.set(-3, -7, 8);
    terrainGroup.add(haze);

    const pointer = { x: 0, y: 0 };
    const base = { yaw: 0, pitch: -0.21, camX: 0, camY: 35 };

    const setSize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };

    setSize();
    camera.lookAt(0, -6, 3);

    const renderAt = (yaw: number, pitch: number, camX: number, camY: number) => {
      terrainGroup.rotation.y = yaw;
      terrainGroup.rotation.x = pitch;
      camera.position.x = camX;
      camera.position.y = camY;
      camera.lookAt(0, -6, 3);
      renderer.render(scene, camera);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;

      const yaw = pointer.x * 0.045;
      const pitch = base.pitch + pointer.y * 0.016;
      const camX = pointer.x * 2.1;
      const camY = base.camY + pointer.y * 1.1;
      renderAt(yaw, pitch, camX, camY);
    };

    const onPointerLeave = () => {
      renderAt(base.yaw, base.pitch, base.camX, base.camY);
    };

    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerleave", onPointerLeave);

    const resizeObserver = new ResizeObserver(() => setSize());
    resizeObserver.observe(mount);
    renderAt(base.yaw, base.pitch, base.camX, base.camY);

    return () => {
      resizeObserver.disconnect();
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerleave", onPointerLeave);

      terrainLayers.forEach((layer) => {
        layer.mesh.geometry.dispose();
        layer.mesh.material.dispose();
      });

      hazeGeometry.dispose();
      hazeMaterial.dispose();
      renderer.dispose();

      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div className="terrain-canvas" ref={mountRef} aria-hidden="true" />;
}
