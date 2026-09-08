export type UnitStatus = 'normal' | 'attention' | 'warning' | 'fault' | 'maintenance';

export interface GeneratingUnit {
  id: string;
  name: string;
  ratedPowerMw: number;
  outputMw: number;
  loadRate: number;
  status: UnitStatus;
  healthScore: number;
  coalConsumptionTph: number;
  co2Tph: number;
  minTechnicalOutputMw: number;
  adjustableDownMw: number;
  adjustableUpMw: number;
}

export interface PowerPlantAlarm {
  id: string;
  time: string;
  unit: string;
  device: string;
  metric: string;
  value: string;
  level: '提示' | '预警' | '严重';
  status: '待诊断' | '诊断中' | '已建议';
}

export type DeviceStatus = '正常' | '预警' | '关注' | '检修';

export interface PowerPlantDevice {
  id: string;
  name: string;
  unitId: string;
  unitName: string;
  system: string;
  status: DeviceStatus;
  healthScore: number;
  signalCount: number;
  primaryMetric: string;
  primaryValue: string;
}

export interface PowerPlantMeasurementPoint {
  id: string;
  deviceId: string;
  unitName: string;
  system: string;
  deviceName: string;
  name: string;
  value: string;
  unit: string;
  status: DeviceStatus;
  updatedAt: string;
}

export interface PowerPlantHistoryPoint {
  time: string;
  value: number;
  baseline: number;
  threshold?: number;
}

export const powerPlant = {
  name: '示范火力发电厂',
  totalRatedPowerMw: 1200,
  onlineSince: '2026-09-04 08:00',
  carbonFactor: 0.82,
};

export const generatingUnits: GeneratingUnit[] = [
  {
    id: 'unit-1',
    name: '1号超临界燃煤机组',
    ratedPowerMw: 600,
    outputMw: 468,
    loadRate: 78,
    status: 'normal',
    healthScore: 94,
    coalConsumptionTph: 148.2,
    co2Tph: 362.4,
    minTechnicalOutputMw: 180,
    adjustableDownMw: 288,
    adjustableUpMw: 132,
  },
  {
    id: 'unit-2',
    name: '2号超临界燃煤机组',
    ratedPowerMw: 600,
    outputMw: 392,
    loadRate: 65,
    status: 'warning',
    healthScore: 82,
    coalConsumptionTph: 127.8,
    co2Tph: 312.6,
    minTechnicalOutputMw: 168,
    adjustableDownMw: 224,
    adjustableUpMw: 168,
  },
];

export const powerPlantAlarms: PowerPlantAlarm[] = [
  {
    id: 'alarm-1',
    time: '10:42:18',
    unit: '2号机组',
    device: '汽轮机高压缸',
    metric: '轴承振动',
    value: '8.6 mm/s',
    level: '预警',
    status: '已建议',
  },
  {
    id: 'alarm-2',
    time: '10:38:05',
    unit: '1号机组',
    device: '锅炉给水泵A',
    metric: '出口压力',
    value: '14.2 MPa',
    level: '提示',
    status: '诊断中',
  },
  {
    id: 'alarm-3',
    time: '10:31:44',
    unit: '2号机组',
    device: '引风机B',
    metric: '电机温度',
    value: '86.4 °C',
    level: '预警',
    status: '待诊断',
  },
];

export const powerPlantDevices: PowerPlantDevice[] = [
  {
    id: 'u1-boiler',
    name: '锅炉本体',
    unitId: 'unit-1',
    unitName: '1号机组',
    system: '锅炉系统',
    status: '正常',
    healthScore: 95,
    signalCount: 186,
    primaryMetric: '主蒸汽温度',
    primaryValue: '566.2 °C',
  },
  {
    id: 'u1-turbine-hp',
    name: '汽轮机高压缸',
    unitId: 'unit-1',
    unitName: '1号机组',
    system: '汽轮机系统',
    status: '正常',
    healthScore: 93,
    signalCount: 148,
    primaryMetric: '轴承振动',
    primaryValue: '3.2 mm/s',
  },
  {
    id: 'u1-generator',
    name: '发电机定子',
    unitId: 'unit-1',
    unitName: '1号机组',
    system: '发电机系统',
    status: '正常',
    healthScore: 96,
    signalCount: 92,
    primaryMetric: '绕组温度',
    primaryValue: '78.4 °C',
  },
  {
    id: 'u1-feed-pump-a',
    name: '锅炉给水泵A',
    unitId: 'unit-1',
    unitName: '1号机组',
    system: '给水系统',
    status: '正常',
    healthScore: 91,
    signalCount: 74,
    primaryMetric: '出口压力',
    primaryValue: '14.2 MPa',
  },
  {
    id: 'u1-feed-pump-b',
    name: '锅炉给水泵B',
    unitId: 'unit-1',
    unitName: '1号机组',
    system: '给水系统',
    status: '正常',
    healthScore: 94,
    signalCount: 74,
    primaryMetric: '出口压力',
    primaryValue: '14.0 MPa',
  },
  {
    id: 'u1-id-fan',
    name: '引风机A',
    unitId: 'unit-1',
    unitName: '1号机组',
    system: '风烟系统',
    status: '正常',
    healthScore: 89,
    signalCount: 58,
    primaryMetric: '电机温度',
    primaryValue: '72.1 °C',
  },
  {
    id: 'u1-desulfurization',
    name: '脱硫吸收塔',
    unitId: 'unit-1',
    unitName: '1号机组',
    system: '环保系统',
    status: '正常',
    healthScore: 92,
    signalCount: 66,
    primaryMetric: '出口 SO₂',
    primaryValue: '24.6 mg/Nm³',
  },
  {
    id: 'u1-denitrification',
    name: '脱硝反应器',
    unitId: 'unit-1',
    unitName: '1号机组',
    system: '环保系统',
    status: '正常',
    healthScore: 94,
    signalCount: 54,
    primaryMetric: '出口 NOx',
    primaryValue: '31.2 mg/Nm³',
  },
  {
    id: 'u1-transformer',
    name: '主变压器',
    unitId: 'unit-1',
    unitName: '1号机组',
    system: '电气系统',
    status: '正常',
    healthScore: 97,
    signalCount: 46,
    primaryMetric: '绕组热点温度',
    primaryValue: '61.8 °C',
  },
  {
    id: 'u2-boiler',
    name: '锅炉本体',
    unitId: 'unit-2',
    unitName: '2号机组',
    system: '锅炉系统',
    status: '关注',
    healthScore: 87,
    signalCount: 186,
    primaryMetric: '炉膛压力',
    primaryValue: '-86 Pa',
  },
  {
    id: 'u2-turbine-hp',
    name: '汽轮机高压缸',
    unitId: 'unit-2',
    unitName: '2号机组',
    system: '汽轮机系统',
    status: '预警',
    healthScore: 82,
    signalCount: 148,
    primaryMetric: '轴承振动',
    primaryValue: '8.6 mm/s',
  },
  {
    id: 'u2-generator',
    name: '发电机定子',
    unitId: 'unit-2',
    unitName: '2号机组',
    system: '发电机系统',
    status: '正常',
    healthScore: 91,
    signalCount: 92,
    primaryMetric: '绕组温度',
    primaryValue: '82.1 °C',
  },
  {
    id: 'u2-feed-pump-a',
    name: '锅炉给水泵A',
    unitId: 'unit-2',
    unitName: '2号机组',
    system: '给水系统',
    status: '关注',
    healthScore: 86,
    signalCount: 74,
    primaryMetric: '出口压力',
    primaryValue: '13.6 MPa',
  },
  {
    id: 'u2-feed-pump-b',
    name: '锅炉给水泵B',
    unitId: 'unit-2',
    unitName: '2号机组',
    system: '给水系统',
    status: '正常',
    healthScore: 90,
    signalCount: 74,
    primaryMetric: '出口压力',
    primaryValue: '13.8 MPa',
  },
  {
    id: 'u2-id-fan',
    name: '引风机B',
    unitId: 'unit-2',
    unitName: '2号机组',
    system: '风烟系统',
    status: '预警',
    healthScore: 86,
    signalCount: 58,
    primaryMetric: '电机温度',
    primaryValue: '86.4 °C',
  },
  {
    id: 'u2-desulfurization',
    name: '脱硫吸收塔',
    unitId: 'unit-2',
    unitName: '2号机组',
    system: '环保系统',
    status: '正常',
    healthScore: 90,
    signalCount: 66,
    primaryMetric: '出口 SO₂',
    primaryValue: '28.1 mg/Nm³',
  },
  {
    id: 'u2-denitrification',
    name: '脱硝反应器',
    unitId: 'unit-2',
    unitName: '2号机组',
    system: '环保系统',
    status: '关注',
    healthScore: 88,
    signalCount: 54,
    primaryMetric: '出口 NOx',
    primaryValue: '38.6 mg/Nm³',
  },
  {
    id: 'u2-transformer',
    name: '主变压器',
    unitId: 'unit-2',
    unitName: '2号机组',
    system: '电气系统',
    status: '正常',
    healthScore: 95,
    signalCount: 46,
    primaryMetric: '绕组热点温度',
    primaryValue: '64.2 °C',
  },
];

const measurementProfiles: Record<string, Array<[string, string, string]>> = {
  锅炉系统: [
    ['主蒸汽压力', '24.8', 'MPa'],
    ['主蒸汽温度', '566.2', '°C'],
    ['给水流量', '1,842', 't/h'],
    ['排烟温度', '126.4', '°C'],
  ],
  汽轮机系统: [
    ['轴承振动', '3.2', 'mm/s'],
    ['高压缸排汽压力', '4.86', 'MPa'],
    ['轴瓦温度', '72.4', '°C'],
    ['汽轮机转速', '3,000', 'r/min'],
  ],
  发电机系统: [
    ['定子绕组温度', '78.4', '°C'],
    ['励磁电流', '1,842', 'A'],
    ['端电压', '20.1', 'kV'],
    ['功率因数', '0.92', ''],
  ],
  给水系统: [
    ['出口压力', '14.2', 'MPa'],
    ['给水温度', '258.6', '°C'],
    ['泵组电流', '286', 'A'],
    ['入口流量', '922', 't/h'],
  ],
  风烟系统: [
    ['电机温度', '72.1', '°C'],
    ['风机电流', '186', 'A'],
    ['入口负压', '-2.86', 'kPa'],
    ['轴承振动', '2.4', 'mm/s'],
  ],
  环保系统: [
    ['出口 SO₂', '24.6', 'mg/Nm³'],
    ['出口 NOx', '31.2', 'mg/Nm³'],
    ['吸收塔 pH', '5.42', ''],
    ['烟气流量', '1.82', '百万 Nm³/h'],
  ],
  电气系统: [
    ['绕组热点温度', '61.8', '°C'],
    ['负荷电流', '1,526', 'A'],
    ['油温', '48.2', '°C'],
    ['局部放电量', '18', 'pC'],
  ],
};

export const powerPlantMeasurementPoints: PowerPlantMeasurementPoint[] = powerPlantDevices.flatMap(
  (device) =>
    (measurementProfiles[device.system] ?? []).map(([name, value, unit], index) => ({
      id: `${device.id}-point-${index + 1}`,
      deviceId: device.id,
      unitName: device.unitName,
      system: device.system,
      deviceName: device.name,
      name,
      value: name === device.primaryMetric ? device.primaryValue : value,
      unit,
      status: name === device.primaryMetric && device.status !== '正常' ? device.status : '正常',
      updatedAt: '10:42:24',
    })),
);

/**
 * Local history fixtures for the operator pages.
 * The shape is intentionally backend-friendly: a future history endpoint can
 * replace these arrays without changing the monitoring or diagnosis views.
 */
export const powerPlantHistorySeries = {
  turbineBearingVibration: {
    deviceId: 'u2-turbine-hp',
    deviceName: '2号机组汽轮机高压缸',
    metric: '轴承振动',
    unit: 'mm/s',
    window: '10:12—10:42',
    interval: '2 分钟采样',
    points: [
      { time: '10:12', value: 5.8, baseline: 5.9, threshold: 7.0 },
      { time: '10:14', value: 5.9, baseline: 5.9, threshold: 7.0 },
      { time: '10:16', value: 6.1, baseline: 5.9, threshold: 7.0 },
      { time: '10:18', value: 6.0, baseline: 5.9, threshold: 7.0 },
      { time: '10:20', value: 6.3, baseline: 5.9, threshold: 7.0 },
      { time: '10:22', value: 6.5, baseline: 5.9, threshold: 7.0 },
      { time: '10:24', value: 6.4, baseline: 5.9, threshold: 7.0 },
      { time: '10:26', value: 6.8, baseline: 5.9, threshold: 7.0 },
      { time: '10:28', value: 7.1, baseline: 5.9, threshold: 7.0 },
      { time: '10:30', value: 7.4, baseline: 5.9, threshold: 7.0 },
      { time: '10:32', value: 7.8, baseline: 5.9, threshold: 7.0 },
      { time: '10:34', value: 8.0, baseline: 5.9, threshold: 7.0 },
      { time: '10:36', value: 8.2, baseline: 5.9, threshold: 7.0 },
      { time: '10:38', value: 8.4, baseline: 5.9, threshold: 7.0 },
      { time: '10:40', value: 8.5, baseline: 5.9, threshold: 7.0 },
      { time: '10:42', value: 8.6, baseline: 5.9, threshold: 7.0 },
    ] satisfies PowerPlantHistoryPoint[],
  },
} as const;

export const plantMetrics = {
  totalOutputMw: generatingUnits.reduce((sum, unit) => sum + unit.outputMw, 0),
  averageLoadRate: 71.5,
  todayGenerationMwh: 18426,
  todayCo2T: 12842,
  todayReductionT: 386.4,
  renewableOutputMw: 286,
  renewableAbsorptionRate: 93.8,
  availableDownRegulationMw: generatingUnits.reduce((sum, unit) => sum + unit.adjustableDownMw, 0),
};

export const trendData = [
  { time: '00:00', output: 780, renewable: 120, absorptionSpace: 248, co2: 642 },
  { time: '04:00', output: 720, renewable: 165, absorptionSpace: 302, co2: 591 },
  { time: '08:00', output: 860, renewable: 238, absorptionSpace: 286, co2: 704 },
  { time: '12:00', output: 910, renewable: 326, absorptionSpace: 274, co2: 746 },
  { time: '16:00', output: 860, renewable: 286, absorptionSpace: 302, co2: 704 },
  { time: '20:00', output: 842, renewable: 214, absorptionSpace: 318, co2: 690 },
];

export type OptimizationScenarioType = '运行参数优化' | '维护时机优化' | '碳感知运行优化';

export interface OptimizationScenario {
  id: OptimizationScenarioType;
  title: OptimizationScenarioType;
  fit: string;
  trigger: string;
  action: string;
  currentState: string;
  projectedState: string;
  saving: string;
  carbonReduction: string;
  risk: string;
  cost: string;
  score: number;
  color: string;
}

/** Frontend demo scenarios mirror the three carbon-aware paths in the solution. */
export const optimizationScenarios: OptimizationScenario[] = [
  {
    id: '运行参数优化',
    title: '运行参数优化',
    fit: '设备无明显故障，但运行效率偏低',
    trigger: '能耗偏高、负荷率偏离高效区间',
    action: '调整风机转速、给水压力和负荷分配，使设备回到高效运行区间',
    currentState: '锅炉辅机存在 8% 的无效能耗',
    projectedState: '辅机功率预计下降 15 kW，保持出力不变',
    saving: '15 kWh/h',
    carbonReduction: '8.25 kgCO₂e/h',
    risk: '低',
    cost: '低',
    score: 91,
    color: 'sky',
  },
  {
    id: '维护时机优化',
    title: '维护时机优化',
    fit: '设备轻度退化，但尚未达到立即停机条件',
    trigger: '轴承振动上升、故障证据尚不充分',
    action: '比较继续运行、立即检修和计划检修，选择风险可控的维护窗口',
    currentState: '若继续运行，预计附加能耗增加 8%',
    projectedState: '安排下一检修窗口更换轴承，降低停机损失与额外碳排',
    saving: '约 96 kWh/日',
    carbonReduction: '52.8 kgCO₂e/日',
    risk: '中',
    cost: '中',
    score: 94,
    color: 'amber',
  },
  {
    id: '碳感知运行优化',
    title: '碳感知运行优化',
    fit: '新能源或储能出力变化，需要优化机组运行方式',
    trigger: '新能源富余、储能 SOC 和电网排放因子共同变化',
    action: '综合新能源出力、电网排放因子、储能 SOC 与设备健康状态安排运行策略',
    currentState: '午间新能源富余 326 MW，夜间消纳空间收窄',
    projectedState: '优先消纳新能源，避开高碳时段并释放机组调节能力',
    saving: '预计消纳提升 8.2%',
    carbonReduction: '420 kgCO₂e/日',
    risk: '低',
    cost: '低',
    score: 96,
    color: 'emerald',
  },
];

export const decisionComparison = optimizationScenarios.map((scenario) => ({
  name: scenario.title,
  energy: scenario.saving,
  carbon: scenario.carbonReduction,
  safety: scenario.risk,
  cost: scenario.cost,
  score: scenario.score,
}));
