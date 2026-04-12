import type { Mode } from '../context/ModeContext'

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

const MA_SECTION: NavSection = {
  title: 'M&A',
  items: [
    { label: 'Merge', path: '/merge', color: '#F97066' },
    { label: 'Due Diligence', path: '/due-diligence', color: '#F97066' },
    { label: 'Integration', path: '/integration', color: '#F97066' },
  ],
}

const MONITOR_FULL: NavSection = {
  title: 'MONITOR',
  items: [
    { label: 'Dashboards', path: '/dashboards', color: '#3B82F6' },
    { label: 'Reports', path: '/reports', color: '#3B82F6' },
    { label: 'Context', path: '/context', color: '#3B82F6' },
  ],
}

const MONITOR_MA: NavSection = {
  title: 'MONITOR',
  items: [
    { label: 'Changes', path: '/changes', color: '#F59E0B' },
    { label: 'Pipeline', path: '/pipeline', color: '#22C55E' },
  ],
}

const MAI: NavSection = {
  title: 'M.AI',
  items: [
    { label: 'Engagements', path: '/engagements', color: '#7C3AED' },
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

const MONITOR_ALL: NavSection = {
  title: 'MONITOR',
  items: [
    { label: 'Dashboards', path: '/dashboards', color: '#3B82F6' },
    { label: 'Reports', path: '/reports', color: '#3B82F6' },
    { label: 'Context', path: '/context', color: '#3B82F6' },
    { label: 'Changes', path: '/changes', color: '#F59E0B' },
    { label: 'Pipeline', path: '/pipeline', color: '#22C55E' },
  ],
}

const SE_NAV: NavSection[] = [OPERATE, MONITOR_FULL, MAI, SYSTEM]
const MA_NAV: NavSection[] = [MA_SECTION, MONITOR_MA, MAI, SYSTEM]
const ME_NAV: NavSection[] = [OPERATE, MONITOR_FULL, MAI, SYSTEM]
const ALL_NAV: NavSection[] = [OPERATE, MA_SECTION, MONITOR_ALL, MAI, SYSTEM]

export const NAV_BY_MODE: Record<Mode, NavSection[]> = {
  SE: SE_NAV,
  MA: MA_NAV,
  ME: ME_NAV,
  ALL: ALL_NAV,
}
