import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Pipeline from './pages/Pipeline'
import Dashboards from './pages/Dashboards'
import Inspect from './pages/Inspect'
import Changes from './pages/Changes'
import Tasks from './pages/Tasks'
import Constitution from './pages/Constitution'
import Instrumentation from './pages/Instrumentation'
import Config from './pages/Config'
import NarrativeEditor from './pages/NarrativeEditor'
import OperatorFeed from './pages/OperatorFeed'
import PipelineCatalog from './pages/PipelineCatalog'
import PipelineMappings from './pages/PipelineMappings'
import MappingsReview from './pages/MappingsReview'
import PipelineIdentity from './pages/PipelineIdentity'
import PipelineConsumer from './pages/PipelineConsumer'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/pipeline" replace />} />
        <Route path="/pipeline" element={<Pipeline />} />
        <Route path="/pipelines/catalog" element={<PipelineCatalog />} />
        <Route path="/pipelines/mappings" element={<PipelineMappings />} />
        <Route path="/mappings/review" element={<MappingsReview />} />
        <Route path="/pipelines/identity" element={<PipelineIdentity />} />
        <Route path="/pipelines/consumer" element={<PipelineConsumer />} />
        <Route path="/dashboards" element={<Dashboards />} />
        <Route path="/inspect" element={<Inspect />} />
        <Route path="/changes" element={<Changes />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/constitution" element={<Constitution />} />
        <Route path="/instrumentation" element={<Instrumentation />} />
        <Route path="/config" element={<Config />} />
        <Route path="/narrative-editor" element={<NarrativeEditor />} />
        <Route path="/operator-feed" element={<OperatorFeed />} />
      </Routes>
    </Layout>
  )
}
