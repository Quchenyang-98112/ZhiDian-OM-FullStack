interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  id: string;
}

/** Accessible on/off switch used across the Settings tabs. */
export function ToggleSwitch({ checked, onChange, label, id }: ToggleSwitchProps) {
  return (
    <label htmlFor={id} className="relative inline-flex cursor-pointer items-center">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span className="sr-only">{label}</span>
      <div className="h-6 w-11 rounded-full border border-(--color-border) bg-(--color-surface) transition-colors duration-300 after:absolute after:top-[2px] after:left-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:duration-300 peer-checked:bg-(--color-primary) peer-checked:after:translate-x-5 peer-focus:ring-(--color-primary)/30 peer-focus:ring-2" />
    </label>
  );
}
