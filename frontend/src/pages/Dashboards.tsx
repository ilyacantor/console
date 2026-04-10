import ModuleIframe from '../components/ModuleIframe'

const NLQ_BASE = import.meta.env.VITE_NLQ_URL
if (!NLQ_BASE) {
  throw new Error('VITE_NLQ_URL is required — set it at build time so Dashboards can reach NLQ')
}

export default function Dashboards() {
  return <ModuleIframe serviceName="NLQ" baseUrl={`${NLQ_BASE}?view=dashboard`} title="NLQ Dashboards" />
}
