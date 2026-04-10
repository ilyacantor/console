import ModuleIframe from '../components/ModuleIframe'

const CONVERGENCE_BASE = import.meta.env.VITE_CONVERGENCE_URL
if (!CONVERGENCE_BASE) {
  throw new Error('VITE_CONVERGENCE_URL is required — set it at build time so Reports can reach Convergence')
}

export default function Reports() {
  return <ModuleIframe serviceName="Convergence" baseUrl={`${CONVERGENCE_BASE}/reports`} title="Reports" />
}
