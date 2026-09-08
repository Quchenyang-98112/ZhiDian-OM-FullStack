import type { ComponentType } from 'react';

export interface AdapterSettingsSectionProps {
  adapterId: string;
  isReadOnly: boolean;
}

export interface AdapterSettingsSection {
  adapterId: string;
  order: number;
  Component: ComponentType<AdapterSettingsSectionProps>;
}

const sections = new Map<string, AdapterSettingsSection>();

/** Register a contrib adapter settings panel (e.g. Home Assistant MQTT). */
export function registerAdapterSettingsSection(section: AdapterSettingsSection): void {
  sections.set(section.adapterId, section);
}

/** Remove a registered settings section (tests / hot-unload). */
export function unregisterAdapterSettingsSection(adapterId: string): boolean {
  return sections.delete(adapterId);
}

export function getAdapterSettingsSection(adapterId: string): AdapterSettingsSection | undefined {
  return sections.get(adapterId);
}

/** All registered sections sorted by ascending `order`. */
export function listAdapterSettingsSections(): AdapterSettingsSection[] {
  return [...sections.values()].sort((a, b) => a.order - b.order);
}

/** Reset registry — test helper only. */
export function clearAdapterSettingsSections(): void {
  sections.clear();
}
