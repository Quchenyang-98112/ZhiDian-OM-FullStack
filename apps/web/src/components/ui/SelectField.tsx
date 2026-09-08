import { ChevronDown } from 'lucide-react';
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  useMemo,
} from 'react';
import { ChoiceCardGroup } from './ChoiceCardGroup';
import { ComboBox } from './ComboBox';

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  children: ReactNode;
  /** Use glass choice cards instead of native `<select>` (default for ≤8 options). */
  preferCards?: boolean;
}

function parseOptions(children: ReactNode): { value: string; label: string }[] {
  return Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const el = child as ReactElement<{ value?: string | number; children?: ReactNode }>;
      return {
        value: String(el.props.value ?? ''),
        label: String(el.props.children ?? el.props.value ?? ''),
      };
    })
    .filter((o) => o.value.length > 0);
}

/**
 * Styled select — renders a glass choice-card group for short lists (≤8 options)
 * to avoid thick native mobile pickers; falls back to native select for long lists.
 */
export function SelectField({
  label,
  hint,
  id,
  className = '',
  children,
  preferCards = true,
  value,
  defaultValue,
  onChange,
  name,
  disabled,
  ...selectProps
}: SelectFieldProps) {
  const fieldId = id ?? name;
  const options = useMemo(() => parseOptions(children), [children]);
  const useCards =
    preferCards && options.length > 0 && options.length <= 8 && !selectProps.multiple;

  const currentValue = String(value ?? defaultValue ?? options[0]?.value ?? '');

  if (useCards) {
    return (
      <div className={`select-field ${className}`.trim()}>
        <span id={fieldId} className="select-field-label">
          {label}
        </span>
        <ChoiceCardGroup
          key={currentValue}
          name={name ?? fieldId ?? 'select'}
          value={currentValue}
          disabled={disabled === true}
          aria-label={label}
          size="compact"
          onChange={(next) => {
            onChange?.({
              target: { value: next, name: name ?? '' },
              currentTarget: { value: next, name: name ?? '' },
            } as React.ChangeEvent<HTMLSelectElement>);
          }}
          options={options.map((o) => ({ value: o.value, label: o.label, tone: 'primary' }))}
        />
        {hint ? <p className="select-field-hint">{hint}</p> : null}
      </div>
    );
  }

  // Long lists (and any non-card single-select) use the branded ComboBox popover
  // instead of the dated native `<select>` (WS-8). Native is kept only for
  // `multiple`, which the ComboBox does not model.
  if (options.length > 0 && !selectProps.multiple) {
    return (
      <div className={`select-field ${className}`.trim()}>
        <span id={fieldId ? `${fieldId}-label` : undefined} className="select-field-label">
          {label}
        </span>
        <ComboBox
          {...(fieldId ? { id: fieldId } : {})}
          label={label}
          value={currentValue}
          disabled={disabled === true}
          options={options}
          onChange={(next) => {
            onChange?.({
              target: { value: next, name: name ?? '' },
              currentTarget: { value: next, name: name ?? '' },
            } as React.ChangeEvent<HTMLSelectElement>);
          }}
        />
        {hint ? <p className="select-field-hint">{hint}</p> : null}
      </div>
    );
  }

  return (
    <div className={`select-field ${className}`.trim()}>
      <label htmlFor={fieldId} className="select-field-label">
        {label}
      </label>
      <div className="select-field-control">
        <select
          id={fieldId}
          className="select-field-native focus-ring"
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          name={name}
          disabled={disabled}
          {...selectProps}
        >
          {children}
        </select>
        <ChevronDown className="select-field-chevron" aria-hidden="true" />
      </div>
      {hint ? <p className="select-field-hint">{hint}</p> : null}
    </div>
  );
}
