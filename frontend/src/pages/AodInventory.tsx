/**
 * AOD Inventory — Stage 1 of the deployment tour.
 *
 * Thin iframe wrapper. AOD owns its own Discovery surface (topology tab
 * with governance + SOR stat cards) at AOD_BASE/. Console embeds it; it
 * does not rebuild it.
 *
 * Demo URL override via VITE_AOD_URL; defaults to localhost:8001.
 */

import ModuleIframe from '../components/ModuleIframe'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'

const AOD_BASE = import.meta.env.VITE_AOD_URL || 'http://localhost:8001'

export default function AodInventory() {
  useSurfaceExtras('page:aod-inventory', {
    visible_panels: ['AOD Discovery iframe'],
    extra: {
      page: 'aod-inventory',
      iframe_url: AOD_BASE,
      module: 'AOD',
    },
  })
  return <ModuleIframe serviceName="AOD" baseUrl={AOD_BASE} title="AOD Discovery" />
}
