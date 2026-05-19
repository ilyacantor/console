export interface NavItem {
  label: string
  path: string
  color: string
  indent?: boolean
  external?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

const OPERATE: NavSection = {
  title: 'OPERATE',
  items: [
    { label: 'Pipeline', path: '/pipeline', color: '#22C55E' },
    { label: 'Changes', path: '/changes', color: '#F59E0B' },
  ],
}

const PIPELINES: NavSection = {
  title: 'PIPELINES',
  items: [
    { label: 'Catalog', path: '/pipelines/catalog', color: '#22D3EE' },
    { label: 'Mappings', path: '/pipelines/mappings', color: '#22D3EE' },
    { label: 'Mappings Review', path: '/mappings/review', color: '#22D3EE' },
    { label: 'Identity', path: '/pipelines/identity', color: '#22D3EE' },
    { label: 'Consumer', path: '/pipelines/consumer', color: '#22D3EE' },
  ],
}

const MONITOR: NavSection = {
  title: 'MONITOR',
  items: [
    { label: 'Dashboards', path: '/dashboards', color: '#3B82F6' },
    { label: 'Inspect', path: '/inspect', color: '#3B82F6' },
  ],
}

const MAI: NavSection = {
  title: 'M.AI',
  items: [
    { label: 'Tasks', path: '/tasks', color: '#7C3AED' },
    { label: 'Constitution', path: '/constitution', color: '#7C3AED' },
    { label: 'Instrumentation', path: '/instrumentation', color: '#7C3AED' },
    { label: 'Operator Feed', path: '/operator-feed', color: '#7C3AED' },
  ],
}

const SYSTEM: NavSection = {
  title: 'SYSTEM',
  items: [
    { label: 'Config', path: '/config', color: '#9CA3AF' },
    { label: 'Narrative', path: '/narrative-editor', color: '#9CA3AF' },
    { label: 'Policy', path: '', color: '#9CA3AF', external: 'https://aodv3-1.onrender.com' },
  ],
}

export const SIDEBAR_NAV: NavSection[] = [OPERATE, PIPELINES, MONITOR, MAI, SYSTEM]
