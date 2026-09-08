import { Activity, BatteryCharging, Gauge, Wind } from 'lucide-react';
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
  optimizationScenarios,
  plantMetrics,
  powerPlant,
  trendData,
} from '../lib/power-plant-data';

const indicators = [
  ['新能源消纳率', `${plantMetrics.renewableAbsorptionRate}%`, '较昨日 +2.4%', Gauge],
  ['可消纳新能源容量', `${plantMetrics.availableDownRegulationMw} MW`, '当前可下调容量', Wind],
  ['负荷匹配度', '87.6%', '未来 4 小时预测', Activity],
  ['调峰支撑贡献', '286 MW', '火电灵活性释放', BatteryCharging],
] as const;

export default function EnergyAbsorptionPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="能源消纳能力分析"
        subtitle={`${powerPlant.name} · 火电灵活性支撑新能源消纳`}
        icon={<Wind size={22} />}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {indicators.map(([label, value, detail, Icon]) => (
          <article key={label} className="glass-panel rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between text-(--color-muted)">
              <span className="text-sm">{label}</span>
              <Icon size={18} className="text-(--color-primary)" />
            </div>
            <div className="fluid-text-2xl font-semibold">{value}</div>
            <p className="mt-2 text-(--color-muted) text-xs">{detail}</p>
          </article>
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-lg">新能源出力与消纳空间</h2>
              <p className="mt-1 text-(--color-muted) text-sm">
                根据机组最低技术出力和负荷变化，评估可释放调节空间
              </p>
            </div>
            <span className="rounded-full bg-sky-400/10 px-2 py-1 text-sky-300 text-xs">
              单位：MW
            </span>
          </div>
          <div
            className="mt-6 h-64"
            role="img"
            aria-label="新能源出力与可消纳空间对比柱状图，单位为兆瓦"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={trendData}
                barGap={3}
                margin={{ top: 26, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.35} />
                <XAxis
                  dataKey="time"
                  stroke="var(--color-muted)"
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                />
                <YAxis
                  domain={[0, 400]}
                  ticks={[0, 100, 200, 300, 400]}
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
                  formatter={(value, name) => [
                    `${value} MW`,
                    name === 'renewable' ? '新能源出力' : '可消纳空间',
                  ]}
                  contentStyle={{
                    background: 'var(--color-surface-strong)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: 'var(--color-text)',
                  }}
                />
                <Bar dataKey="renewable" fill="#38bdf8" radius={[4, 4, 0, 0]} name="新能源出力" />
                <Bar
                  dataKey="absorptionSpace"
                  fill="var(--color-primary)"
                  radius={[4, 4, 0, 0]}
                  name="可消纳空间"
                >
                  <LabelList
                    dataKey="absorptionSpace"
                    position="top"
                    fill="var(--color-text)"
                    fontSize={9}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-5 text-xs">
            <span>
              <i className="mr-2 inline-block h-2 w-2 rounded-full bg-sky-400" />
              新能源出力
            </span>
            <span>
              <i className="mr-2 inline-block h-2 w-2 rounded-full bg-(--color-primary)" />
              可消纳空间
            </span>
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="font-semibold text-lg">机组调节能力</h2>
          <div className="mt-5 space-y-5">
            {generatingUnits.map((unit) => (
              <div key={unit.id}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{unit.name}</span>
                  <span className="text-(--color-primary)">{unit.adjustableDownMw} MW 可下调</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-(--color-primary)"
                    style={{ width: `${(unit.adjustableDownMw / 320) * 100}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-(--color-muted) text-xs">
                  <span>当前出力 {unit.outputMw} MW</span>
                  <span>最低出力 {unit.minTechnicalOutputMw} MW</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="glass-panel rounded-2xl p-5">
        <h2 className="font-semibold text-lg">分析结论与建议</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4">
            <div className="font-semibold text-emerald-300">当前能力：良好</div>
            <p className="mt-2 text-(--color-muted) text-sm">
              两台机组共可释放 {plantMetrics.availableDownRegulationMw} MW 下调空间。
            </p>
          </div>
          <div className="rounded-xl border border-(--color-border) bg-white/5 p-4">
            <div className="font-semibold">主要约束</div>
            <p className="mt-2 text-(--color-muted) text-sm">
              2号机组汽轮机振动预警限制深度调峰能力。
            </p>
          </div>
          <div className="rounded-xl border border-(--color-primary)/20 bg-(--color-primary)/10 p-4">
            <div className="font-semibold text-(--color-primary)">决策 Agent 建议</div>
            <p className="mt-2 text-(--color-muted) text-sm">
              优先完成2号机组振动诊断，再安排低负荷运行窗口。
            </p>
          </div>
        </div>
      </section>
      <section className="glass-panel rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">消纳策略联动</h2>
            <p className="mt-1 text-(--color-muted) text-sm">
              能源消纳分析结果将作为碳感知运行优化的输入，和设备健康状态共同进入决策 Agent。
            </p>
          </div>
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-300 text-xs">
            新能源 / 储能场景
          </span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {optimizationScenarios.map((scenario) => (
            <div
              key={scenario.id}
              className={`rounded-2xl border p-4 ${scenario.id === '碳感知运行优化' ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-(--color-border) bg-white/5'}`}
            >
              <div className="font-medium text-sm">{scenario.title}</div>
              <p className="mt-2 text-(--color-muted) text-xs leading-5">{scenario.trigger}</p>
              <div className="mt-3 text-xs">
                <span className="text-(--color-muted)">输出：</span>
                {scenario.projectedState}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
