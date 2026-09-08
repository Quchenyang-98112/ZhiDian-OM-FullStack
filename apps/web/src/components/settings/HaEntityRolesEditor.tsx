import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { HAEnergyRole } from '../../core/adapters/contrib/homeassistant-mqtt';
import { SelectField } from '../ui/SelectField';
import { inputClass } from './styles';

export type HAEntityRoleRow = {
  rowId: string;
  entityId: string;
  role: HAEnergyRole;
};

const HA_ENTITY_ROLES: HAEnergyRole[] = [
  'pvPower',
  'pvEnergyToday',
  'batteryPower',
  'batterySoc',
  'gridPower',
  'housePower',
  'heatPumpPower',
  'evPower',
  'evSoc',
  'evStatus',
];

type HaEntityRolesEditorProps = {
  entityRoles: HAEntityRoleRow[];
  isReadOnly: boolean;
  onChange: (roles: HAEntityRoleRow[]) => void;
};

/** Manual entity → energy role overrides for Home Assistant WS API discovery. */
export function HaEntityRolesEditor({
  entityRoles,
  isReadOnly,
  onChange,
}: HaEntityRolesEditorProps) {
  const { t } = useTranslation();

  const updateRow = (rowId: string, patch: Partial<HAEntityRoleRow>) => {
    onChange(entityRoles.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)));
  };

  const removeRow = (rowId: string) => {
    onChange(entityRoles.filter((row) => row.rowId !== rowId));
  };

  const addRow = () => {
    onChange([...entityRoles, { rowId: crypto.randomUUID(), entityId: '', role: 'pvPower' }]);
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="font-medium text-sm">
          {t('settings.haEntityRolesTitle', 'Entity role overrides')}
        </p>
        <p className="text-(--color-muted) text-xs">
          {t(
            'settings.haEntityRolesHint',
            'Optional manual mapping when auto-discovery cannot classify an entity.',
          )}
        </p>
      </div>

      {entityRoles.length === 0 ? (
        <p className="text-(--color-muted) text-xs">
          {t('settings.haEntityRolesEmpty', 'No overrides configured.')}
        </p>
      ) : (
        <ul className="space-y-2">
          {entityRoles.map((row) => (
            <li key={row.rowId} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="sr-only" htmlFor={`ha-entity-id-${row.rowId}`}>
                {t('settings.haEntityId', 'Entity ID')}
              </label>
              <input
                id={`ha-entity-id-${row.rowId}`}
                type="text"
                value={row.entityId}
                disabled={isReadOnly}
                onChange={(e) => updateRow(row.rowId, { entityId: e.target.value })}
                className={inputClass}
                placeholder="sensor.solar_power"
              />
              <SelectField
                id={`ha-entity-role-${row.rowId}`}
                label={t('settings.haEntityRole', 'Energy role')}
                value={row.role}
                disabled={isReadOnly}
                onChange={(e) => updateRow(row.rowId, { role: e.target.value as HAEnergyRole })}
              >
                {HA_ENTITY_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {t(`settings.haRole_${role}`, role)}
                  </option>
                ))}
              </SelectField>
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => removeRow(row.rowId)}
                className="focus-ring inline-flex h-10 items-center justify-center rounded-xl border border-(--color-border) px-3 text-(--color-muted) hover:text-rose-400"
                aria-label={t('settings.haEntityRoleRemove', 'Remove entity role override')}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={isReadOnly}
        onClick={addRow}
        className="focus-ring inline-flex items-center gap-2 rounded-xl border border-(--color-border) px-3 py-2 text-sm hover:border-(--color-primary)/40"
      >
        <Plus size={14} aria-hidden="true" />
        {t('settings.haEntityRoleAdd', 'Add override')}
      </button>
    </div>
  );
}
