export interface SidebarSubItem {
  id: string;
  label: string;
}

export interface SidebarSection {
  id: string;
  label: string;
  color: string;
  subItems: SidebarSubItem[];
}

export interface SidebarSections {
  inputs: SidebarSection[];
  results: SidebarSection[];
}

export const SIDEBAR_SECTIONS: SidebarSections = {
  inputs: [
    {
      id: 'project-identity',
      label: 'Project Identity',
      color: '#3b82f6',
      subItems: [
        { id: 'technology', label: 'Technology' },
        { id: 'timeline', label: 'Timeline' },
      ],
    },
    {
      id: 'equipment',
      label: 'Equipment',
      color: '#6366f1',
      subItems: [
        { id: 'conductor-details', label: 'Conductors' },
        { id: 'converter-details', label: 'Converters' },
      ],
    },
    {
      id: 'routing',
      label: 'Routing & Terrain',
      color: '#0891b2',
      subItems: [
        { id: 'route', label: 'Route' },
        { id: 'terrain-mix', label: 'Terrain Mix' },
        { id: 'terminals', label: 'Terminals' },
        { id: 'rights-of-way', label: 'Rights of Way' },
      ],
    },
    {
      id: 'benefits',
      label: 'System Economics',
      color: '#10b981',
      subItems: [
        { id: 'economic-details', label: 'Value of Energy' },
        { id: 'system-constraints', label: 'System Constraints' },
      ],
    },
    {
      id: 'financial',
      label: 'Financial',
      color: '#f59e0b',
      subItems: [
        { id: 'rates', label: 'Rates & Discounting' },
        { id: 'afudc', label: 'AFUDC' },
      ],
    },
    {
      id: 'capital-costs',
      label: 'Capital Costs',
      color: '#ef4444',
      subItems: [
        { id: 'conductor', label: 'Contingencies' },
        { id: 'base-mitigation', label: 'Restoration Costs' },
        { id: 'credits', label: 'Mitigation Credits' },
      ],
    },
    {
      id: 'operating',
      label: 'Operating Costs',
      color: '#f97316',
      subItems: [
        { id: 'operational-insurance', label: 'Insurance' },
        { id: 'vegetation-management', label: 'Vegetation Mgmt' },
        { id: 'delay-costs', label: 'Delay Costs' },
      ],
    },
    {
      id: 'risk',
      label: 'Risk',
      color: '#a855f7',
      subItems: [
        { id: 'wildfire-risk', label: 'Wildfire' },
        { id: 'outage-risk', label: 'Outage' },
      ],
    },
    {
      id: 'emissions',
      label: 'Emissions',
      color: '#14b8a6',
      subItems: [{ id: 'energy-emissions-emissions', label: 'Emissions & Intensities' }],
    },
    {
      id: 'energy-mix',
      label: 'Energy Mix',
      color: '#06b6d4',
      subItems: [{ id: 'energy-emissions-energy', label: 'Energy Source Mix' }],
    },
  ],
  results: [
    {
      id: 'r-summary',
      label: 'Summary',
      color: '#10b981',
      subItems: [{ id: 'r-overview', label: 'Overview' }],
    },
    {
      id: 'r-time',
      label: 'Timeline',
      color: '#3b82f6',
      subItems: [{ id: 'r-timeline', label: 'Over Time' }],
    },
  ],
};
