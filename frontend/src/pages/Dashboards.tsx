import ModuleIframe from '../components/ModuleIframe'
import { useSurfaceExtras } from '../context/SurfaceExtrasContext'

const NLQ_BASE = import.meta.env.VITE_NLQ_URL || 'http://localhost:3005'

export default function Dashboards() {
  useSurfaceExtras('page:dashboards', {
    visible_panels: ['NLQ dashboards iframe'],
    extra: {
      page: 'dashboards',
      description: 'Natural-language query dashboards served by NLQ',
      iframe_url: `${NLQ_BASE}?view=dashboard`,
    },
  })
  return <ModuleIframe serviceName="NLQ" baseUrl={`${NLQ_BASE}?view=dashboard`} title="NLQ Dashboards" />
}
