import { ArrowDownRight, Factory, Leaf, TrendingDown } from 'lucide-react';
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
  optimizationScenarios,
  plantMetrics,
  powerPlant,
  trendData,
} from '../lib/power-plant-data';

const cards = [
  {
    label: '今日碳排放量',
    value: `${plantMetrics.todayCo2T.toLocaleString()} t`,
    detail: '较基准工况下降 2.8%',
    icon: Factory,
  },
  {
    label: '今日减排量',
    value: `${plantMetrics.todayReductionT} t`,
    detail: '运行优化与灵活调峰贡献',
    icon: Leaf,
  },
  {
    label: '单位发电量碳排放',
    value: '0.684 t/MWh',
    detail: '较上月下降 4.6%',
    icon: TrendingDown,
  },
  { label: '供电煤耗', value: '286.4 g/kWh', detail: '目标值 292.0 g/kWh', icon: ArrowDownRight },
];

export default function CarbonReductionPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="碳减排量化"
        subtitle={`${powerPlant.name} · 节能降碳与减排贡献分析`}
        icon={<Leaf size={22} />}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <article key={label} className="glass-panel rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between text-(--color-muted)">
              <span className="text-sm">{label}</span>
              <Icon size={18} className="text-(--color-primary)" />
            </div>
            <div className="fluid-text-2xl font-semibold tracking-tight">{value}</div>
            <p className="mt-2 text-(--color-muted) text-xs">{detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="glass-panel rounded-2xl p-5">
          <div className="mb-5">
            <h2 className="font-semibold text-lg">碳排放与减排趋势</h2>
            <p className="mt-1 text-(--color-muted) text-sm">
              按运行工况、机组效率和调峰贡献进行量化
            </p>
          </div>
          <div className="h-64" role="img" aria-label="碳排放量与新能源替代贡献趋势图">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={trendData}
                barGap={2}
                margin={{ top: 26, right: 8, left: 0, bottom: 0 }}
              >
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.35} />
                <XAxis
                  dataKey="time"
                  stroke="var(--color-muted)"
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                />
                <YAxis
                  domain={[0, 800]}
                  ticks={[0, 200, 400, 600, 800]}
                  stroke="var(--color-muted)"
                  tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
                  width={42}
                  label={{
                    value: 'tCO₂',
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'var(--color-muted)',
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  formatter={(value, name) => [
                    `${value} t`,
                    name === 'co2' ? '碳排放量' : '新能源替代贡献',
                  ]}
                  contentStyle={{
                    background: 'var(--color-surface-strong)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    fontSize: '11px',
                    color: 'var(--color-text)',
                  }}
                />
                <Bar
                  dataKey="co2"
                  fill="var(--color-primary)"
                  radius={[4, 4, 0, 0]}
                  name="碳排放量"
                >
                  <LabelList dataKey="co2" position="top" fill="var(--color-text)" fontSize={9} />
                </Bar>
                <Bar
                  dataKey="renewable"
                  fill="#34d399"
                  radius={[4, 4, 0, 0]}
                  name="新能源替代贡献"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex gap-5 text-xs">
            <span>
              <i className="mr-2 inline-block h-2 w-2 rounded-full bg-(--color-primary)" />
              碳排放量
            </span>
            <span>
              <i className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />
              新能源替代贡献
            </span>
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="font-semibold text-lg">减排贡献拆解</h2>
          <div className="mt-5 space-y-5">
            {[
              ['运行效率提升', 42, '162.3 t'],
              ['灵活调峰支撑', 35, '135.2 t'],
              ['异常运维优化', 23, '88.9 t'],
            ].map(([label, percent, value]) => (
              <div key={String(label)}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{label}</span>
                  <span className="text-(--color-primary)">{value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-(--color-primary)"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 rounded-xl border border-(--color-border) bg-white/5 p-3 text-(--color-muted) text-xs">
            计算说明：减排量由供电煤耗变化、设备效率提升和灵活调峰形成的新能源替代量综合估算，后续可替换为企业核算口径。
          </p>
        </div>
      </section>
      <section className="glass-panel rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">措施驱动的减排场景</h2>
            <p className="mt-1 text-(--color-muted) text-sm">
              减排量由具体运行措施改变能耗、维护时机或新能源消纳方式后测算，不把减排结果作为无来源的直接结论。
            </p>
          </div>
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-300 text-xs">
            基于方案推演
          </span>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {optimizationScenarios.map((scenario) => (
            <article
              key={scenario.id}
              className="rounded-2xl border border-(--color-border) bg-white/5 p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{scenario.title}</h3>
                <span className="text-(--color-primary) text-xs">评分 {scenario.score}</span>
              </div>
              <p className="mt-2 text-(--color-muted) text-xs leading-5">{scenario.fit}</p>
              <div className="mt-4 space-y-2 text-xs">
                <div>
                  <span className="text-(--color-muted)">预计能耗收益：</span>
                  {scenario.saving}
                </div>
                <div>
                  <span className="text-(--color-muted)">预计减排收益：</span>
                  {scenario.carbonReduction}
                </div>
                <div>
                  <span className="text-(--color-muted)">安全 / 成本：</span>
                  {scenario.risk} / {scenario.cost}
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="mt-5 rounded-xl border border-(--color-border) bg-white/5 p-3 text-(--color-muted) text-xs leading-5">
          核算链路：基础能耗与碳排基线 → 措施执行后的能耗预测 → 碳排放变化 →
          减排量、减排率与单位发电量碳强度 → 决策 Agent 多目标比较。
        </p>
      </section>
    </div>
  );
}
