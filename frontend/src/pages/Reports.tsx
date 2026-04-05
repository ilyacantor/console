import ModuleIframe from '../components/ModuleIframe'

const CONVERGENCE_BASE = import.meta.env.VITE_CONVERGENCE_URL || 'http://localhost:3010'

export default function Reports() {
  return <ModuleIframe serviceName="Convergence" baseUrl={`${CONVERGENCE_BASE}/reports`} title="Reports" />
}
