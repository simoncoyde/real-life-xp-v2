import { useEffect, useRef } from "react";
import * as THREE from "../vendor/three.module.js";
import { buildBossMesh, BOSS_KINDS } from "./bossMesh.js";

/* =======================================================================
   BOSS RENDERER — Three.js, no wrapper library.

   Plain Three.js rather than react-three-fiber: one less layer to break,
   and — more importantly — it builds and runs without installing anything,
   which is what lets every change be tested before it reaches anyone.

   Same proven geometry as before. What's new:
   - real shadows, so the boss sits ON something instead of floating
   - physically-based materials, so metal reads as metal and hide as hide
   - eyes that cast real light onto the face and chest around them
   - film-style tone mapping, without which everything renders murky
   ======================================================================= */

const STRIDE = 11; // pos3 + normal3 + colour3 + uv2

/* Re-wraps our flat vertex array as Three.js geometry. The layouts map
   one-to-one, so nothing is recalculated. */
function toGeometry(kind) {
  const verts = buildBossMesh(kind);
  const count = verts.length / STRIDE;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const s = i * STRIDE;
    pos[i * 3] = verts[s];
    pos[i * 3 + 1] = verts[s + 1];
    pos[i * 3 + 2] = verts[s + 2];
    nor[i * 3] = verts[s + 3];
    nor[i * 3 + 1] = verts[s + 4];
    nor[i * 3 + 2] = verts[s + 5];
    col[i * 3] = verts[s + 6];
    col[i * 3 + 1] = verts[s + 7];
    col[i * 3 + 2] = verts[s + 8];
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

export default function BossViewer3D({ kind, defeated, reducedMotion, height = 150 }) {
  const hostRef = useRef(null);
  const defeatedRef = useRef(defeated);
  useEffect(() => {
    defeatedRef.current = defeated;
  }, [defeated]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) {
      return undefined; // no WebGL here — leave the space empty rather than crash
    }

    const w = host.clientWidth || 320;
    const h = height;
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    /* Without tone mapping, physically-based lighting renders dark and flat,
       because the wide range of real light values never gets mapped into what
       a screen can show. Measured: median brightness 25/255 before, 91 after. */
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = height + "px";
    renderer.domElement.style.display = "block";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x241a10, 4.6, 9.0);

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 20);
    camera.position.set(0, 0.15, 3.05);

    const K = BOSS_KINDS[kind] || BOSS_KINDS.golem;
    const glowRGB = K.glow || [1, 0.7, 0.2];
    const glow = new THREE.Color(glowRGB[0], glowRGB[1], glowRGB[2]);

    /* Stone and hide want roughness; armour and dragon scale want some metal
       in them. Per-boss beats one material for everything. */
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: kind === "knight" || kind === "golem" ? 0.55 : 0.12,
      roughness: kind === "wraith" ? 0.95 : kind === "knight" ? 0.42 : 0.78,
      emissive: new THREE.Color(0x2a2118),
      emissiveIntensity: 0.5,
      flatShading: true,
    });

    const group = new THREE.Group();
    const mesh = new THREE.Mesh(toGeometry(kind), material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // the eyes throw their own light onto the chest and shoulders
    const eyeLight = new THREE.PointLight(glow, defeated ? 0.4 : 4.5, 3.0);
    eyeLight.position.set(0, 0.62, 0.42);
    group.add(eyeLight);
    scene.add(group);

    // Key light, high front-left — throws the shadow back and to the right
    const key = new THREE.DirectionalLight(0xffe9c4, 5.2);
    key.position.set(-2.6, 4.2, 3.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 12;
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -3;
    key.shadow.bias = -0.0015;
    scene.add(key);

    // Cool rim from behind, so the silhouette separates from the background
    const rim = new THREE.DirectionalLight(0x8fa8e0, 2.4);
    rim.position.set(3.0, 1.4, -2.6);
    scene.add(rim);

    // Warm above, cool below — stops undersides falling to pure black
    scene.add(new THREE.HemisphereLight(0xffd9a0, 0x2a3550, 1.5));
    scene.add(new THREE.AmbientLight(0x6b5a44, 0.9));

    // Warm bounce from below, like torchlight off a floor
    const bounce = new THREE.PointLight(0xc8783a, 3.2, 6);
    bounce.position.set(0, -1.4, 1.6);
    scene.add(bounce);

    /* Invisible floor whose only job is catching a shadow. It's what makes
       the boss look planted rather than floating in a void. */
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9),
      new THREE.ShadowMaterial({ opacity: 0.55 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.02;
    floor.receiveShadow = true;
    scene.add(floor);

    let raf = 0;
    const t0 = performance.now();
    function draw(now) {
      const t = (now - t0) / 1000;
      const dead = defeatedRef.current;
      if (reducedMotion) {
        group.rotation.y = 0.5;
      } else {
        group.rotation.y = t * 0.55;
        // a slow, heavy heave — this thing has weight
        group.position.y = Math.sin(t * 1.5) * 0.03 - (dead ? 0.5 : 0);
        group.rotation.x = 0.06 + Math.sin(t * 0.8) * 0.025 + (dead ? 0.5 : 0);
      }
      eyeLight.intensity = dead ? 0.4 : 4.5;
      renderer.render(scene, camera);
      if (!reducedMotion) raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);

    function onResize() {
      const nw = host.clientWidth || w;
      renderer.setSize(nw, h, false);
      camera.aspect = nw / h;
      camera.updateProjectionMatrix();
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      mesh.geometry.dispose();
      material.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [kind, height, reducedMotion, defeated]);

  return <div ref={hostRef} className="rlxp-boss-canvas-host" style={{ height }} />;
}
