import { useTranslation } from 'react-i18next';

const RPI_VS_GX_ROWS = [
  ['rpiVsGxCost', 'rpiVsGxCostRpi', 'rpiVsGxCostCerbo'],
  ['rpiVsGxVeBus', 'rpiVsGxVeBusRpi', 'rpiVsGxVeBusCerbo'],
  ['rpiVsGxReliability', 'rpiVsGxReliabilityRpi', 'rpiVsGxReliabilityCerbo'],
  ['rpiVsGxSupport', 'rpiVsGxSupportRpi', 'rpiVsGxSupportCerbo'],
  ['rpiVsGxNodeRed', 'rpiVsGxNodeRedBoth', 'rpiVsGxNodeRedBoth'],
  ['rpiVsGxIdeal', 'rpiVsGxIdealRpi', 'rpiVsGxIdealCerbo'],
] as const;

/** Body rows for the Raspberry Pi vs Cerbo GX comparison table. */
export const RpiComparisonTableBody = () => {
  const { t } = useTranslation();

  return (
    <tbody className="text-(--color-muted)">
      {RPI_VS_GX_ROWS.map(([label, rpi, cerbo]) => (
        <tr key={label} className="border-(--color-border)/50 border-b">
          <td className="py-2 pr-4 font-medium">{t(`help.${label}`)}</td>
          <td className="px-4 py-2">{t(`help.${rpi}`)}</td>
          <td className="px-4 py-2">{t(`help.${cerbo}`)}</td>
        </tr>
      ))}
    </tbody>
  );
};
