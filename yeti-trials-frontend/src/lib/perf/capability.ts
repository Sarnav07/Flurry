export interface DeviceCapability {
  webgl: boolean;
  lowEnd: boolean;
}

interface NavLike {
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

/** Probe WebGL support + a coarse low-end heuristic. SSR-safe. */
export function probeCapability(): DeviceCapability {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { webgl: false, lowEnd: true };
  }
  let webgl = false;
  try {
    const canvas = document.createElement('canvas');
    webgl = canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
  } catch {
    webgl = false;
  }
  const nav = navigator as NavLike;
  const mem = nav.deviceMemory;
  const cores = nav.hardwareConcurrency ?? 4;
  const lowEnd = (mem !== undefined && mem <= 4) || cores <= 4;
  return { webgl, lowEnd };
}

/** 3D requires the flag AND WebGL; otherwise the 2.5D fallback path is used. */
export function canRender3D(enable3D: boolean, cap: DeviceCapability): boolean {
  return enable3D && cap.webgl;
}

/** Post-processing requires the flag, WebGL, and a non-low-end device. */
export function canPostFx(enablePostFx: boolean, cap: DeviceCapability): boolean {
  return enablePostFx && cap.webgl && !cap.lowEnd;
}
