import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Float,
  MeshDistortMaterial,
  RoundedBox,
  Sparkles,
} from '@react-three/drei';
import { useMemo, useRef } from 'react';
import type { Group } from 'three';

import { FrostPostStack } from '~/scene/post-stack';
import type { TerritoryRenderState } from '~/lib/territory/renderState';
import type { TerritoryStateVM } from '~/lib/types/viewModels';

// Faction accents as hex approximations of the OKLCH Frost_Grade palette.
const ACCENT: Readonly<Record<number, string>> = {
  0: '#6db0e8',
  1: '#c9dcf2',
  2: '#9d8cf0',
  3: '#79cfe0',
};
const NEUTRAL = '#33455f';
const ICE = '#dbe9ff';
const VOID = '#0b1220';
const GOLDEN_HOUR = '#e8c27a';

export interface SceneProps {
  territory: TerritoryStateVM;
  renderState: TerritoryRenderState;
  reducedMotion: boolean;
  postFx: boolean;
  onDegrade: () => void;
}

/** Samples FPS; if sustained below 30 it asks the host to fall back to 2.5D. */
function FpsMonitor({ onDegrade }: { onDegrade: () => void }) {
  const frames = useRef(0);
  const start = useRef(0);
  const fired = useRef(false);
  useFrame((state) => {
    if (start.current === 0) start.current = state.clock.elapsedTime;
    frames.current += 1;
    const elapsed = state.clock.elapsedTime - start.current;
    if (elapsed >= 2) {
      if (!fired.current && frames.current / elapsed < 30) {
        fired.current = true;
        onDegrade();
      }
      frames.current = 0;
      start.current = state.clock.elapsedTime;
    }
  });
  return null;
}

/**
 * Slow cinematic orbit with an ease-in dolly. On the confirmed settled beat the
 * camera eases closer. Static, well-framed shot under reduced motion.
 */
function CinematicCamera({ settled, reducedMotion }: { settled: boolean; reducedMotion: boolean }) {
  const { camera } = useThree();
  const angle = useRef(reducedMotion ? 0.6 : -0.4);
  const radius = useRef(13);
  useFrame((_, dt) => {
    const baseR = settled ? 7 : 9;
    if (reducedMotion) {
      angle.current = 0.6;
      radius.current = baseR;
    } else {
      angle.current += dt * 0.12;
      radius.current += (baseR - radius.current) * Math.min(1, dt * 1.4);
    }
    const r = radius.current;
    camera.position.set(Math.sin(angle.current) * r, 4.6, Math.cos(angle.current) * r);
    camera.lookAt(0, 0.5, 0);
  });
  return null;
}

interface TileSpec {
  x: number;
  z: number;
  color: string;
  glow: number;
  height: number;
}

function Tiles({
  territory,
  renderState,
  reducedMotion,
}: Omit<SceneProps, 'postFx' | 'onDegrade'>) {
  const group = useRef<Group>(null);
  const captured = renderState.owners !== null;
  const settled = renderState.lifecycle === 'settled';

  const tiles = useMemo<TileSpec[]>(() => {
    const owners = renderState.owners ?? territory.owners;
    const count = owners.length > 0 ? owners.length : 6;
    const cols = Math.ceil(Math.sqrt(count));
    const gap = 1.05;
    return Array.from({ length: count }, (_, i) => {
      const factionId = owners[i];
      const owned = captured && factionId !== undefined;
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        x: (col - (cols - 1) / 2) * gap,
        z: (row - (cols - 1) / 2) * gap,
        color: owned ? (ACCENT[factionId] ?? NEUTRAL) : NEUTRAL,
        glow: owned ? (settled ? 0.35 : 0.7) : 0.08,
        height: owned ? 0.4 : 0.22,
      };
    });
  }, [territory.owners, renderState.owners, captured, settled]);

  // Capture ice-spread: the captured field rises into place on the finalized beat.
  useFrame(() => {
    if (group.current === null) return;
    const target = 1;
    const cur = group.current.scale.y;
    const next = reducedMotion || !captured ? target : cur + (target - cur) * 0.06;
    group.current.scale.set(1, captured ? next : 1, 1);
  });

  return (
    <group ref={group}>
      {tiles.map((t, i) => (
        <RoundedBox
          key={i}
          args={[0.9, t.height, 0.9]}
          radius={0.08}
          smoothness={3}
          position={[t.x, t.height / 2, t.z]}
        >
          <meshStandardMaterial
            color={t.color}
            emissive={t.color}
            emissiveIntensity={t.glow}
            roughness={0.35}
            metalness={0.15}
          />
        </RoundedBox>
      ))}
    </group>
  );
}

/** A living frost crystal floating over the map. */
function Mascot({ reducedMotion, settled }: { reducedMotion: boolean; settled: boolean }) {
  const crystal = (
    <mesh position={[0, 2, 0]}>
      <icosahedronGeometry args={[0.72, 1]} />
      <MeshDistortMaterial
        color={ICE}
        emissive={settled ? GOLDEN_HOUR : '#6db0e8'}
        emissiveIntensity={0.45}
        distort={reducedMotion ? 0 : 0.28}
        speed={reducedMotion ? 0 : 1.8}
        roughness={0.12}
        metalness={0.25}
      />
    </mesh>
  );
  return reducedMotion ? (
    crystal
  ) : (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.7}>
      {crystal}
    </Float>
  );
}

/**
 * Cinematic 3D Territory scene. Consumes the SAME TerritoryRenderState as the
 * 2.5D path. The warm golden-hour key light is reserved strictly for the
 * settled (impact-disbursed) confirmed beat. Offline-safe (no remote HDR/assets).
 */
export default function TerritoryScene({
  territory,
  renderState,
  reducedMotion,
  postFx,
  onDegrade,
}: SceneProps) {
  const settled = renderState.lifecycle === 'settled';
  return (
    <Canvas
      shadows={false}
      camera={{ position: [0, 5, 12], fov: 42 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true }}
      role="img"
      aria-label={`Territory map, ${renderState.lifecycle} state`}
      style={{ height: 'min(72vh, 620px)', borderRadius: '0.75rem' }}
    >
      <color attach="background" args={[VOID]} />
      <fog attach="fog" args={[VOID, 10, 26]} />

      <ambientLight intensity={0.45} />
      <hemisphereLight intensity={0.4} color="#cfe2ff" groundColor="#16233a" />
      <directionalLight position={[6, 10, 4]} intensity={1.1} color="#dbe9ff" />
      <pointLight position={[-5, 3, -4]} intensity={20} color="#6db0e8" distance={20} />
      {settled ? (
        <directionalLight position={[-5, 4, 3]} intensity={1.6} color={GOLDEN_HOUR} />
      ) : null}

      {/* Frozen ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[11, 64]} />
        <meshStandardMaterial color="#16233a" roughness={0.95} metalness={0.05} />
      </mesh>
      <ContactShadows position={[0, 0, 0]} opacity={0.55} scale={22} blur={2.6} far={8} color="#020912" />

      <Tiles territory={territory} renderState={renderState} reducedMotion={reducedMotion} />
      <Mascot reducedMotion={reducedMotion} settled={settled} />

      {/* Drifting snow / frost motes */}
      <Sparkles
        count={140}
        scale={[18, 10, 18]}
        position={[0, 4, 0]}
        size={3}
        speed={reducedMotion ? 0 : 0.4}
        opacity={0.7}
        color={ICE}
      />

      <CinematicCamera settled={settled} reducedMotion={reducedMotion} />
      <FpsMonitor onDegrade={onDegrade} />
      {postFx ? <FrostPostStack /> : null}
    </Canvas>
  );
}
