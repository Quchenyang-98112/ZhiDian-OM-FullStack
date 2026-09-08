import { CheckCircle2, Eye, EyeOff, Key, Loader2, XCircle } from 'lucide-react';
import { type FormEvent, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clearAuthToken,
  exchangeApiKeyForJwt,
  getApiBaseUrl,
  getAuthToken,
} from '../lib/auth-token';
import { SelectField } from './ui/SelectField';

const inputClass =
  'w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-4 py-2.5 text-sm text-(--color-text) placeholder:text-(--color-muted) focus:border-(--color-primary)/50 focus:outline-none focus:ring-2 focus:ring-(--color-primary)/20';

type Scope = 'read' | 'readwrite' | 'admin';

export function ApiAuthSettingsSection() {
  const { t } = useTranslation();
  const [clientId, setClientId] = useState('hems-dashboard');
  const [apiKey, setApiKey] = useState('');
  const [scope, setScope] = useState<Scope>('readwrite');
  const [showApiKey, setShowApiKey] = useState(false);
  const [hasToken, setHasToken] = useState(() => getAuthToken() !== null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [grantedScope, setGrantedScope] = useState<string | null>(null);

  const apiBase = getApiBaseUrl();

  const handleExchange = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setStatus('loading');
      setErrorKey(null);
      setGrantedScope(null);

      const result = await exchangeApiKeyForJwt(clientId.trim(), apiKey.trim(), scope);

      if (result.ok) {
        setHasToken(true);
        setGrantedScope(result.scope);
        setApiKey('');
        setStatus('success');
      } else {
        setStatus('error');
        setErrorKey(result.error);
      }
    },
    [apiKey, clientId, scope],
  );

  const handleClear = useCallback(() => {
    clearAuthToken();
    setHasToken(false);
    setGrantedScope(null);
    setStatus('idle');
    setErrorKey(null);
  }, []);

  return (
    <section className="glass-panel-strong space-y-6 rounded-2xl p-6">
      <h2 className="flex items-center gap-2 font-semibold text-lg">
        <Key size={20} className="text-blue-400" aria-hidden="true" />
        {t('settings.apiAuthTitle')}
      </h2>
      <p className="text-(--color-muted) text-sm">{t('settings.apiAuthDesc')}</p>

      <div className="rounded-xl border border-(--color-border) bg-(--color-surface) p-3">
        <p className="text-(--color-muted) text-xs">{t('settings.apiAuthBaseUrl')}</p>
        <p className="font-mono text-sm">{apiBase || t('settings.apiAuthNoBase')}</p>
      </div>

      <div
        className={`flex items-center gap-2 rounded-xl border p-3 text-sm ${
          hasToken
            ? 'border-(--state-success-border) bg-(--state-success-bg)/5 text-(--state-success-fg)'
            : 'border-(--state-warning-border) bg-(--state-warning-bg)/5 text-(--state-warning-fg)'
        }`}
        role="status"
      >
        {hasToken ? (
          <>
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>
              {t('settings.apiAuthTokenActive')}
              {grantedScope ? ` (${grantedScope})` : ''}
            </span>
          </>
        ) : (
          <>
            <XCircle size={16} aria-hidden="true" />
            <span>{t('settings.apiAuthTokenMissing')}</span>
          </>
        )}
      </div>

      <form onSubmit={handleExchange} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="api-auth-client-id" className="font-medium text-sm">
            {t('settings.apiAuthClientId')}
          </label>
          <input
            id="api-auth-client-id"
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={inputClass}
            autoComplete="username"
            required
            maxLength={64}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="api-auth-api-key" className="font-medium text-sm">
            {t('settings.apiAuthApiKey')}
          </label>
          <div className="relative">
            <input
              id="api-auth-api-key"
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={`${inputClass} pr-10`}
              autoComplete="current-password"
              required
              aria-required="true"
              aria-invalid={status === 'error'}
              aria-describedby={status === 'error' ? 'api-auth-error' : undefined}
              maxLength={256}
            />
            <button
              type="button"
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-(--color-muted) hover:text-(--color-text)"
              aria-label={showApiKey ? t('settings.hideToken') : t('settings.showToken')}
            >
              {showApiKey ? (
                <EyeOff size={16} aria-hidden="true" />
              ) : (
                <Eye size={16} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <SelectField
          id="api-auth-scope"
          label={t('settings.apiAuthScope')}
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
          hint={t('settings.apiAuthScopeHint')}
        >
          <option value="read">{t('settings.apiAuthScopeRead')}</option>
          <option value="readwrite">{t('settings.apiAuthScopeReadWrite')}</option>
          <option value="admin">{t('settings.apiAuthScopeAdmin')}</option>
        </SelectField>

        {status === 'error' && errorKey && (
          <p id="api-auth-error" className="text-(--state-danger-fg) text-sm" role="alert">
            {t(`settings.apiAuthError.${errorKey}`)}
          </p>
        )}

        {status === 'success' && (
          <p className="text-(--state-success-fg) text-sm" role="status">
            {t('settings.apiAuthSuccess')}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={status === 'loading' || !apiKey.trim()}
            className="focus-ring inline-flex items-center gap-2 rounded-xl bg-(--color-primary) px-4 py-2.5 font-medium text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'loading' ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Key size={16} aria-hidden="true" />
            )}
            {t('settings.apiAuthExchange')}
          </button>
          {hasToken && (
            <button
              type="button"
              onClick={handleClear}
              className="focus-ring rounded-xl border border-(--color-border) px-4 py-2.5 font-medium text-sm transition-colors hover:bg-white/5"
            >
              {t('settings.apiAuthClear')}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
