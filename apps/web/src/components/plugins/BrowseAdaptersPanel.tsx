import {
  CheckCircle2,
  Download,
  ExternalLink,
  Filter,
  Package,
  Search,
  Shield,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AdapterPermission,
  adapterMarketplace,
  type InstallProgress,
  type MarketplaceEntry,
} from '../../core/adapters/adapter-marketplace';
import { Disclosure } from '../ui/Disclosure';
import { NeonCard, NeonCardBody } from '../ui/NeonCard';

// ─── Permission badge ─────────────────────────────────────────────────

const PERMISSION_STYLES: Record<AdapterPermission, { color: string; label: string }> = {
  'read-only': {
    color: 'text-(--badge-ok-fg) bg-emerald-500/10 border-emerald-500/30',
    label: 'marketplace.permReadOnly',
  },
  write: {
    color: 'text-(--badge-warn-fg) bg-yellow-500/10 border-yellow-500/30',
    label: 'marketplace.permWrite',
  },
  admin: {
    color: 'text-(--badge-danger-fg) bg-red-500/10 border-red-500/30',
    label: 'marketplace.permAdmin',
  },
};

const PERMISSION_ICONS: Record<AdapterPermission, typeof Shield> = {
  'read-only': ShieldCheck,
  write: Shield,
  admin: Shield,
};

function PermissionBadge({ permission }: { permission: AdapterPermission }) {
  const { t } = useTranslation();
  const style = PERMISSION_STYLES[permission];
  const Icon = PERMISSION_ICONS[permission];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium text-[10px] uppercase tracking-wider ${style.color}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {t(style.label)}
    </span>
  );
}

// ─── Category tabs ────────────────────────────────────────────────────

const CATEGORIES = ['all', 'adapter', 'integration', 'analytics', 'controller', 'ui'] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

// ─── Install Button ───────────────────────────────────────────────────

function InstallButton({ entry }: { entry: MarketplaceEntry }) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<InstallProgress>({ status: 'idle' });
  const installed = adapterMarketplace.isInstalled(entry.id);

  useEffect(() => {
    const unsub = adapterMarketplace.onProgress(entry.id, setProgress);
    return unsub;
  }, [entry.id]);

  const handleInstall = async () => {
    await adapterMarketplace.install(entry);
  };

  if (installed || progress.status === 'done') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-1.5 font-medium text-(--badge-ok-fg) text-sm">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        {t('marketplace.installed')}
      </span>
    );
  }

  const busy = progress.status !== 'idle' && progress.status !== 'error';

  const statusLabel: Record<string, string> = {
    fetching: t('marketplace.statusFetching'),
    verifying: t('marketplace.statusVerifying'),
    loading: t('marketplace.statusLoading'),
    registering: t('marketplace.statusRegistering'),
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleInstall}
        disabled={busy}
        className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-(--color-primary)/10 px-3 py-1.5 font-medium text-(--color-primary) text-sm transition-colors hover:bg-(--color-primary)/20 disabled:cursor-wait disabled:opacity-60"
        aria-busy={busy}
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        {busy ? (statusLabel[progress.status] ?? t('common.loading')) : t('marketplace.install')}
      </button>
      {progress.status === 'error' && (
        <p className="fluid-text-xs text-red-400" role="alert">
          {progress.error}
        </p>
      )}
    </div>
  );
}

// ─── Marketplace Card ─────────────────────────────────────────────────

function MarketplaceCard({ entry }: { entry: MarketplaceEntry }) {
  const { t } = useTranslation();

  return (
    <NeonCard variant="default" hover={false}>
      <NeonCardBody className="flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-(--color-primary)/20 bg-(--color-primary)/10">
              <Package className="h-5 w-5 text-(--color-primary)" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="fluid-text-base font-semibold leading-tight">{entry.name}</h3>
                {entry.verified && (
                  <ShieldCheck
                    className="h-4 w-4 shrink-0 text-emerald-400"
                    aria-label={t('marketplace.verified')}
                  />
                )}
              </div>
              <span className="font-mono text-(--color-muted) text-xs">v{entry.version}</span>
            </div>
          </div>
          <PermissionBadge permission={entry.permissions} />
        </div>

        {/* Description */}
        {entry.description.length > 120 ? (
          <Disclosure variant="nested" title={t('marketplace.description')} defaultOpen={false}>
            <p className="fluid-text-sm text-(--color-muted)">{entry.description}</p>
          </Disclosure>
        ) : (
          <p className="fluid-text-sm text-(--color-muted)">{entry.description}</p>
        )}

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {entry.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white/5 px-2 py-0.5 font-mono text-(--color-muted) text-[10px]"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-3">
            {entry.stars !== undefined && (
              <span className="inline-flex items-center gap-1 text-(--color-muted) text-xs">
                <Star className="h-3 w-3 fill-current text-yellow-400" aria-hidden="true" />
                {entry.stars}
              </span>
            )}
            {entry.downloads !== undefined && (
              <span className="inline-flex items-center gap-1 text-(--color-muted) text-xs">
                <Download className="h-3 w-3" aria-hidden="true" />
                {entry.downloads.toLocaleString()}
              </span>
            )}
            {entry.source === 'github' && entry.githubRepo && (
              <a
                href={`https://github.com/${entry.githubRepo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="focus-ring inline-flex items-center gap-1 text-(--color-muted) text-xs hover:text-(--color-text)"
                aria-label={t('marketplace.viewOnGitHub', { repo: entry.githubRepo })}
              >
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                GitHub
              </a>
            )}
          </div>
          <InstallButton entry={entry} />
        </div>
      </NeonCardBody>
    </NeonCard>
  );
}

// ─── Search bar ───────────────────────────────────────────────────────

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-(--color-muted)"
        aria-hidden="true"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('marketplace.searchPlaceholder')}
        className="focus-ring w-full rounded-xl border border-(--color-border) bg-white/[0.03] py-2 pr-9 pl-9 text-sm placeholder:text-(--color-muted) focus:border-(--color-primary)/50"
        aria-label={t('marketplace.searchLabel')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute top-1/2 right-3 -translate-y-1/2 text-(--color-muted) hover:text-(--color-text)"
          aria-label={t('common.reset')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

// ─── Category Tabs ────────────────────────────────────────────────────

function CategoryTabs({
  active,
  onChange,
  counts,
}: {
  active: CategoryFilter;
  onChange: (c: CategoryFilter) => void;
  counts: Record<string, number>;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="tablist"
      aria-label={t('marketplace.filterByCategory')}
    >
      {CATEGORIES.map((cat) => (
        <button
          key={cat}
          type="button"
          role="tab"
          aria-selected={active === cat}
          onClick={() => onChange(cat)}
          className={`focus-ring rounded-xl px-3 py-1.5 font-medium text-sm transition-colors ${
            active === cat
              ? 'bg-(--color-primary)/15 text-(--color-primary)'
              : 'text-(--color-muted) hover:text-(--color-text)'
          }`}
        >
          {t(`marketplace.cat_${cat}`, cat)}
          {counts[cat] !== undefined && (
            <span className="ml-1.5 font-mono text-[10px] opacity-60">{counts[cat]}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────

export function BrowseAdaptersPanel() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [results, setResults] = useState<MarketplaceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allEntries, setAllEntries] = useState<MarketplaceEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    adapterMarketplace
      .fetchCatalog()
      .then(({ adapters }) => {
        if (!cancelled) {
          setAllEntries(adapters);
          setResults(adapters);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (allEntries.length === 0) return;
    adapterMarketplace.search(query, category === 'all' ? undefined : category).then(setResults);
  }, [query, category, allEntries]);

  // Category counts from full catalog
  const counts: Record<string, number> = { all: allEntries.length };
  for (const e of allEntries) {
    counts[e.category] = (counts[e.category] ?? 0) + 1;
  }

  return (
    <section aria-labelledby="browse-adapters-heading" className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Filter className="h-4 w-4 text-(--color-muted)" aria-hidden="true" />
        <h2 id="browse-adapters-heading" className="fluid-text-base sr-only font-semibold">
          {t('marketplace.browseTitle')}
        </h2>
        <div className="min-w-48 flex-1">
          <SearchBar value={query} onChange={setQuery} />
        </div>
      </div>

      <CategoryTabs active={category} onChange={setCategory} counts={counts} />

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {(['sk1', 'sk2', 'sk3', 'sk4', 'sk5', 'sk6'] as const).map((key) => (
            <NeonCard key={key} variant="default">
              <NeonCardBody className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 animate-pulse rounded-xl bg-white/5" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/5 animate-pulse rounded bg-white/5" />
                    <div className="h-3 w-2/5 animate-pulse rounded bg-white/5" />
                  </div>
                </div>
                <div className="h-10 animate-pulse rounded-lg bg-white/5" />
              </NeonCardBody>
            </NeonCard>
          ))}
        </div>
      )}

      {error && (
        <NeonCard variant="warning">
          <NeonCardBody>
            <p className="text-red-400 text-sm" role="alert">
              {t('marketplace.catalogError')}: {error}
            </p>
          </NeonCardBody>
        </NeonCard>
      )}

      {!loading && !error && results.length === 0 && (
        <NeonCard variant="default">
          <NeonCardBody className="py-10 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-(--color-muted)" aria-hidden="true" />
            <p className="fluid-text-sm text-(--color-muted)">{t('marketplace.noResults')}</p>
          </NeonCardBody>
        </NeonCard>
      )}

      {!loading && !error && results.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((entry) => (
            <MarketplaceCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}
