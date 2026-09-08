import type { EEBUSRevocationConfig } from '@nexus-hems/shared-types';

/** Runtime EEBUS TLS revocation policy (admin-configurable via API). */
let revocationConfig: EEBUSRevocationConfig = { mode: 'off' };

export function getEebusRevocationConfig(): EEBUSRevocationConfig {
  return revocationConfig;
}

export function setEebusRevocationConfig(config: EEBUSRevocationConfig): void {
  revocationConfig = config;
}
