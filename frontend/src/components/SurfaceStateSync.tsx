import { useSurfaceState } from '../hooks/useSurfaceState';

/**
 * Mounts `useSurfaceState` once so it runs inside the Router + Engagement +
 * SurfaceExtras providers. Renders nothing.
 */
export default function SurfaceStateSync() {
  useSurfaceState();
  return null;
}
