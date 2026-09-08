import type { TFunction } from 'i18next';
import type { AdapterEntry } from '../adapter-config-types';

/** Shared props for adapter config field groups inside {@link AdapterConfigEntrySection}. */
export interface AdapterConfigFieldProps {
  adapter: AdapterEntry;
  onUpdate: (patch: Partial<AdapterEntry>) => void;
  inputClass: string;
  t: TFunction;
  isReadOnly?: boolean;
}

/** Props for the auth-token field group (password visibility toggle). */
export interface AdapterConfigSecurityFieldProps extends AdapterConfigFieldProps {
  showToken: boolean;
  onToggleToken: () => void;
}
