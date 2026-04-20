import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Pipeline from './pages/Pipeline'
import Dashboards from './pages/Dashboards'
import Reports from './pages/Reports'
import Inspect from './pages/Inspect'
import Deal from './pages/Deal'
import Changes from './pages/Changes'
import Tasks from './pages/Tasks'
import Engagements from './pages/Engagements'
import Constitution from './pages/Constitution'
import Instrumentation from './pages/Instrumentation'
import Config from './pages/Config'
import NarrativeEditor from './pages/NarrativeEditor'
import DueDiligence from './pages/DueDiligence'
import Integration from './pages/Integration'
import Merge from './pages/Merge'
import Context from './pages/Context'
import OperatorFeed from './pages/OperatorFeed'
import ConvergencePage from './pages/Convergence'

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
        <Route path="/due-diligence" element={<DueDiligence />} />
        <Route path="/integration" element={<Integration />} />
        <Route path="/changes" element={<Changes />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/engagements" element={<Engagements />} />
        <Route path="/constitution" element={<Constitution />} />
        <Route path="/instrumentation" element={<Instrumentation />} />
        <Route path="/config" element={<Config />} />
        <Route path="/narrative-editor" element={<NarrativeEditor />} />
        <Route path="/merge" element={<Merge />} />
        <Route path="/context" element={<Context />} />
        <Route path="/operator-feed" element={<OperatorFeed />} />
        <Route path="/convergence" element={<ConvergencePage />} />
      </Routes>
    </Layout>
  )
}
