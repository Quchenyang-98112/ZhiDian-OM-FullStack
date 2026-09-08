import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Gauge,
  GitBranch,
  Link2,
  type LucideIcon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageHeader } from '../components/layout/PageHeader';
import {
  decisionComparison,
  generatingUnits,
  optimizationScenarios,
  powerPlantDevices,
  powerPlantHistorySeries,
  powerPlantMeasurementPoints,
  type PowerPlantMeasurementPoint,
} from '../lib/power-plant-data';
import { loadPowerPlantSnapshot, type PowerPlantSnapshot } from '../lib/power-plant-data-provider';
import { SelectField } from '../components/ui/SelectField';
import { backendApi } from '../lib/zhidian-api';

const cardClass = 'glass-panel rounded-2xl p-5';
type IconRow = { title: string; detail: string; icon: LucideIcon };
const bearingHistory = powerPlantHistorySeries.turbineBearingVibration;
type HistorySeries = {
  deviceId: string;
  deviceName: string;
  metric: string;
  unit: string;
  window: string;
  interval: string;
  points: ReadonlyArray<{ time: string; value: number; baseline: number; threshold?: number }>;
};

const retrievalSteps = [
  {
    id: 'telemetry',
    title: '读取实时测点',
    source: 'DCS / SCADA 实时测点',
    detail: '轴承振动 8.6 mm/s，较基线升高 42%。',
  },
  {
    id: 'rules',
    title: '检索设备规程',
    source: '知识库 / 汽轮机轴承振动规程.pdf',
    detail: '匹配超临界机组轴承振动预警阈值与处置要求。',
  },
  {
    id: 'cases',
    title: '比对历史案例',
    source: '知识库 / 历史故障案例 / 轴承润滑案例-2025',
    detail: '发现相似工况与润滑状态变化相关，建议补充油温和回油压力证据。',
  },
  {
    id: 'window',
    title: '校验时间窗口',
    source: '本地历史曲线 / 10:12—10:42',
    detail: '趋势连续上升 30 分钟，证据足以进入维护时机优化。',
  },
] as const;

type DiagnosisTask = {
  unitId: string;
  deviceId: string;
  measurementPointId: string;
  timeWindow: string;
};

type AgentStreamResult = {
  agent?: string;
  status?: string;
  summary?: string;
  llmEnabled?: boolean;
  llmOutput?: string;
  llmError?: string;
};

const defaultDiagnosisTask: DiagnosisTask = {
  unitId: 'unit-2',
  deviceId: 'u2-turbine-hp',
  measurementPointId: 'u2-turbine-hp-point-1',
  timeWindow: '最近 30 分钟',
};

const diagnosisTaskStorageKey = 'zhidian-diagnosis-task';

const decisionSteps = [
  { id: 'context', title: '汇总运行上下文', detail: '设备风险、负荷率、维护窗口和备件状态' },
  { id: 'carbon', title: '测算双碳影响', detail: '计算能耗、碳排放和新能源消纳变化' },
  { id: 'score', title: '执行多目标评分', detail: '安全约束优先，比较收益、风险和运维成本' },
  { id: 'output', title: '生成综合决策', detail: '输出推荐方案、依据和后续人工确认动作' },
] as const;

function AgentDetailLayout({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/agent-collaboration"
        className="focus-ring inline-flex w-fit items-center gap-2 text-(--color-muted) text-sm hover:text-(--color-text)"
      >
        <ArrowLeft size={16} /> 返回 Agent 协同中心
      </Link>
      <PageHeader title={title} subtitle={subtitle} icon={icon} />
      {children}
    </div>
  );
}

function StatusPill({
  children,
  tone = 'green',
}: {
  children: React.ReactNode;
  tone?: 'green' | 'amber' | 'blue' | 'violet';
}) {
  const styles = {
    green: 'bg-emerald-400/10 text-emerald-300',
    amber: 'bg-amber-400/10 text-amber-300',
    blue: 'bg-sky-400/10 text-sky-300',
    violet: 'bg-violet-400/10 text-violet-300',
  };
  return <span className={`rounded-full px-2 py-1 text-xs ${styles[tone]}`}>{children}</span>;
}

function HistoryCurvePanel({
  title = '设备历史运行曲线',
  history = bearingHistory,
}: {
  title?: string;
  history?: HistorySeries;
}) {
  return (
    <section className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">{title}</h2>
          <p className="mt-1 text-(--color-muted) text-sm">
            {history.deviceName} · {history.metric} · 单位：{history.unit}
          </p>
        </div>
        <StatusPill tone="blue">本地历史窗口</StatusPill>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[
          ['时间窗口', history.window],
          ['采样频率', history.interval],
          [
            '当前值',
            `${history.points[history.points.length - 1].value} ${history.unit}`,
          ],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-(--color-border) bg-white/5 p-3">
            <div className="text-(--color-muted) text-xs">{label}</div>
            <div className="mt-1 font-medium text-sm">{value}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 h-64 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={history.points}
            margin={{ top: 8, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.5} />
            <XAxis dataKey="time" tick={{ fill: 'var(--color-muted)', fontSize: 10 }} />
            <YAxis
              width={42}
              domain={['auto', 'auto']}
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              unit={` ${history.unit}`}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-surface-strong)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                color: 'var(--color-text)',
              }}
            />
            <ReferenceLine
              y={history.points[history.points.length - 1].threshold ?? history.points[0].baseline * 1.18}
              stroke="#f59e0b"
              strokeDasharray="5 5"
              label={{ value: '预警参考线', fill: '#fbbf24', fontSize: 10 }}
            />
            <Line
              type="monotone"
              dataKey="baseline"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              dot={false}
              name="历史基线"
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--color-primary)"
              strokeWidth={2.5}
              dot={false}
              name="实时值"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-(--color-muted) text-xs">
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-full bg-(--color-primary)" />
          实时值
        </span>
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-400" />
          历史基线
        </span>
        <span>
          <i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-400" />
          预警阈值
        </span>
      </div>
    </section>
  );
}

function historyForPoint(point: PowerPlantMeasurementPoint | undefined): HistorySeries {
  if (!point || point.name.includes('振动')) return bearingHistory;
  const parsed = Number(point.value.replaceAll(',', '').replace(/[^0-9.-]/g, ''));
  const current = Number.isFinite(parsed) ? parsed : 1;
  const baseline = current * 0.96;
  return {
    deviceId: point.deviceId,
    deviceName: `${point.unitName}${point.deviceName}`,
    metric: point.name,
    unit: point.unit,
    window: '按当前任务生成的仿真历史窗口',
    interval: '2 分钟采样',
    points: Array.from({ length: 16 }, (_, index) => ({
      time: `${String(10 + Math.floor((12 + index * 2) / 60)).padStart(2, '0')}:${String((12 + index * 2) % 60).padStart(2, '0')}`,
      value: Number((baseline + (current - baseline) * (index / 15)).toFixed(2)),
      baseline: Number(baseline.toFixed(2)),
      threshold: Number((current * 1.1).toFixed(2)),
    })),
  };
}

export function MonitoringAgentPage() {
  const [refreshed, setRefreshed] = useState(false);
  const points = powerPlantMeasurementPoints.slice(0, 12);

  return (
    <AgentDetailLayout
      title="监控 Agent"
      subtitle="实时采集机组测点，识别设备状态、能效偏差与异常变化"
      icon={<Activity size={22} />}
    >
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['接入测点', '2,486', '在线率 99.6%'],
          ['当前异常', '3 条', '2号机组 2 条'],
          ['优化候选', '6 台', '能效偏低或轻度退化'],
          ['执行状态', '运行中', '数据质量检查正常'],
        ].map(([label, value, hint]) => (
          <div key={label} className={cardClass}>
            <div className="text-(--color-muted) text-sm">{label}</div>
            <div className="mt-3 font-semibold text-2xl">{value}</div>
            <div className="mt-2 text-emerald-300 text-xs">{hint}</div>
          </div>
        ))}
      </section>

      <HistoryCurvePanel title="监控时间窗口与历史运行曲线" />

      <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className={cardClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-lg">实时测点采样</h2>
              <p className="mt-1 text-(--color-muted) text-sm">
                异常识别前先完成数据质量检查，并同步筛选能效优化候选设备
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRefreshed(true)}
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-(--color-border) px-3 py-2 text-(--color-muted) text-xs"
            >
              <RefreshCw size={14} /> 刷新数据
            </button>
          </div>
          {refreshed && (
            <div className="mt-3 text-emerald-300 text-xs">已刷新：最新采样时间 10:42:24</div>
          )}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-(--color-border) border-b text-(--color-muted) text-xs">
                <tr>
                  <th className="pb-3">测点</th>
                  <th className="pb-3">设备</th>
                  <th className="pb-3">当前值</th>
                  <th className="pb-3">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {points.map((point) => (
                  <tr key={point.id}>
                    <td className="py-3 font-medium">{point.name}</td>
                    <td className="py-3 text-(--color-muted)">{point.deviceName}</td>
                    <td className="py-3">
                      {point.value}{' '}
                      <span className="text-(--color-muted) text-xs">{point.unit}</span>
                    </td>
                    <td className="py-3">
                      <StatusPill tone={point.status === '正常' ? 'green' : 'amber'}>
                        {point.status}
                      </StatusPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className={cardClass}>
          <h2 className="font-semibold text-lg">监控输出</h2>
          <div className="mt-5 space-y-3">
            {(
              [
                {
                  title: '异常检测报告',
                  detail: '形成异常等级、异常评分与置信度',
                  icon: AlertTriangle,
                },
                { title: '优化需求判断', detail: '识别设备正常但能效偏低的情况', icon: Gauge },
                {
                  title: '执行路径记录',
                  detail: '把结果交给诊断 Agent 或双碳分析',
                  icon: GitBranch,
                },
              ] satisfies IconRow[]
            ).map(({ title, detail, icon: Icon }) => (
              <div key={title} className="flex gap-3 rounded-xl border border-(--color-border) p-4">
                <Icon className="mt-0.5 shrink-0 text-(--color-primary)" size={18} />
                <div>
                  <div className="font-medium text-sm">{title}</div>
                  <div className="mt-1 text-(--color-muted) text-xs leading-5">{detail}</div>
                </div>
              </div>
            ))}
          </div>
          <Link
            to="/devices"
            className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-(--color-text) px-4 py-2.5 font-semibold text-(--color-background) text-sm"
          >
            查看全部设备与测点 <Search size={16} />
          </Link>
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="font-semibold text-lg">监控 Agent 工作边界</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {(
            [
              { title: '数据质量检查', detail: '缺失值、异常值、时间连续性', icon: Link2 },
              { title: '趋势与异常识别', detail: '趋势偏移、越限、组合异常', icon: Gauge },
              { title: '分支判断', detail: '健康、能效偏低、轻度退化或异常', icon: ClipboardCheck },
            ] satisfies IconRow[]
          ).map(({ title, detail, icon: Icon }) => (
            <div key={title} className="rounded-xl border border-(--color-border) p-4">
              <Icon className="text-(--color-primary)" size={19} />
              <div className="mt-3 font-medium text-sm">{title}</div>
              <div className="mt-1 text-(--color-muted) text-xs">{detail}</div>
            </div>
          ))}
        </div>
      </section>
    </AgentDetailLayout>
  );
}

export function DiagnosisAgentPage() {
  const [searchState, setSearchState] = useState<'idle' | 'running' | 'complete'>('idle');
  const [retrievedSteps, setRetrievedSteps] = useState<string[]>([]);
  const [agentResults, setAgentResults] = useState<Record<string, AgentStreamResult>>({});
  const [plantSnapshot, setPlantSnapshot] = useState<PowerPlantSnapshot | null>(null);
  const [task, setTask] = useState<DiagnosisTask>(defaultDiagnosisTask);
  const searchTimers = useRef<number[]>([]);

  useEffect(() => {
    let active = true;
    void loadPowerPlantSnapshot().then((snapshot) => {
      if (!active) return;
      setPlantSnapshot(snapshot);
      setTask((current) => {
        const unit = snapshot.units.find((item) => item.id === current.unitId) ?? snapshot.units[0];
        const devices = snapshot.devices.filter((item) => item.unitId === unit?.id);
        const device =
          devices.find((item) => item.id === current.deviceId) ??
          devices.find((item) => item.name === '汽轮机高压缸') ??
          devices[0];
        const points = snapshot.measurementPoints.filter((item) => item.deviceId === device?.id);
        const point =
          points.find((item) => item.id === current.measurementPointId) ??
          points.find((item) => item.name.includes('振动')) ??
          points[0];
        return {
          ...current,
          unitId: unit?.id ?? current.unitId,
          deviceId: device?.id ?? current.deviceId,
          measurementPointId: point?.id ?? current.measurementPointId,
        };
      });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(diagnosisTaskStorageKey, JSON.stringify(task));
  }, [task]);

  useEffect(
    () => () => {
      searchTimers.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
    },
    [],
  );

  const startEvidenceSearch = async () => {
    searchTimers.current.forEach((timer) => {
      window.clearTimeout(timer);
    });
    searchTimers.current = [];
    setRetrievedSteps([]);
    setAgentResults({});
    setSearchState('running');
    try {
      const response = await fetch('/api/agents/collaboration/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task),
      });
      if (!response.ok || !response.body) throw new Error('协同流不可用');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const event of events) {
          const dataLine = event.split('\n').find((line) => line.startsWith('data: '));
          if (!dataLine) continue;
          const payload = JSON.parse(dataLine.slice(6)) as AgentStreamResult & { role?: string };
          if (payload.status === 'running') {
            if (payload.role === 'monitor') setRetrievedSteps(['telemetry']);
            if (payload.role === 'diagnosis') setRetrievedSteps(['telemetry', 'rules', 'cases']);
            if (payload.role === 'decision') setRetrievedSteps(retrievalSteps.map((step) => step.id));
          }
          if (payload.agent === '诊断 Agent' && payload.status === '已完成') {
            setRetrievedSteps(['telemetry', 'rules', 'cases']);
          }
          if (payload.agent) {
            setAgentResults((current) => ({ ...current, [payload.agent ?? '未知 Agent']: payload }));
          }
          if (payload.status === 'completed') setSearchState('complete');
        }
        if (done) break;
      }
      setSearchState('complete');
      return;
    } catch {
      // The local timeline remains useful when FastAPI is stopped or unavailable.
    }
    activeRetrievalSteps.forEach((step, index) => {
      const timer = window.setTimeout(
        () => {
          setRetrievedSteps((current) => [...current, step.id]);
          if (index === activeRetrievalSteps.length - 1) setSearchState('complete');
        },
        (index + 1) * 650,
      );
      searchTimers.current.push(timer);
    });
  };

  const snapshot = plantSnapshot ?? {
    units: generatingUnits,
    devices: powerPlantDevices,
    measurementPoints: powerPlantMeasurementPoints,
  };
  const selectedUnit = snapshot.units.find((item) => item.id === task.unitId) ?? snapshot.units[0];
  const selectableDevices = snapshot.devices.filter((item) => item.unitId === selectedUnit?.id);
  const selectedDevice =
    selectableDevices.find((item) => item.id === task.deviceId) ?? selectableDevices[0];
  const selectablePoints = snapshot.measurementPoints.filter(
    (item) => item.deviceId === selectedDevice?.id,
  );
  const selectedPoint =
    selectablePoints.find((item) => item.id === task.measurementPointId) ?? selectablePoints[0];
  const taskTitle = `${selectedUnit?.name ?? '机组'} · ${selectedDevice?.name ?? '设备'} · ${selectedPoint?.name ?? '测点'}`;
  const activeRetrievalSteps = retrievalSteps.map((step, index) => {
    if (index === 0 && selectedPoint) {
      return {
        ...step,
        source: `DCS / SCADA · ${selectedPoint.name}`,
        detail: `当前值 ${selectedPoint.value} ${selectedPoint.unit}，已纳入数据质量与异常判断。`,
      };
    }
    if (index === 1 && selectedDevice) {
      return {
        ...step,
        source: `知识库 / ${selectedDevice.system}`,
        detail: `匹配 ${selectedDevice.name} 的设备规程、阈值和处置要求。`,
      };
    }
    if (index === 2 && selectedDevice) {
      return {
        ...step,
        source: `知识库 / 历史案例 / ${selectedDevice.name}`,
        detail: `对比 ${selectedDevice.name} 的历史工况、退化特征和维护记录。`,
      };
    }
    if (index === 3) {
      return {
        ...step,
        source: `本地历史曲线 / ${task.timeWindow}`,
        detail: `校验 ${task.timeWindow} 内的趋势连续性，并将证据交给决策 Agent。`,
      };
    }
    return step;
  });

  return (
    <AgentDetailLayout
      title="诊断 Agent"
      subtitle="结合异常证据、历史工单和知识检索定位故障原因，并判断维护时机"
      icon={<BrainCircuit size={22} />}
    >
      <section className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg">选择诊断任务</h2>
            <p className="mt-1 text-(--color-muted) text-sm">
              选择具体机组、设备、测点和历史时间窗口；提交后将使用同一任务上下文运行三 Agent 协同链路。
            </p>
          </div>
          <StatusPill tone="blue">当前场景任务</StatusPill>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SelectField
            label="机组"
            value={task.unitId}
            onChange={(event) => {
              const nextUnitId = event.target.value;
              const nextDevice = snapshot.devices.find((item) => item.unitId === nextUnitId);
              const nextPoint = snapshot.measurementPoints.find(
                (item) => item.deviceId === nextDevice?.id,
              );
              setTask((current) => ({
                ...current,
                unitId: nextUnitId,
                deviceId: nextDevice?.id ?? current.deviceId,
                measurementPointId: nextPoint?.id ?? current.measurementPointId,
              }));
              setSearchState('idle');
              setRetrievedSteps([]);
            }}
          >
            {snapshot.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="设备"
            value={selectedDevice?.id ?? ''}
            onChange={(event) => {
              const nextDevice = snapshot.devices.find((item) => item.id === event.target.value);
              const nextPoint = snapshot.measurementPoints.find(
                (item) => item.deviceId === nextDevice?.id,
              );
              setTask((current) => ({
                ...current,
                deviceId: event.target.value,
                measurementPointId: nextPoint?.id ?? current.measurementPointId,
              }));
              setSearchState('idle');
              setRetrievedSteps([]);
            }}
          >
            {selectableDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}（{device.system}）
              </option>
            ))}
          </SelectField>
          <SelectField
            label="异常测点"
            value={selectedPoint?.id ?? ''}
            onChange={(event) => {
              setTask((current) => ({ ...current, measurementPointId: event.target.value }));
              setSearchState('idle');
              setRetrievedSteps([]);
            }}
          >
            {selectablePoints.map((point) => (
              <option key={point.id} value={point.id}>
                {point.name}（{point.value} {point.unit}）
              </option>
            ))}
          </SelectField>
          <SelectField
            label="历史时间窗口"
            value={task.timeWindow}
            onChange={(event) => setTask((current) => ({ ...current, timeWindow: event.target.value }))}
          >
            <option value="最近 30 分钟">最近 30 分钟</option>
            <option value="最近 2 小时">最近 2 小时</option>
            <option value="今日运行周期">今日运行周期</option>
            <option value="最近 7 天">最近 7 天</option>
          </SelectField>
        </div>
        <div className="mt-4 rounded-xl border border-(--color-primary)/20 bg-(--color-primary)/5 p-3 text-(--color-muted) text-xs">
          当前任务：<span className="font-medium text-(--color-text)">{taskTitle}</span> ·{' '}
          {task.timeWindow} · 设备系统：{selectedDevice?.system ?? '未选择'}
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div className={cardClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-lg">当前诊断任务</h2>
              <p className="mt-1 text-(--color-muted) text-sm">{taskTitle}诊断任务</p>
            </div>
            <StatusPill
              tone={
                searchState === 'complete' ? 'green' : searchState === 'running' ? 'blue' : 'amber'
              }
            >
              {searchState === 'complete'
                ? '证据已汇总'
                : searchState === 'running'
                  ? '检索中'
                  : '待启动'}
            </StatusPill>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              [
                '异常测点',
                selectedPoint?.name ?? '未选择',
                `${selectedPoint?.value ?? '--'} ${selectedPoint?.unit ?? ''}`,
              ],
              ['时间窗口', task.timeWindow, '用于历史曲线与证据校验'],
              ['关联设备', selectedDevice?.name ?? '未选择', selectedDevice?.unitName ?? ''],
              ['诊断置信度', '78%', '证据待补充'],
            ].map(([label, value, hint]) => (
              <div key={label} className="rounded-xl border border-(--color-border) bg-white/5 p-4">
                <div className="text-(--color-muted) text-xs">{label}</div>
                <div className="mt-2 font-semibold">{value}</div>
                <div className="mt-1 text-(--color-muted) text-xs">{hint}</div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={startEvidenceSearch}
            disabled={searchState === 'running'}
            className="focus-ring mt-5 inline-flex items-center gap-2 rounded-xl bg-(--color-primary) px-4 py-2.5 font-medium text-(--color-surface)"
          >
            <Search size={16} />
            {searchState === 'running'
              ? '检索中…'
              : searchState === 'complete'
                ? '重新检索证据'
                : '开始诊断'}
          </button>
          <div
            className="mt-4 rounded-xl border border-(--color-border) bg-white/5 p-4"
            aria-live="polite"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium text-sm">检索事件流</div>
              <span className="text-(--color-muted) text-xs">
                {retrievedSteps.length}/{activeRetrievalSteps.length} 个步骤
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {activeRetrievalSteps.map((step) => {
                const completed = retrievedSteps.includes(step.id);
                const active =
                  searchState === 'running' &&
                  !completed &&
                  retrievedSteps.length === activeRetrievalSteps.findIndex((item) => item.id === step.id);
                return (
                  <div
                    key={step.id}
                    className={`rounded-lg border p-3 ${completed ? 'border-emerald-400/20 bg-emerald-400/5' : active ? 'border-sky-400/30 bg-sky-400/5' : 'border-(--color-border)'}`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={`h-2 w-2 rounded-full ${completed ? 'bg-emerald-400' : active ? 'animate-pulse bg-sky-400' : 'bg-slate-500'}`}
                      />
                      <span className="font-medium">{step.title}</span>
                      <span className="ml-auto text-(--color-muted) text-xs">
                        {completed ? '已完成' : active ? '执行中' : '等待中'}
                      </span>
                    </div>
                    <div className="mt-1 pl-4 text-(--color-muted) text-xs">
                      来源：{step.source}
                    </div>
                    {completed && (
                      <div className="mt-1 pl-4 text-emerald-300 text-xs">{step.detail}</div>
                    )}
                  </div>
                );
              })}
            </div>
            {searchState === 'complete' && (
              <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 text-emerald-300 text-xs">
                检索完成：已汇总实时测点、设备规程、历史案例和历史曲线，可提交给决策 Agent
                进行维护时机优化。
              </div>
            )}
          </div>
          {Object.keys(agentResults).length > 0 && (
            <div className="mt-4 space-y-2" aria-live="polite">
              <div className="font-medium text-sm">Agent 返回结果</div>
              {Object.entries(agentResults).map(([agent, result]) => (
                <div
                  key={agent}
                  className="rounded-lg border border-(--color-border) bg-white/5 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{agent}</span>
                    <StatusPill tone={result.llmOutput ? 'green' : result.llmError ? 'amber' : 'blue'}>
                      {result.llmOutput ? '模型已生成' : result.llmError ? '模型调用失败' : '规则引擎结果'}
                    </StatusPill>
                  </div>
                  {result.summary && <p className="mt-2 text-(--color-muted)">{result.summary}</p>}
                  {result.llmOutput && (
                    <p className="mt-2 whitespace-pre-wrap leading-5 text-(--color-text)">
                      {result.llmOutput}
                    </p>
                  )}
                  {result.llmError && <p className="mt-2 text-amber-300">{result.llmError}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={cardClass}>
          <h2 className="font-semibold text-lg">诊断证据链</h2>
          <div className="mt-5 space-y-4">
            {activeRetrievalSteps.slice(0, 3).map(({ id, title, detail, source }, index) => {
              const Icon = [Activity, Database, ClipboardCheck][index] ?? Activity;
              return (
                <div key={id} className="flex gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--color-primary)/15 text-(--color-primary) text-xs">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <Icon size={15} className="text-(--color-primary)" /> {title}
                    </div>
                    <div className="mt-1 text-(--color-muted) text-xs">{detail}</div>
                    <div className="mt-1 text-sky-300 text-xs">来源：{source}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <Link
            to="/knowledge-base"
            className="focus-ring mt-5 inline-flex items-center gap-2 text-(--color-primary) text-sm hover:text-(--color-text)"
          >
            管理本地知识库 <ArrowRight size={16} />
          </Link>
        </div>
      </section>
      <HistoryCurvePanel
        title="诊断证据对应的历史运行曲线"
        history={historyForPoint(selectedPoint)}
      />
      <section className={cardClass}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-emerald-300" size={19} />
          <h2 className="font-semibold text-lg">诊断结论与维护时机输入</h2>
        </div>
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4">
          <div className="font-medium">初步判断：汽轮机高压缸轴承存在轻度退化迹象</div>
          <p className="mt-2 text-(--color-muted) text-sm leading-6">
            诊断 Agent
            不直接决定“立即检修”。它将故障候选、证据充分度、预计附加能耗和维护窗口交给双碳分析与决策
            Agent 比较。
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            <StatusPill tone="amber">置信度 78%</StatusPill>
            <StatusPill tone="violet">建议进入维护时机优化</StatusPill>
            <span className="text-(--color-muted)">输出将交由决策 Agent 评估</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              to="/agent-collaboration/decision"
              className="focus-ring inline-flex items-center gap-2 rounded-xl bg-(--color-primary) px-4 py-2.5 font-medium text-(--color-surface) text-sm"
            >
              前往决策 Agent <ArrowRight size={16} />
            </Link>
            <Link
              to="/devices"
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-(--color-border) px-4 py-2.5 font-medium text-(--color-muted) text-sm"
            >
              查看关联设备 <Search size={16} />
            </Link>
          </div>
        </div>
      </section>
    </AgentDetailLayout>
  );
}

export function DecisionAgentPage() {
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [decisionTrace, setDecisionTrace] = useState<string[]>([]);
  const [selectedScenario, setSelectedScenario] = useState('维护时机优化');
  const decisionTimers = useRef<number[]>([]);
  const selected =
    optimizationScenarios.find((scenario) => scenario.id === selectedScenario) ??
    optimizationScenarios[1];

  useEffect(
    () => () => {
      decisionTimers.current.forEach((timer) => {
        window.clearTimeout(timer);
      });
    },
    [],
  );

  const generateDecision = async () => {
    decisionTimers.current.forEach((timer) => {
      window.clearTimeout(timer);
    });
    decisionTimers.current = [];
    setGenerated(false);
    setConfirmed(false);
    setDecisionTrace([]);
    setGenerating(true);
    try {
      const taskPayload = window.sessionStorage.getItem(diagnosisTaskStorageKey);
      await backendApi.send('/api/agents/decision/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(taskPayload ? { body: taskPayload } : {}),
      });
      setDecisionTrace(decisionSteps.map((step) => step.id));
      setGenerating(false);
      setGenerated(true);
      return;
    } catch {
      // Keep the deterministic browser timeline as a graceful offline fallback.
    }
    decisionSteps.forEach((step, index) => {
      const timer = window.setTimeout(
        () => {
          setDecisionTrace((current) => [...current, step.id]);
          if (index === decisionSteps.length - 1) {
            setGenerating(false);
            setGenerated(true);
          }
        },
        (index + 1) * 550,
      );
      decisionTimers.current.push(timer);
    });
  };

  return (
    <AgentDetailLayout
      title="决策 Agent"
      subtitle="综合能耗、碳排放、安全风险和运维成本，输出综合最优方案"
      icon={<ShieldCheck size={22} />}
    >
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            { label: '设备风险', value: '中等', detail: '2号机组振动预警', icon: AlertTriangle },
            {
              label: '优化收益',
              value: selected.carbonReduction,
              detail: '来自当前选中方案',
              icon: Sparkles,
            },
            {
              label: '综合评分',
              value: `${selected.score} / 100`,
              detail: '安全优先后的多目标评分',
              icon: Gauge,
            },
            {
              label: '人工审批',
              value: confirmed ? '已通过' : '待确认',
              detail: '高风险操作必须人工确认',
              icon: ClipboardCheck,
            },
          ] satisfies Array<{ label: string; value: string; detail: string; icon: LucideIcon }>
        ).map(({ label, value, detail, icon: Icon }) => (
          <div key={label} className={cardClass}>
            <Icon className="text-(--color-primary)" size={19} />
            <div className="mt-3 text-(--color-muted) text-sm">{label}</div>
            <div className="mt-2 font-semibold text-xl">{value}</div>
            <div className="mt-1 text-(--color-muted) text-xs">{detail}</div>
          </div>
        ))}
      </section>
      <section className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">三类双碳措施候选</h2>
            <p className="mt-1 text-(--color-muted) text-sm">
              设备正常但能效偏低、设备轻度退化、新能源或储能运行场景分别进入对应措施。
            </p>
          </div>
          <GitBranch className="text-(--color-primary)" size={20} />
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {optimizationScenarios.map((scenario) => {
            const active = scenario.id === selectedScenario;
            return (
              <button
                type="button"
                key={scenario.id}
                onClick={() => setSelectedScenario(scenario.id)}
                className={`focus-ring text-left rounded-2xl border p-5 transition-colors ${active ? 'border-(--color-primary) bg-(--color-primary)/10' : 'border-(--color-border) bg-white/5 hover:border-(--color-primary)/40'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{scenario.title}</div>
                    <div className="mt-2 text-(--color-muted) text-xs leading-5">
                      {scenario.fit}
                    </div>
                  </div>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-xs">
                    {scenario.score} 分
                  </span>
                </div>
                <div className="mt-4 space-y-2 text-xs">
                  <div>
                    <span className="text-(--color-muted)">触发：</span>
                    {scenario.trigger}
                  </div>
                  <div>
                    <span className="text-(--color-muted)">措施：</span>
                    {scenario.action}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <div className={cardClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-lg">多目标方案对比</h2>
              <p className="mt-1 text-(--color-muted) text-sm">
                安全约束优先，随后比较能耗、减排和运维成本。
              </p>
            </div>
            <StatusPill tone={confirmed ? 'green' : generated ? 'blue' : 'amber'}>
              {confirmed ? '已确认' : generated ? '待确认' : '未生成'}
            </StatusPill>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-(--color-border) border-b text-(--color-muted) text-xs">
                <tr>
                  <th className="pb-3">方案</th>
                  <th className="pb-3">能耗收益</th>
                  <th className="pb-3">减排收益</th>
                  <th className="pb-3">安全风险</th>
                  <th className="pb-3">运维成本</th>
                  <th className="pb-3">评分</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--color-border)">
                {decisionComparison.map((row) => (
                  <tr
                    key={row.name}
                    className={row.name === selectedScenario ? 'bg-(--color-primary)/5' : ''}
                  >
                    <td className="py-3 font-medium">{row.name}</td>
                    <td className="py-3">{row.energy}</td>
                    <td className="py-3">{row.carbon}</td>
                    <td className="py-3">{row.safety}</td>
                    <td className="py-3">{row.cost}</td>
                    <td className="py-3 text-(--color-primary)">{row.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={generateDecision}
              disabled={generating}
              className="focus-ring inline-flex items-center gap-2 rounded-xl bg-(--color-primary) px-4 py-2.5 font-medium text-(--color-surface)"
            >
              <Sparkles size={16} />{' '}
              {generating ? '正在生成…' : generated ? '重新生成综合决策' : '生成综合决策'}
            </button>
            <button
              type="button"
              disabled={!generated}
              onClick={() => setConfirmed(true)}
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-(--color-border) px-4 py-2.5 font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCircle2 size={16} /> 人工确认方案
            </button>
          </div>
          {(generating || generated) && (
            <div
              className="mt-5 rounded-xl border border-sky-400/20 bg-sky-400/5 p-4"
              aria-live="polite"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-medium text-sm">综合决策生成过程</div>
                <span className="text-(--color-muted) text-xs">
                  {decisionTrace.length}/{decisionSteps.length} 个步骤
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {decisionSteps.map((step) => {
                  const completed = decisionTrace.includes(step.id);
                  const active =
                    generating &&
                    !completed &&
                    decisionTrace.length === decisionSteps.findIndex((item) => item.id === step.id);
                  return (
                    <div
                      key={step.id}
                      className={`rounded-lg border p-3 ${completed ? 'border-emerald-400/20 bg-emerald-400/5' : active ? 'border-sky-400/30 bg-sky-400/5' : 'border-(--color-border)'}`}
                    >
                      <div className="flex items-center gap-2 text-sm">
                        <span
                          className={`h-2 w-2 rounded-full ${completed ? 'bg-emerald-400' : active ? 'animate-pulse bg-sky-400' : 'bg-slate-500'}`}
                        />
                        <span className="font-medium">{step.title}</span>
                        <span className="ml-auto text-(--color-muted) text-xs">
                          {completed ? '已完成' : active ? '执行中' : '等待中'}
                        </span>
                      </div>
                      <div className="mt-1 pl-4 text-(--color-muted) text-xs">{step.detail}</div>
                    </div>
                  );
                })}
              </div>
              {generated && (
                <div className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3">
                  <div className="font-medium text-emerald-300 text-sm">综合决策已生成</div>
                  <p className="mt-2 text-(--color-muted) text-xs leading-5">
                    推荐「{selected.title}」：{selected.action}。预计减排 {selected.carbonReduction}
                    ，综合评分 {selected.score} 分；下一步等待值长人工确认，确认后才允许生成工单。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
        <div className={cardClass}>
          <h2 className="font-semibold text-lg">当前综合最优决策</h2>
          <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 size={18} /> 推荐方案
            </div>
            <div className="mt-3 font-semibold text-xl">{selected.title}</div>
            <p className="mt-3 text-(--color-muted) text-sm leading-6">{selected.action}。</p>
            <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-(--color-muted)">预计能耗收益</span>
                <div className="mt-1 font-medium">{selected.saving}</div>
              </div>
              <div>
                <span className="text-(--color-muted)">预计减排收益</span>
                <div className="mt-1 font-medium">{selected.carbonReduction}</div>
              </div>
              <div>
                <span className="text-(--color-muted)">安全风险</span>
                <div className="mt-1 font-medium">{selected.risk}</div>
              </div>
              <div>
                <span className="text-(--color-muted)">运维成本</span>
                <div className="mt-1 font-medium">{selected.cost}</div>
              </div>
            </div>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            {[
              ['决策依据', '设备风险、能耗基线、碳排因子、维护窗口和备件状态'],
              ['安全边界', '低置信度或高风险动作进入人工审批'],
              ['后续动作', confirmed ? '已确认，后续可生成工单' : '等待值长确认后生成工单'],
            ].map(([label, detail]) => (
              <div key={label} className="rounded-xl border border-(--color-border) p-3">
                <div className="font-medium text-xs">{label}</div>
                <div className="mt-1 text-(--color-muted) text-xs leading-5">{detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-4 text-(--color-muted) text-xs leading-5">
        <div className="flex items-center gap-2 font-medium text-sky-300">
          <ArrowRight size={15} /> 决策链路说明
        </div>
        <p className="mt-2">
          碳排放减少不是直接结论，而是由候选措施改变运行参数、维护时机或新能源消纳方式后，再由双碳分析节点测算得到，最后由决策
          Agent 综合比较输出。
        </p>
      </section>
    </AgentDetailLayout>
  );
}
