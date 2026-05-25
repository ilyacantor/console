/**
 * Synthetic Environment Preview — Stage 2 of the deployment tour.
 *
 * Thin iframe wrapper. Farm owns its own synthetic-data surface at
 * FARM_BASE/. Console embeds it; it does not rebuild it.
 *
 * Demo URL override via VITE_FARM_URL; defaults to localhost:8003.
 */

import ModuleIframe from '../components/ModuleIframe'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'

const FARM_BASE = import.meta.env.VITE_FARM_URL || 'http://localhost:8003'

export default function SyntheticPreview() {
  useSurfaceExtras('page:synthetic-preview', {
    visible_panels: ['Farm synthetic environment iframe'],
    extra: {
      page: 'synthetic-preview',
      iframe_url: FARM_BASE,
      module: 'Farm',
    },
  })
  return <ModuleIframe serviceName="Farm" baseUrl={FARM_BASE} title="Farm Synthetic Environment" />
}
