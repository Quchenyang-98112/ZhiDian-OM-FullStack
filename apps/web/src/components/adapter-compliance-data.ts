import { CircleAlert, CircleCheck, CircleMinus, type LucideIcon } from 'lucide-react';
import type { AdapterType } from './adapter-config-types';

export type ComplianceStatus = 'compliant' | 'partial' | 'na';

export interface ComplianceItem {
  key: string;
  descKey: string;
  adapters: Record<AdapterType, ComplianceStatus>;
}

/** §14a EnWG and VDE-AR-N 4105 compliance matrix for core protocol adapters. */
export const COMPLIANCE_MATRIX: ComplianceItem[] = [
  {
    key: 'c14a_gridCurtailment',
    descKey: 'c14a_gridCurtailmentDesc',
    adapters: {
      victron: 'compliant',
      modbus: 'compliant',
      knx: 'na',
      ocpp: 'compliant',
      eebus: 'compliant',
    },
  },
  {
    key: 'c14a_smartMeterGateway',
    descKey: 'c14a_smartMeterGatewayDesc',
    adapters: {
      victron: 'partial',
      modbus: 'partial',
      knx: 'na',
      ocpp: 'partial',
      eebus: 'compliant',
    },
  },
  {
    key: 'c14a_loadManagement',
    descKey: 'c14a_loadManagementDesc',
    adapters: {
      victron: 'compliant',
      modbus: 'compliant',
      knx: 'partial',
      ocpp: 'compliant',
      eebus: 'compliant',
    },
  },
  {
    key: 'c14a_reducedTariff',
    descKey: 'c14a_reducedTariffDesc',
    adapters: {
      victron: 'partial',
      modbus: 'partial',
      knx: 'na',
      ocpp: 'compliant',
      eebus: 'compliant',
    },
  },
  {
    key: 'vde_activePowerCurtail',
    descKey: 'vde_activePowerCurtailDesc',
    adapters: {
      victron: 'compliant',
      modbus: 'compliant',
      knx: 'na',
      ocpp: 'na',
      eebus: 'partial',
    },
  },
  {
    key: 'vde_reactivePowerControl',
    descKey: 'vde_reactivePowerControlDesc',
    adapters: {
      victron: 'compliant',
      modbus: 'compliant',
      knx: 'na',
      ocpp: 'na',
      eebus: 'partial',
    },
  },
  {
    key: 'vde_frequencyProtection',
    descKey: 'vde_frequencyProtectionDesc',
    adapters: { victron: 'compliant', modbus: 'compliant', knx: 'na', ocpp: 'na', eebus: 'na' },
  },
  {
    key: 'vde_voltageProtection',
    descKey: 'vde_voltageProtectionDesc',
    adapters: { victron: 'compliant', modbus: 'compliant', knx: 'na', ocpp: 'na', eebus: 'na' },
  },
  {
    key: 'vde_gridCodeCompliant',
    descKey: 'vde_gridCodeCompliantDesc',
    adapters: { victron: 'compliant', modbus: 'partial', knx: 'na', ocpp: 'na', eebus: 'na' },
  },
];

export const STATUS_CONFIG: Record<
  ComplianceStatus,
  { icon: LucideIcon; color: string; labelKey: string }
> = {
  compliant: { icon: CircleCheck, color: 'text-emerald-400', labelKey: 'adapterConfig.compliant' },
  partial: { icon: CircleAlert, color: 'text-amber-400', labelKey: 'adapterConfig.partial' },
  na: { icon: CircleMinus, color: 'text-(--color-muted)', labelKey: 'adapterConfig.notApplicable' },
};
