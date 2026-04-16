import ModuleIframe from '../components/ModuleIframe'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'
import { useChatScope } from '../context/ChatScopeContext'
import { useEngagement } from '../context/EngagementContext'

const CONVERGENCE_BASE = import.meta.env.VITE_CONVERGENCE_URL || 'http://localhost:3010'

export default function Reports() {
  const { activeEngagement } = useEngagement()
  // Reports are always per-engagement; publish active engagement to chat scope.
  useChatScope({ engagement_id: activeEngagement?.engagement_id ?? null })
  useSurfaceExtras('page:reports', {
    visible_panels: ['Convergence reports iframe'],
    extra: {
      page: 'reports',
      description: 'Convergence ME reports (combining, bridge, QoE, cross-sell, COFA)',
      iframe_url: `${CONVERGENCE_BASE}/reports`,
      engagement_id: activeEngagement?.engagement_id ?? null,
    },
  })
  return <ModuleIframe serviceName="Convergence" baseUrl={`${CONVERGENCE_BASE}/reports`} title="Reports" />
}
