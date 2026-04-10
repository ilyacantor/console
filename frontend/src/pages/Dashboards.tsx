import ModuleIframe from '../components/ModuleIframe'

const NLQ_BASE = import.meta.env.VITE_NLQ_URL || 'http://localhost:3005'

export default function Dashboards() {
  return <ModuleIframe serviceName="NLQ" baseUrl={`${NLQ_BASE}?view=dashboard`} title="NLQ Dashboards" />
}
