/**
 * select-field.test.tsx — WS-8: SelectField routes long lists to the branded
 * ComboBox (no dated native `<select>`), keeps ChoiceCardGroup for short lists,
 * and preserves the value/onChange API.
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SelectField } from '../components/ui/SelectField';

vi.mock('../lib/haptics', () => ({ hapticClick: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: vi.fn(), resolvedLanguage: 'en', language: 'en' },
  }),
}));

/** 12 options → over the 8-option card threshold → ComboBox path. */
const manyOptions = Array.from({ length: 12 }, (_, i) => ({
  value: `m${i}`,
  label: `Manufacturer ${i}`,
}));

function LongSelect({ onChange }: { onChange: (v: string) => void }) {
  return (
    <SelectField
      id="mfr"
      label="Manufacturer"
      value="m0"
      onChange={(e) => onChange(e.target.value)}
    >
      {manyOptions.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </SelectField>
  );
}

describe('SelectField → ComboBox (long lists, WS-8)', () => {
  it('renders the branded listbox trigger, not a native <select>', () => {
    const { container } = render(<LongSelect onChange={vi.fn()} />);
    // No dated native select element.
    expect(container.querySelector('select')).toBeNull();
    // A branded listbox trigger instead.
    const trigger = screen.getByRole('button', { name: 'Manufacturer' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    // Shows the current value's label.
    expect(trigger).toHaveTextContent('Manufacturer 0');
  });

  it('opens, selects via click, and emits the value through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LongSelect onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Manufacturer' }));
    const listbox = screen.getByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: 'Manufacturer 5' }));

    expect(onChange).toHaveBeenCalledWith('m5');
    // Popover closes after selection (trigger collapses synchronously).
    expect(screen.getByRole('button', { name: 'Manufacturer' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('type-to-filter narrows the option set', async () => {
    const user = userEvent.setup();
    render(<LongSelect onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Manufacturer' }));
    const searchbox = screen.getByRole('combobox');
    await user.type(searchbox, 'Manufacturer 11');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Manufacturer 11');
  });

  it('supports keyboard selection (ArrowDown + Enter)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<LongSelect onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Manufacturer' }));
    // Active starts on the current value (m0). One ArrowDown → m1, Enter selects.
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('m1');
  });
});

describe('SelectField short lists keep the ChoiceCardGroup path', () => {
  it('renders a radiogroup (cards), not a combobox, for ≤ 8 options', () => {
    render(
      <SelectField id="mode" label="Mode" value="mock" onChange={vi.fn()}>
        <option value="mock">Mock</option>
        <option value="live">Live</option>
      </SelectField>,
    );
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
