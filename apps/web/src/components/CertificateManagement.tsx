/**
 * CertificateManagement — EEBUS TLS 1.3 mTLS device certificate manager
 *
 * Displays trusted EEBUS device certificates stored in Dexie and allows
 * import / export / revocation. Uses Radix UI Dialog for accessible modals.
 *
 * Also shows the SHIP Trust Store (paired devices via SHIP handshake) fetched
 * from the API, with PIN dialog support for devices in pin_required state.
 */

import type { EEBUSDeviceInfo, EEBUSRevocationConfig } from '@nexus-hems/shared-types';
import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  FileKey,
  FilePlus,
  Link2Off,
  ShieldCheck,
  ShieldOff,
  ShieldX,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { getAuthHeader } from '../lib/auth-token';
import {
  type EEBUSLocalCertificateRow,
  loadEebusLocalCertificateRows,
  persistEebusLocalCertificateRows,
} from '../lib/db';
import { loadEebusLocalCertPems, saveEebusLocalCertPems } from '../lib/secure-store';
import { SelectField } from './ui/SelectField';

// ── Types ──────────────────────────────────────────────────────────────────

type CertStatus = 'trusted' | 'revoked' | 'expired';

export interface EEBUSCertRecord {
  /** IndexedDB primary key */
  id?: number;
  deviceName: string;
  /** SHA-256 fingerprint (hex colon-separated) */
  fingerprint: string;
  /**
   * PEM is intentionally excluded from the persisted record.
   * It is stored encrypted in the vault and kept in-memory only via certPemMap.
   */
  pemData?: never;
  validUntil: number;
  createdAt: number;
  status: CertStatus;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function deriveCertStatus(record: EEBUSCertRecord): CertStatus {
  if (record.status === 'revoked') return 'revoked';
  if (record.validUntil < Date.now()) return 'expired';
  return 'trusted';
}

function formatFingerprint(hex: string): string {
  // Format as XX:XX:XX... (groups of 2, first 6 shown then '...')
  const pairs = hex.replace(/:/g, '').match(/.{1,2}/g) ?? [];
  const display = pairs.slice(0, 6).join(':');
  return pairs.length > 6 ? `${display}:…` : display;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Very basic PEM parse — validates structure only; real validation happens server-side */
function parsePEM(pem: string): { fingerprint: string; validUntil: number } | null {
  const trimmed = pem.trim();
  if (
    !trimmed.startsWith('-----BEGIN CERTIFICATE-----') ||
    !trimmed.endsWith('-----END CERTIFICATE-----')
  ) {
    return null;
  }
  // Derive a deterministic (but fake) fingerprint from PEM content for the UI demo
  // In production this would be computed via SubtleCrypto over the DER bytes
  const body = trimmed
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\s/g, '');
  let hash = 0;
  for (let i = 0; i < body.length; i++) {
    hash = ((hash << 5) - hash + body.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0').repeat(8).slice(0, 64);
  const fingerprint = (hex.match(/.{1,2}/g) ?? []).join(':');
  // Set validity to 1 year from now for imported certs (demo)
  const validUntil = Date.now() + 365 * 24 * 3600 * 1000;
  return { fingerprint, validUntil };
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: CertStatus }) {
  const { t } = useTranslation();
  const config = {
    trusted: {
      Icon: ShieldCheck,
      label: t('certManagement.statusTrusted'),
      cls: 'bg-[var(--color-neon-green)]/15 text-[var(--color-neon-green)]',
    },
    revoked: {
      Icon: ShieldX,
      label: t('certManagement.statusRevoked'),
      cls: 'bg-(--state-danger-bg)/15 text-(--state-danger-fg)',
    },
    expired: {
      Icon: ShieldOff,
      label: t('certManagement.statusExpired'),
      cls: 'bg-(--state-warning-bg)/15 text-(--state-warning-fg)',
    },
  } as const;
  const { Icon, label, cls } = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-xs ${cls}`}
    >
      <Icon aria-hidden className="size-3" />
      {label}
    </span>
  );
}

// ── Import dialog ──────────────────────────────────────────────────────────

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (pem: string, deviceName: string) => Promise<void>;
}

function ImportDialog({ open, onClose, onImport }: ImportDialogProps) {
  const { t } = useTranslation();
  const [pem, setPem] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPem((ev.target?.result as string | null) ?? '');
    };
    reader.readAsText(file);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = parsePEM(pem);
    if (!parsed) {
      setError(t('certManagement.importError'));
      return;
    }
    setLoading(true);
    try {
      await onImport(pem, deviceName || 'EEBUS Device');
      setPem('');
      setDeviceName('');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-modal-backdrop bg-black/80 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <Dialog.Content
          className="glass-panel-strong fixed top-1/2 left-1/2 z-modal w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl focus:outline-none"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="font-semibold text-(--color-text-primary) text-lg">
                {t('certManagement.importDialogTitle')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-(--color-text-secondary) text-sm">
                {t('certManagement.importHint')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="focus-ring ml-4 rounded-lg p-1.5 text-(--color-text-secondary) transition-colors hover:bg-white/10 hover:text-(--color-text-primary)"
                aria-label={t('common.close')}
              >
                <X aria-hidden className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="cert-device-name"
                className="mb-1.5 block font-medium text-(--color-text-secondary) text-sm"
              >
                {t('certManagement.deviceName')}
              </label>
              <input
                id="cert-device-name"
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="EEBUS Heat Pump 01"
                className="focus-ring w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-(--color-text-primary) text-sm placeholder:text-(--color-text-secondary)/50 focus:border-electric-blue/50"
              />
            </div>

            <div>
              <label
                htmlFor="cert-pem"
                className="mb-1.5 block font-medium text-(--color-text-secondary) text-sm"
              >
                PEM
              </label>
              <textarea
                id="cert-pem"
                ref={textareaRef}
                value={pem}
                onChange={(e) => setPem(e.target.value)}
                rows={8}
                spellCheck={false}
                className="focus-ring w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-(--color-text-primary) text-xs placeholder:text-(--color-text-secondary)/50 focus:border-electric-blue/50"
                placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-lg bg-(--state-danger-bg)/15 px-3 py-2 text-(--state-danger-fg) text-sm"
              >
                {error}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="focus-ring rounded-lg border border-white/10 px-4 py-2 font-medium text-(--color-text-secondary) text-sm transition-colors hover:bg-white/10"
                >
                  {t('common.cancel')}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={loading || !pem.trim()}
                className="focus-ring flex items-center gap-2 rounded-lg bg-electric-blue/20 px-4 py-2 font-medium text-electric-blue text-sm transition-colors hover:bg-electric-blue/30 disabled:pointer-events-none disabled:opacity-50"
              >
                <FilePlus aria-hidden className="size-4" />
                {t('certManagement.importCert')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Delete confirmation ────────────────────────────────────────────────────

interface DeleteConfirmProps {
  cert: EEBUSCertRecord | null;
  onClose: () => void;
  onConfirm: (id: number) => Promise<void>;
}

function DeleteConfirm({ cert, onClose, onConfirm }: DeleteConfirmProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!cert?.id) return;
    setLoading(true);
    try {
      await onConfirm(cert.id);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root
      open={cert !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-modal-backdrop bg-black/80 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <Dialog.Content className="glass-panel-strong fixed top-1/2 left-1/2 z-modal w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl focus:outline-none">
          <VisuallyHidden.Root>
            <Dialog.Title>
              {t('certManagement.confirmDelete', { device: cert?.deviceName ?? '' })}
            </Dialog.Title>
          </VisuallyHidden.Root>

          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--state-danger-bg)/20">
              <Trash2 aria-hidden className="size-5 text-(--state-danger-fg)" />
            </span>
            <div>
              <p className="font-semibold text-(--color-text-primary)">
                {t('certManagement.confirmDelete', { device: cert?.deviceName ?? '' })}
              </p>
              <p className="mt-1 text-(--color-text-secondary) text-sm">
                {t('certManagement.confirmDeleteDesc')}
              </p>
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className="focus-ring rounded-lg border border-white/10 px-4 py-2 font-medium text-(--color-text-secondary) text-sm transition-colors hover:bg-white/10"
              >
                {t('common.cancel')}
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="focus-ring flex items-center gap-2 rounded-lg bg-(--state-danger-bg)/20 px-4 py-2 font-medium text-(--state-danger-fg) text-sm transition-colors hover:bg-(--state-danger-bg)/30 disabled:pointer-events-none disabled:opacity-50"
            >
              <Trash2 aria-hidden className="size-4" />
              {t('certManagement.deleteCert')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── SHIP Trust Store section ───────────────────────────────────────────────

/**
 * PIN dialog: shown when a device pairing enters `pin_required` state.
 * The caller polls /api/eebus/pair/status/:ski to detect this transition.
 */
interface PinDialogProps {
  open: boolean;
  ski: string;
  pinHint?: string;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<void>;
}

function PinDialog({ open, ski, pinHint, onClose, onSubmit }: PinDialogProps) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{5,6}$/.test(pin)) {
      setError(t('shipPairing.invalidPin'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onSubmit(pin);
      setPin('');
      onClose();
    } catch {
      setError(t('shipPairing.statusFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-modal-backdrop bg-black/80 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <Dialog.Content className="glass-panel-strong fixed top-1/2 left-1/2 z-modal w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl focus:outline-none">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="font-semibold text-(--color-text-primary) text-lg">
                {t('shipPairing.pinDialogTitle')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-(--color-text-secondary) text-sm">
                {pinHint ?? t('shipPairing.pinDialogDesc')}
              </Dialog.Description>
              <p className="mt-1 font-mono text-(--color-text-secondary)/60 text-xs">
                SKI: {ski.slice(0, 16)}…
              </p>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="focus-ring ml-4 rounded-lg p-1.5 text-(--color-text-secondary) transition-colors hover:bg-white/10 hover:text-(--color-text-primary)"
                aria-label={t('common.close')}
              >
                <X aria-hidden className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{5,6}"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder={t('shipPairing.pinPlaceholder')}
              className="focus-ring w-full rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-center font-mono text-(--color-text-primary) text-2xl tracking-[0.4em] placeholder:text-(--color-text-secondary)/40"
              aria-label={t('shipPairing.pinDialogTitle')}
            />
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-(--state-danger-bg)/15 px-3 py-2 text-(--state-danger-fg) text-sm"
              >
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="focus-ring rounded-lg border border-white/10 px-4 py-2 font-medium text-(--color-text-secondary) text-sm transition-colors hover:bg-white/10"
                >
                  {t('shipPairing.pinCancel')}
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={loading || pin.length < 5}
                className="focus-ring flex items-center gap-2 rounded-lg bg-neon-green/20 px-4 py-2 font-medium text-neon-green text-sm transition-colors hover:bg-neon-green/30 disabled:pointer-events-none disabled:opacity-50"
              >
                <ShieldCheck aria-hidden className="size-4" />
                {t('shipPairing.pinSubmit')}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Remove-trust confirmation dialog */
interface RemoveTrustDialogProps {
  device: EEBUSDeviceInfo | null;
  onClose: () => void;
  onConfirm: (ski: string) => Promise<void>;
}

function RemoveTrustDialog({ device, onClose, onConfirm }: RemoveTrustDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const label =
    device?.brand && device.model
      ? `${device.brand} ${device.model}`
      : (device?.hostname ?? device?.ski?.slice(0, 12) ?? '');

  const handleConfirm = async () => {
    if (!device) return;
    setLoading(true);
    try {
      await onConfirm(device.ski);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog.Root
      open={device !== null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-modal-backdrop bg-black/80 backdrop-blur-sm data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <Dialog.Content className="glass-panel-strong fixed top-1/2 left-1/2 z-modal w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6 shadow-2xl focus:outline-none">
          <VisuallyHidden.Root>
            <Dialog.Title>{t('shipPairing.confirmRemove', { device: label })}</Dialog.Title>
          </VisuallyHidden.Root>
          <div className="flex items-start gap-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--state-danger-bg)/20">
              <Link2Off aria-hidden className="size-5 text-(--state-danger-fg)" />
            </span>
            <div>
              <p className="font-semibold text-(--color-text-primary)">
                {t('shipPairing.confirmRemove', { device: label })}
              </p>
              <p className="mt-1 text-(--color-text-secondary) text-sm">
                {t('shipPairing.confirmRemoveDesc')}
              </p>
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <Dialog.Close asChild>
              <button
                type="button"
                className="focus-ring rounded-lg border border-white/10 px-4 py-2 font-medium text-(--color-text-secondary) text-sm transition-colors hover:bg-white/10"
              >
                {t('common.cancel')}
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="focus-ring flex items-center gap-2 rounded-lg bg-(--state-danger-bg)/20 px-4 py-2 font-medium text-(--state-danger-fg) text-sm transition-colors hover:bg-(--state-danger-bg)/30 disabled:pointer-events-none disabled:opacity-50"
            >
              <Trash2 aria-hidden className="size-4" />
              {t('shipPairing.removeTrust')}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function formatDateShort(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * SHIP Trust Store section — reads from the API (/api/eebus/trust).
 * Shows all devices that have been paired via the SHIP handshake.
 */
function eebusFetchInit(method?: string, body?: unknown): RequestInit {
  const headers: Record<string, string> = { ...(getAuthHeader() ?? {}) };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const init: RequestInit = { headers };
  if (method) init.method = method;
  if (body !== undefined) init.body = JSON.stringify(body);
  return init;
}

/** Status → badge background + icon for a trusted SHIP device row. */
function shipStatusVisuals(status: EEBUSDeviceInfo['status']): {
  bgClass: string;
  Icon: typeof ShieldCheck;
  iconClass: string;
} {
  if (status === 'trusted') {
    return { bgClass: 'bg-neon-green/15', Icon: ShieldCheck, iconClass: 'text-neon-green' };
  }
  if (status === 'failed') {
    return {
      bgClass: 'bg-(--state-danger-bg)/15',
      Icon: ShieldX,
      iconClass: 'text-(--state-danger-fg)',
    };
  }
  return {
    bgClass: 'bg-(--state-warning-bg)/15',
    Icon: ShieldOff,
    iconClass: 'text-(--state-warning-fg)',
  };
}

/** A single trusted-device row in the SHIP trust store list. */
function TrustedDeviceRow({
  device,
  onRequestPin,
  onRemove,
}: {
  device: EEBUSDeviceInfo;
  onRequestPin: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const deviceLabel =
    device.brand && device.model ? `${device.brand} ${device.model}` : device.hostname;
  const isPinRequired = device.status === 'pending';
  const { bgClass, Icon, iconClass } = shipStatusVisuals(device.status);

  return (
    <li className="glass-panel flex flex-wrap items-center gap-4 rounded-xl px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full ${bgClass}`}
        >
          <Icon aria-hidden className={`size-4 ${iconClass}`} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-(--color-text-primary)">{deviceLabel}</p>
          <p className="mt-0.5 truncate font-mono text-(--color-text-secondary) text-xs">
            SKI: {device.ski.slice(0, 20)}…
          </p>
          <p className="text-(--color-text-secondary)/70 text-xs">
            {device.hostname}:{device.port}
            {device.deviceType ? ` · ${device.deviceType}` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 text-right text-(--color-text-secondary) text-xs">
        {device.trustedAt > 0 && (
          <span>
            {t('shipPairing.pairedAt')} {formatDateShort(device.trustedAt)}
          </span>
        )}
        {device.lastConnectedAt && (
          <span>
            {t('shipPairing.lastConnected')} {formatDateShort(device.lastConnectedAt)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {isPinRequired && (
          <button
            type="button"
            onClick={onRequestPin}
            className="focus-ring rounded-lg bg-(--state-warning-bg)/15 px-2 py-1.5 font-medium text-(--state-warning-fg) text-xs transition-colors hover:bg-(--state-warning-bg)/25"
          >
            {t('shipPairing.statusPinRequired')}
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="focus-ring rounded-lg p-1.5 text-(--color-text-secondary) transition-colors hover:bg-(--state-danger-bg)/15 hover:text-(--state-danger-fg)"
          aria-label={`${t('shipPairing.removeTrust')} — ${deviceLabel}`}
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </div>
    </li>
  );
}

function ShipTrustStore() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [removingDevice, setRemovingDevice] = useState<EEBUSDeviceInfo | null>(null);
  const [pinSki, setPinSki] = useState<string | null>(null);
  const [activePinHint, setActivePinHint] = useState<string | undefined>(undefined);

  const {
    data: devices,
    isLoading,
    error,
  } = useQuery<EEBUSDeviceInfo[]>({
    queryKey: ['eebus-trust'],
    queryFn: async () => {
      const resp = await fetch('/api/eebus/trust', eebusFetchInit());
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json() as Promise<EEBUSDeviceInfo[]>;
    },
    refetchInterval: 10_000,
    retry: 1,
  });

  const removeMutation = useMutation({
    mutationFn: async (ski: string) => {
      const resp = await fetch(
        `/api/eebus/trust/${encodeURIComponent(ski)}`,
        eebusFetchInit('DELETE'),
      );
      if (!resp.ok && resp.status !== 204) throw new Error(`HTTP ${resp.status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eebus-trust'] });
    },
  });

  const submitPinMutation = useMutation({
    mutationFn: async ({ ski, pin }: { ski: string; pin: string }) => {
      const resp = await fetch('/api/eebus/pair/pin', eebusFetchInit('POST', { ski, pin }));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eebus-trust'] });
    },
  });

  // Poll pair/status for pending devices — auto-open PIN dialog (Milestone 2.2)
  useEffect(() => {
    const pending = devices?.filter((d) => d.status === 'pending') ?? [];
    if (pending.length === 0) return;

    let cancelled = false;
    const poll = async () => {
      for (const device of pending) {
        try {
          const resp = await fetch(
            `/api/eebus/pair/status/${encodeURIComponent(device.ski)}`,
            eebusFetchInit(),
          );
          if (!resp.ok || cancelled) continue;
          const status = (await resp.json()) as { state?: string; pinHint?: string };
          if (status.state === 'pin_required') {
            setPinSki(device.ski);
            setActivePinHint(status.pinHint);
          }
        } catch {
          /* ignore transient poll errors */
        }
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [devices]);

  const handlePinSubmit = async (pin: string) => {
    if (!pinSki) return;
    await submitPinMutation.mutateAsync({ ski: pinSki, pin });
    setPinSki(null);
  };

  return (
    <section aria-labelledby="ship-trust-heading" className="mt-8 space-y-4">
      <div>
        <h2
          id="ship-trust-heading"
          className="flex items-center gap-2 font-semibold text-(--color-text-primary) text-base"
        >
          <ShieldCheck aria-hidden className="size-5 text-neon-green" />
          {t('shipPairing.trustStoreTitle')}
        </h2>
        <p className="mt-0.5 text-(--color-text-secondary) text-sm">
          {t('shipPairing.trustStoreDesc')}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8 text-(--color-text-secondary) text-sm">
          <span className="mr-2 animate-spin">⟳</span>
          {t('common.loading')}
        </div>
      ) : error ? (
        <p
          role="alert"
          className="rounded-lg bg-(--state-danger-bg)/15 px-3 py-2 text-(--state-danger-fg) text-sm"
        >
          {t('shipPairing.loadError')}
        </p>
      ) : !devices?.length ? (
        <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl py-10 text-center">
          <ShieldOff aria-hidden className="size-10 text-(--color-text-secondary)/40" />
          <p className="font-medium text-(--color-text-secondary)">
            {t('shipPairing.noTrustedDevices')}
          </p>
          <p className="max-w-xs text-(--color-text-secondary)/70 text-sm">
            {t('shipPairing.noTrustedDevicesDesc')}
          </p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label={t('shipPairing.trustStoreTitle')}>
          {devices.map((device) => (
            <TrustedDeviceRow
              key={device.ski}
              device={device}
              onRequestPin={() => {
                setPinSki(device.ski);
                setActivePinHint(t('shipPairing.pinDialogDesc'));
              }}
              onRemove={() => setRemovingDevice(device)}
            />
          ))}
        </ul>
      )}

      <PinDialog
        open={pinSki !== null}
        ski={pinSki ?? ''}
        {...(activePinHint !== undefined ? { pinHint: activePinHint } : {})}
        onClose={() => {
          setPinSki(null);
          setActivePinHint(undefined);
        }}
        onSubmit={handlePinSubmit}
      />
      <RemoveTrustDialog
        device={removingDevice}
        onClose={() => setRemovingDevice(null)}
        onConfirm={async (ski) => {
          await removeMutation.mutateAsync(ski);
        }}
      />
    </section>
  );
}

function EebusRevocationForm({ initial }: { initial: EEBUSRevocationConfig }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<EEBUSRevocationConfig['mode']>(initial.mode);
  const [crlUrl, setCrlUrl] = useState(initial.crlUrl ?? '');
  const [ocspUrl, setOcspUrl] = useState(initial.ocspUrl ?? '');

  const saveMutation = useMutation({
    mutationFn: async (payload: EEBUSRevocationConfig) => {
      const resp = await fetch('/api/eebus/tls/revocation', eebusFetchInit('PUT', payload));
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json() as Promise<EEBUSRevocationConfig>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eebus-revocation'] });
    },
  });

  const handleSave = () => {
    const payload: EEBUSRevocationConfig = { mode };
    if (mode === 'crl' && crlUrl) payload.crlUrl = crlUrl;
    if (mode === 'ocsp' && ocspUrl) payload.ocspUrl = ocspUrl;
    saveMutation.mutate(payload);
  };

  return (
    <div className="glass-panel space-y-3 rounded-xl p-4">
      <SelectField
        label={t('eebusRevocation.modeLabel')}
        value={mode}
        onChange={(e) => setMode(e.target.value as EEBUSRevocationConfig['mode'])}
      >
        <option value="off">{t('eebusRevocation.modeOff')}</option>
        <option value="crl">{t('eebusRevocation.modeCrl')}</option>
        <option value="ocsp">{t('eebusRevocation.modeOcsp')}</option>
      </SelectField>
      {mode === 'crl' && (
        <label className="block text-(--color-text-secondary) text-sm">
          {t('eebusRevocation.crlUrl')}
          <input
            type="url"
            value={crlUrl}
            onChange={(e) => setCrlUrl(e.target.value)}
            className="focus-ring mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-(--color-text-primary) text-sm"
            placeholder="https://ca.example.com/crl.pem"
          />
        </label>
      )}
      {mode === 'ocsp' && (
        <label className="block text-(--color-text-secondary) text-sm">
          {t('eebusRevocation.ocspUrl')}
          <input
            type="url"
            value={ocspUrl}
            onChange={(e) => setOcspUrl(e.target.value)}
            className="focus-ring mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-(--color-text-primary) text-sm"
            placeholder="https://ocsp.example.com"
          />
        </label>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={saveMutation.isPending}
        className="focus-ring rounded-lg bg-neon-green/20 px-4 py-2 font-medium text-neon-green text-sm hover:bg-neon-green/30 disabled:opacity-50"
      >
        {t('eebusRevocation.save')}
      </button>
    </div>
  );
}

function EebusRevocationSettings() {
  const { t } = useTranslation();

  const { data, isLoading } = useQuery<EEBUSRevocationConfig>({
    queryKey: ['eebus-revocation'],
    queryFn: async () => {
      const resp = await fetch('/api/eebus/tls/revocation', eebusFetchInit());
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return resp.json() as Promise<EEBUSRevocationConfig>;
    },
    retry: 1,
  });

  const formKey = data ? `${data.mode}:${data.crlUrl ?? ''}:${data.ocspUrl ?? ''}` : 'loading';

  return (
    <section aria-labelledby="eebus-revocation-heading" className="mt-8 space-y-4">
      <div>
        <h2
          id="eebus-revocation-heading"
          className="font-semibold text-(--color-text-primary) text-base"
        >
          {t('eebusRevocation.title')}
        </h2>
        <p className="mt-0.5 text-(--color-text-secondary) text-sm">{t('eebusRevocation.desc')}</p>
      </div>
      {isLoading || !data ? (
        <p className="text-(--color-text-secondary) text-sm">{t('common.loading')}</p>
      ) : (
        <EebusRevocationForm key={formKey} initial={data} />
      )}
    </section>
  );
}

export function CertificateManagement() {
  const { t } = useTranslation();
  const [certs, setCerts] = useState<EEBUSCertRecord[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [deletingCert, setDeletingCert] = useState<EEBUSCertRecord | null>(null);
  const certPemMap = useRef<Map<number, string>>(new Map());
  const [pemIds, setPemIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [rows, encryptedPems] = await Promise.all([
          loadEebusLocalCertificateRows(),
          loadEebusLocalCertPems(),
        ]);
        if (!cancelled) {
          certPemMap.current = new Map(
            Object.entries(encryptedPems).map(([id, pem]) => [Number(id), pem]),
          );
          setPemIds(new Set(Object.keys(encryptedPems).map(Number)));
          setCerts(
            rows
              .filter((r): r is EEBUSLocalCertificateRow & { id: number } => r.id !== undefined)
              .map((r) => ({
                id: r.id,
                deviceName: r.deviceName,
                fingerprint: r.fingerprint,
                validUntil: r.validUntil,
                createdAt: r.createdAt,
                status: r.status,
              })),
          );
        }
      } catch {
        if (!cancelled) setCerts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistCerts = useCallback((next: EEBUSCertRecord[]) => {
    setCerts(next);
    void persistEebusLocalCertificateRows(next).catch(() => {
      /* IndexedDB quota / private mode — state still updated in-memory */
    });
  }, []);

  const handleImport = async (pem: string, deviceName: string) => {
    const parsed = parsePEM(pem);
    if (!parsed) throw new Error('invalid-pem');
    const id = Date.now();
    const newCert: EEBUSCertRecord = {
      id,
      deviceName,
      fingerprint: parsed.fingerprint,
      validUntil: parsed.validUntil,
      createdAt: Date.now(),
      status: 'trusted',
    };

    // Encrypt PEM in the vault (metadata is stored unencrypted in IndexedDB).
    certPemMap.current.set(id, pem);
    setPemIds((prev) => new Set(prev).add(id));
    void saveEebusLocalCertPems(Object.fromEntries(certPemMap.current)).catch(() => {
      /* IndexedDB quota / private mode — PEM remains in-memory for the session */
    });

    persistCerts([...certs, newCert]);
  };

  const handleDelete = async (id: number) => {
    persistCerts(certs.filter((c) => c.id !== id));
    certPemMap.current.delete(id);
    setPemIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    void saveEebusLocalCertPems(Object.fromEntries(certPemMap.current)).catch(() => {
      /* IndexedDB quota / private mode — deletion takes effect in-memory */
    });
  };

  const handleExport = (cert: EEBUSCertRecord) => {
    if (!cert.id) return;
    const pem = certPemMap.current.get(cert.id);
    if (!pem) return;
    const blob = new Blob([pem], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cert.deviceName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pem`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const revokedCount = certs.filter((c) => deriveCertStatus(c) !== 'trusted').length;

  return (
    <section aria-labelledby="cert-mgmt-heading" className="space-y-4">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="cert-mgmt-heading"
            className="flex items-center gap-2 font-semibold text-(--color-text-primary) text-base"
          >
            <FileKey aria-hidden className="size-5 text-electric-blue" />
            {t('certManagement.title')}
          </h2>
          <p className="mt-0.5 text-(--color-text-secondary) text-sm">
            {t('certManagement.description')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="focus-ring flex items-center gap-2 rounded-lg bg-electric-blue/15 px-3 py-1.5 font-medium text-electric-blue text-sm transition-colors hover:bg-electric-blue/25"
        >
          <FilePlus aria-hidden className="size-4" />
          {t('certManagement.importCert')}
        </button>
      </div>

      {/* ── Revoked/expired warning banner ── */}
      {revokedCount > 0 && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-(--state-warning-border) bg-(--state-warning-bg)/10 px-4 py-2.5 text-(--state-warning-fg) text-sm"
        >
          <ShieldOff aria-hidden className="size-4 shrink-0" />
          <span>
            {revokedCount === 1
              ? t('certManagement.statusRevoked')
              : `${revokedCount} certificates need attention`}
          </span>
        </div>
      )}

      {/* ── Certificate list ── */}
      {certs.length === 0 ? (
        <div className="glass-panel flex flex-col items-center gap-3 rounded-2xl py-12 text-center">
          <ShieldCheck aria-hidden className="size-10 text-(--color-text-secondary)/40" />
          <p className="font-medium text-(--color-text-secondary)">{t('certManagement.noCerts')}</p>
          <p className="max-w-xs text-(--color-text-secondary)/70 text-sm">
            {t('certManagement.noCertsDesc')}
          </p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label={t('certManagement.title')}>
          {certs.map((cert) => {
            const effectiveStatus = deriveCertStatus(cert);
            return (
              <li
                key={cert.id}
                className="glass-panel flex flex-wrap items-center gap-4 rounded-xl px-4 py-3"
              >
                {/* Device icon + name */}
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-electric-blue/15">
                    <ShieldCheck aria-hidden className="size-4 text-electric-blue" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-(--color-text-primary)">
                      {cert.deviceName}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-(--color-text-secondary) text-xs">
                      {t('certManagement.fingerprint')}:{' '}
                      <span title={cert.fingerprint}>{formatFingerprint(cert.fingerprint)}</span>
                    </p>
                  </div>
                </div>

                {/* Validity + status */}
                <div className="flex flex-col items-end gap-1 text-right">
                  <StatusBadge status={effectiveStatus} />
                  <p className="text-(--color-text-secondary) text-xs">
                    {t('certManagement.validUntil')} {formatDate(cert.validUntil)}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleExport(cert)}
                    disabled={!cert.id || !pemIds.has(cert.id)}
                    className="focus-ring rounded-lg p-1.5 text-(--color-text-secondary) transition-colors hover:bg-white/10 hover:text-(--color-text-primary) disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-(--color-text-secondary)"
                    aria-label={`${t('certManagement.exportCert')} — ${cert.deviceName}`}
                  >
                    <Download aria-hidden className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingCert(cert)}
                    className="focus-ring rounded-lg p-1.5 text-(--color-text-secondary) transition-colors hover:bg-(--state-danger-bg)/15 hover:text-(--state-danger-fg)"
                    aria-label={`${t('certManagement.deleteCert')} — ${cert.deviceName}`}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Dialogs ── */}
      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleImport}
      />
      <DeleteConfirm
        cert={deletingCert}
        onClose={() => setDeletingCert(null)}
        onConfirm={handleDelete}
      />

      {/* ── OCPP Profile 3 (adapter vault) ── */}
      <section
        aria-labelledby="ocpp-cert-heading"
        className="mt-8 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4"
      >
        <h2 id="ocpp-cert-heading" className="font-semibold text-(--color-text-primary) text-sm">
          {t('certManagement.ocppTitle')}
        </h2>
        <p className="mt-1 text-(--color-text-secondary) text-xs">{t('certManagement.ocppDesc')}</p>
        <Link
          to="/settings?tab=adapters"
          className="focus-ring mt-3 inline-flex text-cyan-400 text-xs underline-offset-2 hover:underline"
        >
          {t('certManagement.ocppLink')}
        </Link>
      </section>

      {/* ── SHIP Trust Store (API-backed) ── */}
      <ShipTrustStore />

      {/* ── EEBUS TLS revocation policy (admin API) ── */}
      <EebusRevocationSettings />
    </section>
  );
}
