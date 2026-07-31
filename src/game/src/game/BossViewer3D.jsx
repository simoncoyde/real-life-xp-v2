import { useMemo, useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { buildBossMesh, BOSS_KINDS } from "./bossMesh.js";

/* =======================================================================
   BOSS RENDERER — Three.js

   The shapes are the same ones as before. Everything else is new:

   - Real lights that cast real shadows, so the boss sits ON something
     instead of floating in a void.
   - Physically-based materials, so metal reads as metal and stone reads
     as stone rather than every surface being flat paint.
   - Emissive eyes and core seams that genuinely emit light and spill
     colour onto the geometry around them.
   - Atmospheric fog, so there's depth behind the figure.

   Written to fail soft: if anything here can't run, the caller falls back
   to the original renderer rather than showing a blank box.
   ======================================================================= */

const STRIDE = 11; // pos3 + normal3 + colour3 + uv2

/* Converts our flat vertex array into geometry Three.js understands.
   The layout maps one-to-one, so this is a re-wrap rather than a rebuild. */
function useBossGeometry(kind) {
  return useMemo(() => {
    const verts = buildBossMesh(kind);
    const count = verts.length / STRIDE;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const uv = new Float32Array(count * 2);

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
      uv[i * 2] = verts[s + 9];
      uv[i * 2 + 1] = verts[s + 10];
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.computeBoundingSphere();
    return g;
  }, [kind]);
}

/* The glow colour of a boss's eyes, used for the light it casts. */
function glowColour(kind) {
  const k = BOSS_KINDS[kind] || BOSS_KINDS.golem;
  const g = k.glow || [1, 0.7, 0.2];
  return new THREE.Color(g[0], g[1], g[2]);
}

function BossModel({ kind, defeated, reducedMotion }) {
  const group = useRef();
  const geometry = useBossGeometry(kind);
  const glow = useMemo(() => glowColour(kind), [kind]);

  /* Stone and hide want roughness; armour and dragon scale want a bit of
     metal in them. Picking per boss beats one material for everything. */
  const surface = useMemo(() => {
    const metallic = kind === "knight" || kind === "golem" ? 0.55 : 0.12;
    const rough = kind === "wraith" ? 0.95 : kind === "knight" ? 0.42 : 0.78;
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      metalness: metallic,
      roughness: rough,
      emissive: glow,
      // a whisper of self-illumination so the darkest faces never go pure black
      emissiveIntensity: 0.045,
      flatShading: true,
    });
  }, [kind, glow]);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    if (reducedMotion) {
      group.current.rotation.y = 0.5;
      return;
    }
    group.current.rotation.y = t * 0.55;
    // a slow, heavy heave — this thing has weight
    group.current.position.y = Math.sin(t * 1.5) * 0.03 - (defeated ? 0.5 : 0);
    group.current.rotation.x = 0.06 + Math.sin(t * 0.8) * 0.025 + (defeated ? 0.5 : 0);
  });

  return (
    <group ref={group}>
      <mesh geometry={geometry} material={surface} castShadow receiveShadow />
      {/* the eyes throw their own light onto the chest and shoulders */}
      <pointLight color={glow} intensity={defeated ? 0.2 : 1.5} distance={2.6} position={[0, 0.62, 0.4]} />
    </group>
  );
}

function Scene({ kind, defeated, reducedMotion }) {
  return (
    <>
      <fog attach="fog" args={["#140c07", 3.4, 7.2]} />

      {/* Key light from high front-left, throwing the shadow back and right */}
      <directionalLight
        position={[-2.6, 4.2, 3.2]}
        intensity={2.1}
        color="#ffe9c4"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={12}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={3}
        shadow-camera-bottom={-3}
        shadow-bias={-0.0015}
      />
      {/* Cool fill from behind, so the silhouette separates from the background */}
      <directionalLight position={[3.0, 1.4, -2.6]} intensity={0.8} color="#6f8fd0" />
      <ambientLight intensity={0.34} color="#5a4a38" />
      {/* Warm bounce from below, like torchlight off a floor */}
      <pointLight position={[0, -1.4, 1.6]} intensity={0.55} color="#c8783a" distance={5} />

      <BossModel kind={kind} defeated={defeated} reducedMotion={reducedMotion} />

      {/* The floor exists only to catch a shadow — it's invisible otherwise,
          which is what makes the boss look planted rather than floating. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.02, 0]} receiveShadow>
        <planeGeometry args={[9, 9]} />
        <shadowMaterial opacity={0.55} />
      </mesh>
    </>
  );
}

export default function BossViewer3D({ kind, defeated, reducedMotion, height = 150 }) {
  return (
    <Canvas
      style={{ height, width: "100%", display: "block" }}
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0.15, 3.05], fov: 42, near: 0.1, far: 20 }}
      frameloop={reducedMotion ? "demand" : "always"}
    >
      <Suspense fallback={null}>
        <Scene kind={kind} defeated={defeated} reducedMotion={reducedMotion} />
      </Suspense>
    </Canvas>
  );
}
