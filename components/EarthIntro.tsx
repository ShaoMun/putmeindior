"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface EarthIntroProps {
  onZoomComplete: () => void;
}

export default function EarthIntro({ onZoomComplete }: EarthIntroProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const onZoomCompleteRef = useRef(onZoomComplete);
  onZoomCompleteRef.current = onZoomComplete;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 3.2;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Texture loader
    const textureLoader = new THREE.TextureLoader();

    // Stars background
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 6000;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
      starPositions[i] = (Math.random() - 0.5) * 400;
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.18,
      transparent: true,
      opacity: 0.85,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    // Atmosphere glow
    const atmosphereGeometry = new THREE.SphereGeometry(1.06, 64, 64);
    const atmosphereMaterial = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.65 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
          gl_FragColor = vec4(0.15, 0.5, 1.0, 1.0) * intensity;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);

    // Earth sphere
    const earthGeometry = new THREE.SphereGeometry(1, 64, 64);

    // Load realistic earth textures
    const earthTexture = textureLoader.load("https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg");
    const bumpMap = textureLoader.load("https://unpkg.com/three-globe/example/img/earth-topology.png");
    const specularMap = textureLoader.load("https://unpkg.com/three-globe/example/img/earth-water.png");
    
    // Cloud layer
    const cloudTexture = textureLoader.load("https://unpkg.com/three-globe/example/img/earth-clouds10k.png");

    const earthMaterial = new THREE.MeshPhongMaterial({
      map: earthTexture,
      bumpMap: bumpMap,
      bumpScale: 0.015,
      specularMap: specularMap,
      specular: new THREE.Color(0x333333),
      shininess: 15,
    });

    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    
    // Set initial rotation to center Asia (Malaysia) when zoom in finishes,
    // and add realistic axial tilt 
    earth.rotation.y = 1.0;
    earth.rotation.z = 23.5 * Math.PI / 180;
    
    scene.add(earth);

    // Clouds mesh
    const cloudGeometry = new THREE.SphereGeometry(1.01, 64, 64);
    const cloudMaterial = new THREE.MeshPhongMaterial({
      map: cloudTexture,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
    earth.add(clouds);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 1.8);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 3.5);
    sunLight.position.set(5, 3, 5);
    scene.add(sunLight);

    // Rim light
    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.6);
    rimLight.position.set(-5, 0, -5);
    scene.add(rimLight);

    // Animation state
    let animationId: number;
    let phase: "float" | "zoom" | "done" = "float";
    let floatStartTime = performance.now();
    let zoomStartTime = 0;
    let zoomCallbackFired = false;

    const FLOAT_DURATION_MS = 2800; // time before zoom begins
    const ZOOM_DURATION_MS = 1600; // zoom-in duration

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const now = performance.now();

      // Slow rotation
      earth.rotation.y += 0.0015;
      clouds.rotation.y += 0.0003;
      stars.rotation.y += 0.00008;

      if (phase === "float") {
        const elapsed = now - floatStartTime;
        // Gentle Bob
        earth.position.y = Math.sin(elapsed * 0.001) * 0.04;
        atmosphere.position.y = earth.position.y;

        if (elapsed >= FLOAT_DURATION_MS) {
          phase = "zoom";
          zoomStartTime = now;
        }
      } else if (phase === "zoom") {
        const elapsed = now - zoomStartTime;
        const t = Math.min(elapsed / ZOOM_DURATION_MS, 1);
        // Ease-in-out cubic
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Zoom from z=3.2 to z=-0.5 (through the globe)
        camera.position.z = 3.2 - eased * 4.2;
        // Fade out stars
        starMaterial.opacity = 0.85 * (1 - eased);

        if (t >= 1 && !zoomCallbackFired) {
          zoomCallbackFired = true;
          phase = "done";
          onZoomCompleteRef.current();
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize
    const handleResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        background: "radial-gradient(ellipse at 50% 60%, #0a1628 0%, #020408 70%)",
      }}
    />
  );
}
