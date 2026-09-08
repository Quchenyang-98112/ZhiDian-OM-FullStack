import { RpiComparisonTableBody } from './RpiComparisonTableBody';
import { RpiComparisonTableHead } from './RpiComparisonTableHead';

/** Raspberry Pi vs Cerbo GX comparison table in the integration guide. */
export const RpiComparisonTable = () => (
  <div className="overflow-x-auto">
    <table className="w-full border-collapse text-xs">
      <RpiComparisonTableHead />
      <RpiComparisonTableBody />
    </table>
  </div>
);
