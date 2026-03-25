import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Pipeline from './pages/Pipeline'
import Dashboards from './pages/Dashboards'
import Reports from './pages/Reports'
import Inspect from './pages/Inspect'
import Deal from './pages/Deal'
import Upload from './pages/Upload'
import Changes from './pages/Changes'
import Tasks from './pages/Tasks'
import Engagements from './pages/Engagements'
import Constitution from './pages/Constitution'
import Instrumentation from './pages/Instrumentation'
import Config from './pages/Config'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/pipeline" replace />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/dashboards" element={<Dashboards />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/inspect" element={<Inspect />} />
        <Route path="/deal" element={<Deal />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/changes" element={<Changes />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/engagements" element={<Engagements />} />
        <Route path="/constitution" element={<Constitution />} />
        <Route path="/instrumentation" element={<Instrumentation />} />
        <Route path="/config" element={<Config />} />
      </Routes>
    </Layout>
  )
}
