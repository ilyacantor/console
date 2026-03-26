import ModuleIframe from '../components/ModuleIframe'

// NLQ has no URL routing — deep linking to reports view not supported yet
const NLQ_BASE = import.meta.env.VITE_NLQ_URL || 'http://localhost:3005'

export default function Reports() {
  return <ModuleIframe serviceName="NLQ" baseUrl={NLQ_BASE} title="NLQ Reports" />
}
