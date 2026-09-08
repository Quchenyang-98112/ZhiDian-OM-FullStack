import type { TFunction } from 'i18next';
import { describe, expect, it, vi } from 'vitest';
import { AdapterConfigEebusFields } from '../components/adapter-config-entry/AdapterConfigEebusFields';
import { AdapterConfigOcppFields } from '../components/adapter-config-entry/AdapterConfigOcppFields';
import { AdapterConfigOcppMtlsFields } from '../components/adapter-config-entry/AdapterConfigOcppMtlsFields';
import type { AdapterEntry } from '../components/adapter-config-types';
import { fireEvent, render, screen } from './test-utils';

// The field groups receive `t` as a prop, but their child primitives
// (SelectField, help rows) may call useTranslation internally — keep both paths
// on a passthrough so assertions read the raw i18n keys.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn(), resolvedLanguage: 'en', language: 'en' },
  }),
}));

const t = ((key: string) => key) as unknown as TFunction;

function makeAdapter(overrides: Partial<AdapterEntry> = {}): AdapterEntry {
  return {
    id: 'test-1',
    type: 'ocpp',
    name: 'Test Adapter',
    enabled: true,
    host: '',
    port: 0,
    tls: false,
    authToken: '',
    pollIntervalMs: 5000,
    ...overrides,
  };
}

describe('AdapterConfigOcppFields', () => {
  it('renders empty defaults (nullish branches) and omits mTLS when profile is not 3', () => {
    const onUpdate = vi.fn();
    // No securityProfile/stationId -> exercises the nullish-coalescing right side
    render(
      <AdapterConfigOcppFields
        adapter={makeAdapter()}
        onUpdate={onUpdate}
        inputClass="input"
        t={t}
      />,
    );
    expect((screen.getByLabelText('adapterConfig.stationId') as HTMLInputElement).value).toBe('');
    // securityProfile undefined -> String(?? 2) -> '2'; mTLS block not rendered
    expect(screen.queryByLabelText('adapterConfig.clientCert')).toBeNull();

    fireEvent.change(screen.getByLabelText('adapterConfig.stationId'), {
      target: { value: 'CP042' },
    });
    expect(onUpdate).toHaveBeenCalledWith({ stationId: 'CP042' });
  });

  it('renders the mTLS sub-fields when securityProfile is 3 and reflects populated values', () => {
    const onUpdate = vi.fn();
    render(
      <AdapterConfigOcppFields
        adapter={makeAdapter({ securityProfile: 3, stationId: 'CP001', clientCert: 'CERT' })}
        onUpdate={onUpdate}
        inputClass="input"
        t={t}
      />,
    );
    expect((screen.getByLabelText('adapterConfig.stationId') as HTMLInputElement).value).toBe(
      'CP001',
    );
    // securityProfile === 3 renders the nested mTLS cert field
    expect((screen.getByLabelText('adapterConfig.clientCert') as HTMLTextAreaElement).value).toBe(
      'CERT',
    );
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe('AdapterConfigEebusFields', () => {
  it('renders empty nullish defaults and wires each field change', () => {
    const onUpdate = vi.fn();
    render(
      <AdapterConfigEebusFields
        adapter={makeAdapter({ type: 'eebus' })}
        onUpdate={onUpdate}
        inputClass="input"
        t={t}
      />,
    );
    expect((screen.getByLabelText('adapterConfig.skiFingerprint') as HTMLInputElement).value).toBe(
      '',
    );
    expect((screen.getByLabelText('adapterConfig.clientCert') as HTMLTextAreaElement).value).toBe(
      '',
    );
    expect((screen.getByLabelText('adapterConfig.clientKey') as HTMLTextAreaElement).value).toBe(
      '',
    );

    fireEvent.change(screen.getByLabelText('adapterConfig.skiFingerprint'), {
      target: { value: 'abcd' },
    });
    fireEvent.change(screen.getByLabelText('adapterConfig.clientKey'), {
      target: { value: 'KEY' },
    });
    expect(onUpdate).toHaveBeenCalledWith({ skiFingerprint: 'abcd' });
    expect(onUpdate).toHaveBeenCalledWith({ clientKey: 'KEY' });
  });

  it('reflects populated cert/key/ski values (left side of nullish coalescing)', () => {
    render(
      <AdapterConfigEebusFields
        adapter={makeAdapter({
          type: 'eebus',
          skiFingerprint: '0123',
          clientCert: 'CERT',
          clientKey: 'KEY',
        })}
        onUpdate={vi.fn()}
        inputClass="input"
        t={t}
      />,
    );
    expect((screen.getByLabelText('adapterConfig.skiFingerprint') as HTMLInputElement).value).toBe(
      '0123',
    );
    expect((screen.getByLabelText('adapterConfig.clientCert') as HTMLTextAreaElement).value).toBe(
      'CERT',
    );
  });
});

describe('AdapterConfigOcppMtlsFields', () => {
  it('covers empty and populated cert/key branches with change wiring', () => {
    const onUpdate = vi.fn();
    const { rerender } = render(
      <AdapterConfigOcppMtlsFields
        adapter={makeAdapter()}
        onUpdate={onUpdate}
        inputClass="input"
        t={t}
      />,
    );
    expect((screen.getByLabelText('adapterConfig.clientCert') as HTMLTextAreaElement).value).toBe(
      '',
    );
    fireEvent.change(screen.getByLabelText('adapterConfig.clientCert'), {
      target: { value: 'CERT' },
    });
    expect(onUpdate).toHaveBeenCalledWith({ clientCert: 'CERT' });

    rerender(
      <AdapterConfigOcppMtlsFields
        adapter={makeAdapter({ clientCert: 'X', clientKey: 'Y' })}
        onUpdate={onUpdate}
        inputClass="input"
        t={t}
      />,
    );
    expect((screen.getByLabelText('adapterConfig.clientKey') as HTMLTextAreaElement).value).toBe(
      'Y',
    );
  });
});
