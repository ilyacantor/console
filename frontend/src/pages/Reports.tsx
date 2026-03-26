import ModuleIframe from '../components/ModuleIframe'

const NLQ_BASE = import.meta.env.VITE_NLQ_URL || 'http://localhost:3005'

export default function Reports() {
  return <ModuleIframe serviceName="NLQ" baseUrl={`${NLQ_BASE}?view=reports`} title="NLQ Reports" />
}
