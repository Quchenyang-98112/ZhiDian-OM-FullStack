import {
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  Database,
  FileText,
  type LucideIcon,
  MonitorCog,
  Palette,
  PlugZap,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/layout/PageHeader';
import {
  getPlantDataApiUrl,
  getPlantDataMode,
  type PlantDataMode,
  setPlantDataApiUrl,
  setPlantDataMode,
} from '../lib/power-plant-data-provider';
import { saveAIKey, setActiveProvider, type AIProvider } from '../lib/ai-keys';
import { backendApi, syncLlmConfigToBackend, type BackendLlmConfig } from '../lib/zhidian-api';

const cardClass = 'glass-panel rounded-2xl p-5';
const linkClass =
  'flex items-center gap-3 rounded-xl border border-(--color-border) bg-white/5 p-4 transition-colors hover:border-(--color-primary)/40 hover:bg-(--color-primary)/5';

function ChinesePage({
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
      <PageHeader title={title} subtitle={subtitle} icon={icon} />
      {children}
    </div>
  );
}

export function ChineseSettingsPage() {
  const [dataMode, setDataMode] = useState<PlantDataMode>(getPlantDataMode());
  const [apiUrl, setApiUrl] = useState(getPlantDataApiUrl());
  const [saved, setSaved] = useState(false);
  const [scenario, setScenario] = useState('正常运行');

  useEffect(() => {
    void backendApi
      .get<{ scenario: string }>('/api/simulation/scenario')
      .then((payload) => setScenario(payload.scenario))
      .catch(() => undefined);
  }, []);

  const saveDataSource = () => {
    setPlantDataMode(dataMode);
    setPlantDataApiUrl(apiUrl);
    setSaved(true);
  };

  return (
    <ChinesePage
      title="系统设置"
      subtitle="平台显示、数据接入与运行安全配置"
      icon={<Settings2 size={22} />}
    >
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Link className={linkClass} to="/settings/ai">
          <BrainCircuit className="text-(--color-primary)" />
          <span>
            <strong className="block">模型与接口</strong>
            <small className="text-(--color-muted)">配置可调用的大模型服务</small>
          </span>
        </Link>
        <Link className={linkClass} to="/settings/hardware">
          <PlugZap className="text-(--color-primary)" />
          <span>
            <strong className="block">设备目录</strong>
            <small className="text-(--color-muted)">管理 DCS、SCADA 与传感器</small>
          </span>
        </Link>
        <Link className={linkClass} to="/help">
          <BookOpen className="text-(--color-primary)" />
          <span>
            <strong className="block">帮助中心</strong>
            <small className="text-(--color-muted)">查看平台操作与安全说明</small>
          </span>
        </Link>
      </section>
      <section className={cardClass}>
        <h2 className="font-semibold text-lg">平台运行策略</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {[
            [
              '数据运行模式',
              dataMode === 'backend' ? 'FastAPI 仿真服务' : '浏览器本地数据',
              '当前不会控制真实设备',
            ],
            ['数据刷新周期', '2 秒', '适用于实时监测演示'],
            ['安全策略', '只读优先', '控制指令默认需要确认'],
          ].map(([label, value, detail]) => (
            <div key={label} className="rounded-xl border border-(--color-border) bg-white/5 p-4">
              <div className="text-(--color-muted) text-xs">{label}</div>
              <div className="mt-2 font-semibold">{value}</div>
              <div className="mt-1 text-(--color-muted) text-xs">{detail}</div>
            </div>
          ))}
        </div>
      </section>
      <section className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">电厂数据连接</h2>
            <p className="mt-1 text-(--color-muted) text-sm">
              页面通过统一适配层连接本地数据或后端电厂数据服务。
            </p>
          </div>
          <Database className="text-(--color-primary)" size={20} />
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            数据来源
            <select
              value={dataMode}
              onChange={(event) => setDataMode(event.target.value as PlantDataMode)}
              className="mt-2 w-full rounded-xl border border-(--color-border) bg-white/5 p-3"
            >
              <option value="local">本地数据适配器</option>
              <option value="backend">后端数据服务</option>
            </select>
          </label>
          <label className="text-sm">
            后端服务地址
            <input
              value={apiUrl}
              onChange={(event) => setApiUrl(event.target.value)}
              placeholder="例如：http://127.0.0.1:8000"
              className="mt-2 w-full rounded-xl border border-(--color-border) bg-white/5 p-3"
            />
          </label>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={saveDataSource}
            className="focus-ring rounded-xl bg-(--color-primary) px-4 py-2 font-medium text-(--color-surface)"
          >
            保存数据连接
          </button>
          {saved && (
            <span className="text-emerald-300 text-sm">已保存，刷新页面后应用新的数据源</span>
          )}
        </div>
      </section>
      <section className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">仿真场景切换</h2>
            <p className="mt-1 text-(--color-muted) text-sm">
              用于联调监控、诊断、决策和双碳页面；切换后所有设备与测点保持同一数据源。
            </p>
          </div>
          <span className="rounded-full bg-amber-400/10 px-3 py-1 text-amber-300 text-xs">仅仿真</span>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <select
            value={scenario}
            onChange={(event) => {
              const next = event.target.value;
              setScenario(next);
              void backendApi
                .send('/api/simulation/scenario', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ scenario: next }),
                })
                .then(() => setSaved(true))
                .catch(() => setSaved(false));
            }}
            className="rounded-xl border border-(--color-border) bg-white/5 p-3"
          >
            <option>正常运行</option>
            <option>能效偏低</option>
            <option>设备轻度退化</option>
            <option>新能源消纳</option>
          </select>
          <span className="text-(--color-muted) text-sm">当前场景：{scenario}</span>
        </div>
      </section>
    </ChinesePage>
  );
}

export function ChineseAiSettingsPage() {
  const [saved, setSaved] = useState(false);
  const [provider, setProvider] = useState('openai');
  const [model, setModel] = useState('gpt-4o-mini');
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [apiKey, setApiKey] = useState('');
  const [backendStatus, setBackendStatus] = useState<BackendLlmConfig | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void backendApi
      .get<BackendLlmConfig>('/api/llm/config')
      .then(setBackendStatus)
      .catch(() => setBackendStatus(null));
  }, []);

  const saveLlmConfig = async () => {
    if (!apiKey.trim() || !model.trim() || !baseUrl.trim()) return;
    setSaving(true);
    try {
      const supportedProvider = provider as AIProvider;
      await saveAIKey(supportedProvider, apiKey, model, baseUrl);
      setActiveProvider(supportedProvider);
      const result = await syncLlmConfigToBackend({ provider, model, baseUrl, apiKey });
      setBackendStatus(result);
      setApiKey('');
      setSaved(true);
    } catch {
      setSaved(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ChinesePage
      title="模型与接口"
      subtitle="为诊断 Agent 与决策 Agent 预留可配置的大模型接口"
      icon={<BrainCircuit size={22} />}
    >
      <section className={cardClass}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">大模型服务配置</h2>
            <p className="mt-1 text-(--color-muted) text-sm">
              密钥在前端以 AES-GCM 加密保存；保存时仅发送到本机 FastAPI 进程内存，用于当前 Agent 调用，不写入后端文件。
            </p>
          </div>
          <ShieldCheck className="shrink-0 text-emerald-300" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            服务商
            <select
              className="mt-2 w-full rounded-xl border border-(--color-border) bg-white/5 p-3"
              value={provider}
              onChange={(event) => setProvider(event.target.value)}
            >
              <option value="openai">OpenAI / OpenAI 兼容接口</option>
              <option value="ollama">Ollama 本地模型接口</option>
              <option value="custom">自定义接口</option>
            </select>
          </label>
          <label className="text-sm">
            模型名称
            <input
              className="mt-2 w-full rounded-xl border border-(--color-border) bg-white/5 p-3"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
          </label>
          <label className="text-sm md:col-span-2">
            接口地址
            <input
              className="mt-2 w-full rounded-xl border border-(--color-border) bg-white/5 p-3"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.example.com/v1"
            />
          </label>
          <label className="text-sm md:col-span-2">
            API 密钥
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="mt-2 w-full rounded-xl border border-(--color-border) bg-white/5 p-3"
              placeholder="输入后将加密保存"
            />
          </label>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void saveLlmConfig()}
            disabled={saving || !apiKey.trim()}
            className="focus-ring inline-flex items-center gap-2 rounded-xl bg-(--color-primary) px-4 py-2 font-medium text-(--color-surface)"
          >
            <Save size={16} />
            {saving ? '正在连接…' : '保存并连接后端'}
          </button>
          {saved && (
            <span className="inline-flex items-center gap-1 text-emerald-300 text-sm">
              <CheckCircle2 size={16} />
              已保存到本地
            </span>
          )}
        </div>
        <div className="mt-4 text-(--color-muted) text-xs">
          {backendStatus?.configured
            ? `后端已连接：${backendStatus.provider} / ${backendStatus.model}，密钥 ${backendStatus.apiKeyMasked}`
            : '后端尚未配置。密钥只在当前 FastAPI 进程内存中使用，重启后需要重新配置。'}
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {(
          [
            { name: '监控 Agent', detail: '接收 DCS、SCADA 测点，识别异常变化', icon: MonitorCog },
            { name: '诊断 Agent', detail: '结合知识库检索定位故障原因', icon: Database },
            {
              name: '决策 Agent',
              detail: '综合碳排与消纳约束给出处置建议',
              icon: SlidersHorizontal,
            },
          ] satisfies Array<{ name: string; detail: string; icon: LucideIcon }>
        ).map(({ name, detail, icon: Icon }) => (
          <div key={String(name)} className={cardClass}>
            <Icon className="text-(--color-primary)" />
            <h3 className="mt-3 font-semibold">{name}</h3>
            <p className="mt-2 text-(--color-muted) text-sm">{detail}</p>
          </div>
        ))}
      </section>
    </ChinesePage>
  );
}

export function ChineseHardwarePage() {
  return (
    <ChinesePage
      title="设备目录"
      subtitle="火力发电厂设备层级与测点数据源管理"
      icon={<PlugZap size={22} />}
    >
      <section className="grid gap-4 md:grid-cols-2">
        {[
          ['DCS 实时数据源', '2,486 个测点', '在线'],
          ['SCADA 设备数据', '842 个设备信号', '在线'],
          ['SIS 历史数据', '近 30 天数据', '可查询'],
          ['现场传感器', '振动、温度、压力', '在线'],
        ].map(([name, value, status]) => (
          <div key={name} className={cardClass}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{name}</h2>
              <span className="text-emerald-300 text-xs">{status}</span>
            </div>
            <p className="mt-3 text-(--color-muted) text-sm">{value}</p>
          </div>
        ))}
      </section>
      <section className={cardClass}>
        <h2 className="font-semibold text-lg">设备层级</h2>
        <p className="mt-3 text-(--color-muted) text-sm">
          厂级 → 机组级 → 系统级 → 设备级 → 测点级
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-(--color-border) p-4">
            1号超临界燃煤机组 · 600 MW
          </div>
          <div className="rounded-xl border border-(--color-border) p-4">
            2号超临界燃煤机组 · 600 MW
          </div>
        </div>
      </section>
    </ChinesePage>
  );
}

export function ChinesePluginsPage() {
  return (
    <ChinesePage
      title="扩展插件"
      subtitle="管理数据接入、知识检索和平台扩展能力"
      icon={<PuzzleIcon />}
    >
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ['知识库检索', '规程、手册、历史案例'],
          ['报告生成', '运行、诊断、降碳报告'],
          ['接口扩展', '为后端数据服务预留'],
        ].map(([name, detail]) => (
          <div key={name} className={cardClass}>
            <FileText className="text-(--color-primary)" />
            <h2 className="mt-3 font-semibold">{name}</h2>
            <p className="mt-2 text-(--color-muted) text-sm">{detail}</p>
            <span className="mt-4 inline-block text-emerald-300 text-xs">已启用</span>
          </div>
        ))}
      </section>
    </ChinesePage>
  );
}

function PuzzleIcon() {
  return <Palette size={22} />;
}

export function ChineseHelpPage() {
  return (
    <ChinesePage
      title="帮助中心"
      subtitle="智电运维平台操作说明与项目能力介绍"
      icon={<BookOpen size={22} />}
    >
      <section className="grid gap-4 md:grid-cols-2">
        {[
          ['平台定位', '面向火力发电厂的电力数据智能监测与运维决策平台。'],
          [
            '三 Agent 协同',
            '监控 Agent 发现异常，诊断 Agent 检索知识并定位原因，决策 Agent 形成处置建议。',
          ],
          ['双碳分析', '通过碳减排量化和能源消纳能力分析，展示机组节能降碳与灵活调峰价值。'],
          [
            '安全说明',
            '当前使用本地数据，不连接真实硬件；后续接入后端时仍建议保持只读和人工确认。',
          ],
        ].map(([title, detail]) => (
          <article key={title} className={cardClass}>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-3 text-(--color-muted) text-sm leading-6">{detail}</p>
          </article>
        ))}
      </section>
    </ChinesePage>
  );
}

export function ChineseTariffsPage() {
  return (
    <ChinesePage
      title="电价与成本"
      subtitle="保留的成本分析入口，后续可接入电网侧价格数据"
      icon={<FileText size={22} />}
    >
      <section className="grid gap-4 md:grid-cols-3">
        {[
          ['当前电价', '待接入'],
          ['峰谷策略', '待配置'],
          ['成本分析', '前端演示'],
        ].map(([label, value]) => (
          <div key={label} className={cardClass}>
            <div className="text-(--color-muted) text-sm">{label}</div>
            <div className="mt-3 font-semibold text-2xl">{value}</div>
          </div>
        ))}
      </section>
      <div className={cardClass}>
        <h2 className="font-semibold">说明</h2>
        <p className="mt-3 text-(--color-muted) text-sm">
          本页面已从家庭能源电价场景调整为电厂成本分析预留入口，不影响双碳主题演示。
        </p>
      </div>
    </ChinesePage>
  );
}
