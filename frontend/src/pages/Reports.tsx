import ModuleIframe from '../components/ModuleIframe'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'

const CONVERGENCE_BASE = import.meta.env.VITE_CONVERGENCE_URL || 'http://localhost:3010'

export default function Reports() {
  useSurfaceExtras('page:reports', {
    visible_panels: ['Convergence reports iframe'],
    extra: {
      page: 'reports',
      description: 'Convergence ME reports (combining, bridge, QoE, cross-sell, COFA)',
      iframe_url: `${CONVERGENCE_BASE}/reports`,
    },
  })
  return <ModuleIframe serviceName="Convergence" baseUrl={`${CONVERGENCE_BASE}/reports`} title="Reports" />
}
