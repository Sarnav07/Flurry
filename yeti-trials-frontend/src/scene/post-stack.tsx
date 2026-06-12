import {
  Bloom,
  DepthOfField,
  EffectComposer,
  Noise,
  Vignette,
} from '@react-three/postprocessing';

/**
 * Frost_Grade post stack: controlled bloom, vignette, depth-of-field, and a
 * subtle film grain. Stylized, not photoreal. Rendered only when the caller has
 * confirmed `VITE_ENABLE_POST_FX` + device capability.
 */
export function FrostPostStack() {
  return (
    <EffectComposer>
      <Bloom intensity={0.5} luminanceThreshold={0.55} luminanceSmoothing={0.25} mipmapBlur />
      <DepthOfField focusDistance={0.012} focalLength={0.025} bokehScale={1.5} />
      <Vignette eskil={false} offset={0.2} darkness={0.72} />
      <Noise opacity={0.035} />
    </EffectComposer>
  );
}
