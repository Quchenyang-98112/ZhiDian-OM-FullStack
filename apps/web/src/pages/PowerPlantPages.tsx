import {
  Activity,
  AlertTriangle,
  BarChart3,
  Cpu,
  Database,
  Factory,
  Gauge,
  Radio,
  Server,
  Settings2,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import {
  generatingUnits,
  plantMetrics,
  powerPlant,
  powerPlantAlarms,
  powerPlantDevices,
  powerPlantMeasurementPoints,
  trendData,
} from '../lib/power-plant-data';
import { loadPowerPlantSnapshot, type PowerPlantSnapshot } from '../lib/power-plant-data-provider';

const unitStatus: Record<string, string> = {
  normal: '正常',
  warning: '预警',
  attention: '关注',
  fault: '故障',
  maintenance: '检修',
};

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="text-(--color-muted) text-sm">{label}</div>
      <div className="mt-3 fluid-text-2xl font-semibold">{value}</div>
      <div className="mt-2 text-(--color-muted) text-xs">{hint}</div>
    </div>
  );
}

function usePowerPlantSnapshot(): PowerPlantSnapshot {
  const [snapshot, setSnapshot] = useState<PowerPlantSnapshot>({
    plant: powerPlant,
    units: generatingUnits,
    metrics: plantMetrics,
    alarms: powerPlantAlarms,
    devices: powerPlantDevices,
    measurementPoints: powerPlantMeasurementPoints,
    trend: trendData,
    source: 'local',
    updatedAt: '',
  });

  useEffect(() => {
    let mounted = true;
    void loadPowerPlantSnapshot().then((next) => {
      if (mounted) setSnapshot(next);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return snapshot;
}

export function PowerPlantOverview() {
  const data = usePowerPlantSnapshot();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="运维总览"
        subtitle={`${data.plant.name} · 2×600 MW 超临界燃煤机组`}
        icon={<Factory size={22} />}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="当前总出力"
          value={`${data.metrics.totalOutputMw} MW`}
          hint="两台机组并网运行"
        />
        <Metric
          label="平均负荷率"
          value={`${data.metrics.averageLoadRate}%`}
          hint="机组运行区间稳定"
        />
        <Metric
          label="今日发电量"
          value={`${data.metrics.todayGenerationMwh.toLocaleString()} MWh`}
          hint="截至当前时刻"
        />
        <Metric
          label="当前告警"
          value={`${data.alarms.length} 条`}
          hint="1 条待诊断 · 1 条待确认"
        />
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="glass-panel rounded-2xl p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg">机组运行态势</h2>
              <p className="mt-1 text-(--color-muted) text-sm">实时出力、负荷率和健康评分</p>
            </div>
            <Activity size={18} className="text-(--color-primary)" />
          </div>
          <div className="space-y-4">
            {data.units.map((unit) => (
              <div
                key={unit.id}
                className="rounded-xl border border-(--color-border) bg-white/5 p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{unit.name}</div>
                    <div className="mt-1 text-(--color-muted) text-xs">
                      {unit.outputMw} MW / {unit.ratedPowerMw} MW · 负荷率 {unit.loadRate}%
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${unit.status === 'warning' ? 'bg-amber-400/10 text-amber-300' : 'bg-emerald-400/10 text-emerald-300'}`}
                  >
                    {unitStatus[unit.status]}
                  </span>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-(--color-primary)"
                    style={{ width: `${unit.loadRate}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-(--color-muted) text-xs">
                  <span>健康评分 {unit.healthScore}</span>
                  <span>燃煤量 {unit.coalConsumptionTph} t/h</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="font-semibold text-lg">Agent 协同状态</h2>
          <div className="mt-5 space-y-4">
            {(
              [
                ['监控 Agent', '实时采集 2,486 个测点', '运行中', Activity],
                ['诊断 Agent', '正在分析 2号机组异常', '运行中', ShieldCheck],
                ['决策 Agent', '1 条处置建议待确认', '待确认', Settings2],
              ] as const
            ).map(([name, desc, status, Icon]) => (
              <div
                key={String(name)}
                className="flex items-center gap-3 rounded-xl border border-(--color-border) bg-white/5 p-4"
              >
                <Icon size={20} className="text-(--color-primary)" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{name}</div>
                  <div className="mt-1 truncate text-(--color-muted) text-xs">{desc}</div>
                </div>
                <span className="text-emerald-300 text-xs">{status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="glass-panel rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-lg">最新异常事件</h2>
          <span className="text-(--color-muted) text-xs">实时更新</span>
        </div>
        <div className="divide-y divide-(--color-border)">
          {data.alarms.map((alarm) => (
            <div key={alarm.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <span className="w-16 text-(--color-muted) text-xs">{alarm.time}</span>
              <span className="font-medium">{alarm.device}</span>
              <span className="text-(--color-muted)">
                {alarm.metric} {alarm.value}
              </span>
              <span className="ml-auto text-amber-300 text-xs">
                {alarm.level} · {alarm.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function PowerPlantRealtime() {
  const data = usePowerPlantSnapshot();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="实时监控"
        subtitle="DCS、SCADA、SIS 与设备测点统一监测"
        icon={<Radio size={22} />}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="在线测点" value="2,486" hint="数据刷新 2 秒前" />
        <Metric label="数据源" value="6 / 6" hint="DCS · SCADA · SIS · 传感器" />
        <Metric label="实时总出力" value={`${data.metrics.totalOutputMw} MW`} hint="并网运行" />
        <Metric label="系统频率" value="50.02 Hz" hint="正常范围" />
      </section>
      <section className="glass-panel rounded-2xl p-5">
        <h2 className="font-semibold text-lg">电力生产与能量流向</h2>
        <div className="mt-8 grid gap-3 md:grid-cols-5">
          {[
            ['燃煤输入', '286.0 t/h', '煤耗'],
            ['锅炉系统', '1,142 MWth', '热能转换'],
            ['汽轮机系统', '902 MW', '机械能输出'],
            ['发电机系统', `${data.metrics.totalOutputMw} MW`, '电能输出'],
            ['升压站 → 电网', '860 MW', '并网送出'],
          ].map(([title, value, hint], index) => (
            <div
              key={title}
              className="relative rounded-2xl border border-(--color-border) bg-white/5 p-4 text-center"
            >
              <div className="text-(--color-muted) text-xs">{title}</div>
              <div className="mt-3 font-semibold text-xl">{value}</div>
              <div className="mt-2 text-(--color-muted) text-xs">{hint}</div>
              {index < 4 && (
                <span className="absolute -right-3 top-1/2 hidden text-(--color-primary) md:block">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="font-semibold text-lg">关键测点实时值</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              ['主蒸汽压力', '24.8 MPa'],
              ['主蒸汽温度', '566.2 °C'],
              ['轴承振动', '8.6 mm/s'],
              ['给水流量', '1,842 t/h'],
              ['排烟温度', '126.4 °C'],
              ['厂用电率', '5.82%'],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-(--color-border) p-3">
                <div className="text-(--color-muted) text-xs">{label}</div>
                <div className="mt-2 font-medium">{value}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg">出力趋势</h2>
              <p className="mt-1 text-(--color-muted) text-xs">两台机组总出力 · 单位：MW</p>
            </div>
            <span className="rounded-full bg-(--color-primary)/10 px-2 py-1 text-(--color-primary) text-xs">
              最近 24 小时
            </span>
          </div>
          <div className="h-56" role="img" aria-label="两台机组总出力趋势柱状图，单位为兆瓦">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trend} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.35} />
                <XAxis
                  dataKey="time"
                  stroke="var(--color-muted)"
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                />
                <YAxis
                  domain={[0, 1000]}
                  ticks={[0, 200, 400, 600, 800, 1000]}
                  stroke="var(--color-muted)"
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                  width={42}
                  label={{
                    value: 'MW',
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'var(--color-muted)',
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  formatter={(value) => [`${value} MW`, '总出力']}
                  contentStyle={{
                    background: 'var(--color-surface-strong)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: 'var(--color-text)',
                  }}
                />
                <Bar
                  dataKey="output"
                  fill="var(--color-primary)"
                  radius={[5, 5, 0, 0]}
                  name="总出力"
                >
                  <LabelList
                    dataKey="output"
                    position="top"
                    fill="var(--color-text)"
                    fontSize={10}
                    formatter={(value) => `${value}`}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PowerPlantDevices() {
  const data = usePowerPlantSnapshot();
  const [selectedUnitId, setSelectedUnitId] = useState<'all' | 'unit-1' | 'unit-2'>('all');
  const [selectedSystem, setSelectedSystem] = useState('全部系统');
  const [selectedDeviceId, setSelectedDeviceId] = useState('u2-turbine-hp');
  const unitFilteredDevices = data.devices.filter(
    (device) => selectedUnitId === 'all' || device.unitId === selectedUnitId,
  );
  const filteredDevices = unitFilteredDevices.filter(
    (device) => selectedSystem === '全部系统' || device.system === selectedSystem,
  );
  const selectedDevice = filteredDevices.find((device) => device.id === selectedDeviceId);
  const selectedPoints = selectedDevice
    ? data.measurementPoints.filter((point) => point.deviceId === selectedDevice.id)
    : [];
  const systems = Array.from(new Set(unitFilteredDevices.map((device) => device.system)));
  const filteredPoints = data.measurementPoints.filter(
    (point) =>
      (selectedUnitId === 'all' ||
        point.unitName === data.units.find((unit) => unit.id === selectedUnitId)?.name) &&
      (selectedSystem === '全部系统' || point.system === selectedSystem),
  );
  const pointsBySystem = systems
    .map((system) => ({
      system,
      points: filteredPoints.filter((point) => point.system === system),
    }))
    .filter((group) => group.points.length > 0);
  const deviceStatusClass: Record<string, string> = {
    正常: 'bg-emerald-400/10 text-emerald-300',
    预警: 'bg-amber-400/10 text-amber-300',
    关注: 'bg-sky-400/10 text-sky-300',
    检修: 'bg-violet-400/10 text-violet-300',
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="设备管理"
        subtitle="厂级 → 机组级 → 系统级 → 设备级 → 测点级"
        icon={<Cpu size={22} />}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="设备总数" value={`${data.devices.length} 台`} hint="两台机组全部设备" />
        <Metric
          label="测点总数"
          value={`${data.measurementPoints.length} 个`}
          hint="按系统完整展示"
        />
        <Metric
          label="在线设备"
          value={`${data.devices.filter((device) => device.status !== '检修').length} 台`}
          hint="数据源连接正常"
        />
        <Metric
          label="异常设备"
          value={`${data.devices.filter((device) => device.status === '预警' || device.status === '关注').length} 台`}
          hint="需要 Agent 持续关注"
        />
      </section>
      <section className="grid gap-6 xl:grid-cols-[250px_1fr]">
        <aside className="glass-panel rounded-2xl p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">设备层级</h2>
            <span className="text-(--color-muted) text-xs">厂级</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedUnitId('all');
              setSelectedSystem('全部系统');
            }}
            className={`focus-ring mb-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${selectedUnitId === 'all' && selectedSystem === '全部系统' ? 'bg-(--color-primary)/15 text-(--color-primary)' : 'hover:bg-white/5'}`}
          >
            <span>示范火力发电厂</span>
            <span className="text-(--color-muted) text-xs">{data.devices.length}</span>
          </button>
          {data.units.map((unit) => (
            <div key={unit.id} className="mt-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedUnitId(unit.id as 'unit-1' | 'unit-2');
                  setSelectedSystem('全部系统');
                }}
                className={`focus-ring flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${selectedUnitId === unit.id && selectedSystem === '全部系统' ? 'bg-(--color-primary)/15 text-(--color-primary)' : 'hover:bg-white/5'}`}
              >
                <span className="truncate">{unit.name}</span>
                <span className="text-(--color-muted) text-xs">
                  {data.devices.filter((device) => device.unitId === unit.id).length}
                </span>
              </button>
              {(selectedUnitId === unit.id || selectedUnitId === 'all') && (
                <div className="mt-1 ml-3 space-y-1 border-(--color-border) border-l pl-2">
                  {systems.map((system) => (
                    <button
                      type="button"
                      key={`${unit.id}-${system}`}
                      onClick={() => {
                        setSelectedUnitId(unit.id as 'unit-1' | 'unit-2');
                        setSelectedSystem(system);
                      }}
                      className={`focus-ring flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs ${selectedUnitId === unit.id && selectedSystem === system ? 'bg-white/10 text-(--color-primary)' : 'text-(--color-muted) hover:bg-white/5'}`}
                    >
                      <span>{system}</span>
                      <span>
                        {
                          unitFilteredDevices.filter(
                            (device) => device.unitId === unit.id && device.system === system,
                          ).length
                        }
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </aside>
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-lg">全部设备与设备概览</h2>
                <p className="mt-1 text-(--color-muted) text-sm">
                  按机组和系统查看全部设备，点击设备查看实时测点明细
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                {(['all', 'unit-1', 'unit-2'] as const).map((unitId) => (
                  <button
                    type="button"
                    key={unitId}
                    onClick={() => {
                      setSelectedUnitId(unitId);
                      setSelectedSystem('全部系统');
                    }}
                    className={`focus-ring rounded-full border px-3 py-1.5 ${selectedUnitId === unitId ? 'border-(--color-primary)/50 bg-(--color-primary)/10 text-(--color-primary)' : 'border-(--color-border) text-(--color-muted)'}`}
                  >
                    {unitId === 'all' ? '全部机组' : unitId === 'unit-1' ? '1号机组' : '2号机组'}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-(--color-border) border-b text-(--color-muted) text-xs">
                  <tr>
                    <th className="pb-3">设备</th>
                    <th className="pb-3">系统</th>
                    <th className="pb-3">关键指标</th>
                    <th className="pb-3">测点数</th>
                    <th className="pb-3">健康评分</th>
                    <th className="pb-3">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border)">
                  {filteredDevices.map((device) => (
                    <tr
                      key={device.id}
                      className={selectedDevice?.id === device.id ? 'bg-(--color-primary)/5' : ''}
                    >
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedDeviceId(device.id)}
                          className="focus-ring text-left font-medium hover:text-(--color-primary)"
                        >
                          {device.name}
                          <span className="mt-1 block text-(--color-muted) text-xs">
                            {device.unitName}
                          </span>
                        </button>
                      </td>
                      <td className="py-3 text-(--color-muted)">{device.system}</td>
                      <td className="py-3">
                        <span>{device.primaryMetric}</span>
                        <span className="mt-1 block text-(--color-muted) text-xs">
                          {device.primaryValue}
                        </span>
                      </td>
                      <td className="py-3 text-(--color-muted)">{device.signalCount}</td>
                      <td className="py-3">{device.healthScore}</td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${deviceStatusClass[device.status]}`}
                        >
                          {device.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {selectedDevice && (
            <div className="glass-panel rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-lg">{selectedDevice.name}</h2>
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${deviceStatusClass[selectedDevice.status]}`}
                    >
                      {selectedDevice.status}
                    </span>
                  </div>
                  <p className="mt-1 text-(--color-muted) text-sm">
                    {selectedDevice.unitName} · {selectedDevice.system} · 健康评分{' '}
                    {selectedDevice.healthScore}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDeviceId('')}
                  className="focus-ring rounded-xl border border-(--color-border) px-3 py-2 text-(--color-muted) text-xs"
                >
                  清除选择
                </button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {selectedPoints.map((point) => (
                  <div
                    key={point.id}
                    className="rounded-xl border border-(--color-border) bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-(--color-muted) text-xs">{point.name}</span>
                      <span
                        className={`h-2 w-2 rounded-full ${point.status === '正常' ? 'bg-emerald-400' : 'bg-amber-400'}`}
                      />
                    </div>
                    <div className="mt-2 font-semibold">
                      {point.value}{' '}
                      <span className="font-normal text-(--color-muted) text-xs">{point.unit}</span>
                    </div>
                    <div className="mt-2 text-(--color-muted) text-xs">
                      更新于 {point.updatedAt}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-lg">全部测点明细</h2>
                <p className="mt-1 text-(--color-muted) text-sm">
                  当前筛选范围内共 {filteredPoints.length} 个测点，按系统分类展示
                </p>
              </div>
              <span className="rounded-full bg-(--color-primary)/10 px-3 py-1 text-(--color-primary) text-xs">
                {selectedUnitId === 'all'
                  ? '全厂'
                  : data.units.find((unit) => unit.id === selectedUnitId)?.name}
                {' · '}
                {selectedSystem}
              </span>
            </div>
            <div className="mt-5 max-h-[620px] space-y-5 overflow-auto pr-1">
              {pointsBySystem.map(({ system, points }) => (
                <section key={system}>
                  <div className="mb-2 flex items-center justify-between border-(--color-border) border-b pb-2">
                    <h3 className="font-medium text-sm">{system}</h3>
                    <span className="text-(--color-muted) text-xs">{points.length} 个测点</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-xs">
                      <thead className="text-(--color-muted)">
                        <tr>
                          <th className="pb-2">测点</th>
                          <th className="pb-2">设备</th>
                          <th className="pb-2">机组</th>
                          <th className="pb-2">当前值</th>
                          <th className="pb-2">更新时间</th>
                          <th className="pb-2">状态</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-(--color-border)">
                        {points.map((point) => (
                          <tr key={point.id}>
                            <td className="py-2 font-medium">{point.name}</td>
                            <td className="py-2 text-(--color-muted)">{point.deviceName}</td>
                            <td className="py-2 text-(--color-muted)">{point.unitName}</td>
                            <td className="py-2">
                              {point.value} {point.unit}
                            </td>
                            <td className="py-2 text-(--color-muted)">{point.updatedAt}</td>
                            <td className="py-2">
                              <span
                                className={`rounded-full px-2 py-1 ${deviceStatusClass[point.status]}`}
                              >
                                {point.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PowerPlantAnalytics() {
  const data = usePowerPlantSnapshot();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="分析报告"
        subtitle="运行趋势、故障分析与智能运维报告"
        icon={<BarChart3 size={22} />}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="本月非计划停机" value="0 次" hint="较上月减少 1 次" />
        <Metric label="平均健康评分" value="88.4" hint="两台机组综合评分" />
        <Metric label="诊断准确率" value="92.6%" hint="基于历史案例校验" />
        <Metric label="报告生成" value="24 份" hint="本月自动生成" />
      </section>
      <section className="glass-panel rounded-2xl p-5">
        <h2 className="font-semibold text-lg">机组运行效率趋势</h2>
        <div className="mt-6 flex h-56 items-end gap-3 border-(--color-border) border-b border-l px-3 pb-2">
          {data.trend.map((item) => (
            <div key={item.time} className="flex h-full flex-1 items-end gap-1">
              <div
                className="w-1/2 rounded-t bg-(--color-primary)/70"
                style={{ height: `${(item.output / 1000) * 100}%` }}
              />
              <div
                className="w-1/2 rounded-t bg-emerald-400/60"
                style={{ height: `${(item.co2 / 800) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between text-(--color-muted) text-xs">
          {data.trend.map((item) => (
            <span key={item.time}>{item.time}</span>
          ))}
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ['日报', '今日运行报告', '包含机组负荷、煤耗、告警和排放摘要'],
          ['诊断报告', '2号机组振动异常报告', '包含证据链、历史案例和处置建议'],
          ['降碳报告', '月度节能降碳报告', '包含减排量化和新能源消纳支撑'],
        ].map(([label, title, desc]) => (
          <div key={label} className="glass-panel rounded-2xl p-5">
            <div className="text-(--color-primary) text-xs">{label}</div>
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-2 text-(--color-muted) text-sm">{desc}</p>
            <button
              type="button"
              className="focus-ring mt-5 rounded-xl border border-(--color-border) px-3 py-2 text-sm"
            >
              生成报告
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}

export function PowerPlantMonitoring() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="系统监控"
        subtitle="数据源、知识库、模型服务与 Agent 健康状态"
        icon={<Server size={22} />}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="数据源在线" value="6 / 6" hint="DCS、SCADA、SIS 等" />
        <Metric label="知识库文档" value="1,284" hint="规程、手册、历史案例" />
        <Metric label="RAG 检索" value="正常" hint="平均响应 320 ms" />
        <Metric label="Agent 服务" value="3 / 3" hint="协同链路正常" />
      </section>
      <section className="glass-panel rounded-2xl p-5">
        <h2 className="font-semibold text-lg">服务与数据源状态</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(
            [
              ['DCS 实时数据源', '2,486 个测点', Database],
              ['SCADA 设备数据', '842 个设备信号', Zap],
              ['SIS 历史数据', '近 30 天可用', Gauge],
              ['知识库与 RAG 服务', '索引已更新', Server],
              ['LLM 服务接口', '待配置 / 可用', Settings2],
              ['告警与通知服务', '运行正常', AlertTriangle],
            ] as const
          ).map(([name, desc, Icon]) => (
            <div
              key={String(name)}
              className="flex items-center gap-3 rounded-xl border border-(--color-border) p-4"
            >
              <Icon size={18} className="text-(--color-primary)" />
              <div className="flex-1">
                <div className="font-medium text-sm">{name}</div>
                <div className="mt-1 text-(--color-muted) text-xs">{desc}</div>
              </div>
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
