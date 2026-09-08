import {
  Activity,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  GitBranch,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import { optimizationScenarios, powerPlantAlarms } from '../lib/power-plant-data';

const agents = [
  {
    name: '监控 Agent',
    role: '实时感知与异常发现',
    icon: Activity,
    status: '运行中',
    color: 'text-sky-300',
    input: 'DCS / SCADA / SIS / 传感器',
    output: '标准化异常事件',
    path: '/agent-collaboration/monitoring',
  },
  {
    name: '诊断 Agent',
    role: '故障分析与知识检索',
    icon: BrainCircuit,
    status: '运行中',
    color: 'text-violet-300',
    input: '异常事件 / 时频特征',
    output: '故障原因与置信度',
    path: '/agent-collaboration/diagnosis',
  },
  {
    name: '决策 Agent',
    role: '风险评估与处置建议',
    icon: ShieldCheck,
    status: '待确认',
    color: 'text-emerald-300',
    input: '诊断结论 / 运行约束',
    output: '分级处置方案',
    path: '/agent-collaboration/decision',
  },
];

export default function AgentCollaboration() {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Agent 协同中心"
        subtitle="监控、诊断、决策三类 Agent 的闭环协同"
        icon={<Sparkles size={22} />}
        actions={
          <span className="rounded-full border border-(--color-border) px-3 py-1 text-(--color-muted) text-xs">
            当前任务：2号机组振动预警
          </span>
        }
      />
      <section className="grid gap-4 lg:grid-cols-3">
        {agents.map(({ name, role, icon: Icon, status, color, input, output, path }, index) => (
          <div key={name} className="relative">
            {index < agents.length - 1 && (
              <ArrowRight
                className="absolute -right-5 top-1/2 z-10 hidden text-(--color-muted) lg:block"
                size={22}
              />
            )}
            <Link
              to={path}
              className="focus-ring block h-full glass-panel rounded-2xl p-5 transition-colors hover:border-(--color-primary)/40 hover:bg-(--color-primary)/5"
            >
              <div className="flex items-start justify-between">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 ${color}`}
                >
                  <Icon size={22} />
                </div>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-emerald-300 text-xs">
                  {status}
                </span>
              </div>
              <h2 className="mt-5 font-semibold text-lg">{name}</h2>
              <p className="mt-1 text-(--color-muted) text-sm">{role}</p>
              <div className="mt-5 space-y-3 text-xs">
                <div>
                  <span className="text-(--color-muted)">输入</span>
                  <p className="mt-1">{input}</p>
                </div>
                <div>
                  <span className="text-(--color-muted)">输出</span>
                  <p className="mt-1">{output}</p>
                </div>
              </div>
              <div className="mt-5 flex items-center gap-2 text-(--color-primary) text-xs">
                进入 Agent 子页面 <ArrowRight size={14} />
              </div>
            </Link>
          </div>
        ))}
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <div className="glass-panel rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-lg">协同事件流</h2>
              <p className="mt-1 text-(--color-muted) text-sm">
                异常事件从发现到处置建议的可追踪过程
              </p>
            </div>
            <Clock3 size={18} className="text-(--color-muted)" />
          </div>
          <div className="mt-6 space-y-5">
            {[
              [
                '10:42:18',
                '监控 Agent',
                '识别 2号机组汽轮机高压缸轴承振动异常',
                '已完成',
                '/agent-collaboration/monitoring',
              ],
              [
                '10:42:21',
                '诊断 Agent',
                '检索 12 条相关规程与历史案例，形成初步诊断',
                '已完成',
                '/agent-collaboration/diagnosis',
              ],
              [
                '10:42:24',
                '决策 Agent',
                '生成分级处置建议，等待值长确认',
                '待确认',
                '/agent-collaboration/decision',
              ],
            ].map(([time, agent, text, status, path]) => (
              <Link
                to={path}
                key={time}
                className="focus-ring flex gap-4 rounded-xl p-2 transition-colors hover:bg-white/5"
              >
                <div className="w-16 shrink-0 pt-1 text-(--color-muted) text-xs">{time}</div>
                <div className="relative flex-1 border-(--color-border) border-l pb-2 pl-5">
                  <span className="absolute -left-1.5 top-0 h-3 w-3 rounded-full bg-(--color-primary)" />
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{agent}</span>
                    <span className="text-(--color-muted) text-xs">{status}</span>
                  </div>
                  <p className="mt-1 text-(--color-muted) text-sm">{text}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <h2 className="font-semibold text-lg">当前异常上下文</h2>
          <div className="mt-5 space-y-3">
            {powerPlantAlarms.slice(0, 2).map((alarm) => (
              <div
                key={alarm.id}
                className="rounded-xl border border-(--color-border) bg-white/5 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{alarm.device}</span>
                  <span className="text-amber-300 text-xs">{alarm.level}</span>
                </div>
                <p className="mt-2 text-(--color-muted) text-xs">
                  {alarm.metric}：{alarm.value} · {alarm.time}
                </p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setConfirmed(true)}
            className="focus-ring mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-(--color-text) px-4 py-2.5 font-semibold text-(--color-background) text-sm"
          >
            <CheckCircle2 size={16} />
            {confirmed ? '建议已确认' : '确认决策建议'}
          </button>
          {confirmed && (
            <p className="mt-3 text-center text-emerald-300 text-xs">
              仅更新前端状态，未发送真实控制指令。
            </p>
          )}
        </div>
      </section>
      <section className="glass-panel rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">双碳协同决策链</h2>
            <p className="mt-1 text-(--color-muted) text-sm">
              监控结果先判断是否存在优化需求，再进入三类减排措施的场景推演。
            </p>
          </div>
          <GitBranch className="text-(--color-primary)" size={20} />
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-5">
          {[
            ['运行上下文', '设备、测点、负荷与碳因子', 'bg-sky-400/10 text-sky-300'],
            ['监控 Agent', '识别健康、退化或异常', 'bg-violet-400/10 text-violet-300'],
            ['优化需求判断', '判断是否需要双碳优化', 'bg-amber-400/10 text-amber-300'],
            ['三类措施推演', '参数、时机、碳感知运行', 'bg-emerald-400/10 text-emerald-300'],
            ['决策 Agent', '多目标综合最优方案', 'bg-cyan-400/10 text-cyan-300'],
          ].map(([title, detail, color], index) => (
            <div key={title} className="relative">
              {index < 4 && (
                <ArrowRight
                  className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-(--color-muted) md:block"
                  size={16}
                />
              )}
              <div className={`h-full rounded-xl border border-(--color-border) p-4 ${color}`}>
                <div className="font-medium text-sm">{title}</div>
                <div className="mt-2 text-(--color-muted) text-xs leading-5">{detail}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {optimizationScenarios.map((scenario) => (
            <Link
              key={scenario.id}
              to="/agent-collaboration/decision"
              className="focus-ring rounded-xl border border-(--color-border) bg-white/5 p-4 transition-colors hover:border-(--color-primary)/40 hover:bg-(--color-primary)/5"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-sm">{scenario.title}</span>
                <span className="text-(--color-primary) text-xs">评分 {scenario.score}</span>
              </div>
              <p className="mt-2 text-(--color-muted) text-xs leading-5">{scenario.fit}</p>
              <div className="mt-3 text-xs">
                <span className="text-(--color-muted)">预计收益：</span>
                {scenario.carbonReduction}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
