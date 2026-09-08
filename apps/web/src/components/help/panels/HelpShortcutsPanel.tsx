import { HelpTabPanelShell } from '../HelpTabPanelShell';
import { HelpShortcutsBody } from './HelpShortcutsBody';

/** Keyboard shortcuts reference panel on the Help page. */
export const HelpShortcutsPanel = () => (
  <HelpTabPanelShell tabKey="shortcuts">
    <HelpShortcutsBody />
  </HelpTabPanelShell>
);
