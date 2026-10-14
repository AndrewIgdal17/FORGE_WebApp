import type { ReactElement } from 'react';
import { AfudcPanel } from '@/components/sections/afudc-panel';
import { BaseMitigation } from '@/components/sections/base-mitigation';
import { CapitalContingencies } from '@/components/sections/capital-contingencies';
import { ConductorDetails } from '@/components/sections/conductor-details';
import { ConductorMaintenance } from '@/components/sections/conductor-maintenance';
import { ConverterDetails } from '@/components/sections/converter-details';
import { ConverterMaintenance } from '@/components/sections/converter-maintenance';
import { DelayCosts } from '@/components/sections/delay-costs';
import { EconomicDetails } from '@/components/sections/economic-details';
import { EmissionsSection } from '@/components/sections/emissions-section';
import { EnergyMixSection } from '@/components/sections/energy-mix-section';
import { EnvCredits } from '@/components/sections/env-credits';
import { FinancialRates } from '@/components/sections/financial-rates';
import { InsurancePanel } from '@/components/sections/insurance-panel';
import { OutageRisk } from '@/components/sections/outage-risk';
import { RightsOfWay } from '@/components/sections/rights-of-way';
import { StructureMaintenance } from '@/components/sections/structure-maintenance';
import { SystemConstraints } from '@/components/sections/system-constraints';
import { TechnologySection } from '@/components/sections/technology-section';
import { TerrainMix } from '@/components/sections/terrain-mix';
import { TimelineSection } from '@/components/sections/timeline-section';
import { VegetationMgmt } from '@/components/sections/vegetation-mgmt';
import { WildfireRisk } from '@/components/sections/wildfire-risk';

export interface SectionDispatcherProps {
  subItemId: string;
  milesFromRoute?: boolean;
}

/**
 * Maps an inputs sidebar sub-item to its form section.
 * Form IDs come from `SIDEBAR_SECTIONS.inputs`. `route` is not a form
 * section: the workspace mounts `MapPanel` for that id. Maintenance panels
 * are separate sections that the sidebar does not list as their own sub-items.
 */
export function SectionDispatcher({
  subItemId,
  milesFromRoute = false,
}: SectionDispatcherProps): ReactElement {
  switch (subItemId) {
    case 'technology':
      return <TechnologySection />;
    case 'timeline':
      return <TimelineSection />;
    case 'conductor-details':
      return <ConductorDetails />;
    case 'converter-details':
      return <ConverterDetails />;
    case 'terrain-mix':
      return <TerrainMix milesFromRoute={milesFromRoute} />;
    case 'rights-of-way':
      return <RightsOfWay milesFromRoute={milesFromRoute} />;
    case 'economic-details':
      return <EconomicDetails />;
    case 'system-constraints':
      return <SystemConstraints />;
    case 'rates':
      return <FinancialRates />;
    case 'afudc':
      return <AfudcPanel />;
    case 'conductor':
      return <CapitalContingencies />;
    case 'base-mitigation':
      return <BaseMitigation />;
    case 'credits':
      return <EnvCredits />;
    case 'operational-insurance':
      return <InsurancePanel />;
    case 'vegetation-management':
      return <VegetationMgmt />;
    case 'delay-costs':
      return <DelayCosts />;
    case 'wildfire-risk':
      return <WildfireRisk />;
    case 'outage-risk':
      return <OutageRisk />;
    case 'energy-emissions-energy':
      return <EnergyMixSection />;
    case 'energy-emissions-emissions':
      return <EmissionsSection />;
    case 'conductor-maintenance':
      return <ConductorMaintenance />;
    case 'structure-maintenance':
      return <StructureMaintenance />;
    case 'converter-maintenance':
      return <ConverterMaintenance />;
    default:
      return <div className="p-4 text-gray-500">Section not found: {subItemId}</div>;
  }
}
