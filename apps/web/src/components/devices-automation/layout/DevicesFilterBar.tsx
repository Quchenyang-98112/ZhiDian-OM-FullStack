import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { hapticClick } from '../../../lib/haptics';
import { HelpTooltip } from '../../ui/HelpTooltip';
import { CATEGORY_FILTERS } from '../constants';
import type { DeviceCategory } from '../types';

export function DevicesFilterBar({
  search,
  onSearch,
  category,
  onCategory,
}: {
  search: string;
  onSearch: (value: string) => void;
  category: DeviceCategory;
  onCategory: (category: DeviceCategory) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative flex-1 sm:max-w-xs">
        <Search
          size={16}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-(--color-muted)"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t('devicesAuto.searchPlaceholder')}
          className="focus-ring w-full rounded-lg border border-(--color-border) bg-(--color-surface) py-2 pr-3 pl-9 text-(--color-text) text-sm placeholder:text-(--color-muted)"
          aria-label={t('devicesAuto.searchPlaceholder')}
        />
      </div>

      <div className="flex items-center gap-2">
        <HelpTooltip content={t('tour.devices.filterHelp')} />
        <div
          className="flex flex-wrap gap-1.5"
          role="radiogroup"
          aria-label={t('devicesAuto.filterLabel')}
        >
          {CATEGORY_FILTERS.map((f) => (
            // biome-ignore lint/a11y/useSemanticElements: radio-style button inside radiogroup, input[type=radio] would break styled layout
            <button
              key={f.key}
              type="button"
              role="radio"
              aria-checked={category === f.key}
              onClick={() => {
                hapticClick();
                onCategory(f.key);
              }}
              className={`focus-ring flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-medium text-xs transition-all ${
                category === f.key
                  ? 'border-(--color-primary) bg-(--color-primary)/15 text-(--color-primary)'
                  : 'border-(--color-border) bg-(--color-surface) text-(--color-muted) hover:border-(--color-primary)/40'
              }`}
            >
              <span aria-hidden="true">{f.icon}</span>
              {t(f.labelKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
