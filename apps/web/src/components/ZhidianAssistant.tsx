import { Bot, ChevronDown, Send, Sparkles, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { backendApi } from '../lib/zhidian-api';

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

type PlantContext = {
  plant?: { name?: string; carbonFactor?: number };
  metrics?: {
    totalOutputMw?: number;
    co2Tph?: number;
    carbonIntensity?: number;
    renewableAbsorptionRate?: number;
    renewableAbsorptionSpaceMw?: number;
  };
  alarms?: Array<{ unit?: string; device?: string; metric?: string; value?: string; level?: string }>;
};

const initialMessage: ChatMessage = {
  role: 'assistant',
  content: '你好，我是智电助手。你可以询问当前设备状态、异常原因、检修时机、碳排放或新能源消纳建议。',
};

function summarizeContext(snapshot: PlantContext): string {
  const metrics = snapshot.metrics ?? {};
  const alarms = (snapshot.alarms ?? [])
    .slice(0, 5)
    .map((alarm) => `${alarm.unit ?? ''}${alarm.device ?? ''}：${alarm.metric ?? ''} ${alarm.value ?? ''}（${alarm.level ?? ''}）`)
    .join('；');
  return [
    `电厂：${snapshot.plant?.name ?? '示范火力发电厂'}`,
    `总出力：${metrics.totalOutputMw ?? '--'} MW`,
    `当前碳排放：${metrics.co2Tph ?? '--'} t/h`,
    `碳排放强度：${metrics.carbonIntensity ?? '--'} tCO₂e/MWh`,
    `新能源消纳率：${metrics.renewableAbsorptionRate ?? '--'}%`,
    `新能源消纳空间：${metrics.renewableAbsorptionSpaceMw ?? '--'} MW`,
    `当前告警：${alarms || '暂无告警'}`,
  ].join('\n');
}

export function ZhidianAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([initialMessage]);
  const [streaming, setStreaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sendMessage = async (preset?: string) => {
    const content = (preset ?? input).trim();
    if (!content || streaming) return;
    setInput('');
    setOpen(true);
    setStreaming(true);
    const userMessage: ChatMessage = { role: 'user', content };
    const assistantIndex = messages.length + 1;
    setMessages((current) => [...current, userMessage, { role: 'assistant', content: '' }]);
    try {
      const snapshot = await backendApi.get<PlantContext>('/api/plant/overview');
      const context = summarizeContext(snapshot);
      const history = [...messages, userMessage].slice(-8).map((message) => ({
        role: message.role,
        content: message.content,
      }));
      const response = await fetch('/api/llm/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          temperature: 0.2,
          maxTokens: 1000,
          messages: [
            {
              role: 'system',
              content: `你是“智电运维”平台的现场 AI 助手。请只用简体中文自然语言回答，禁止输出 JSON、代码块或字段名。只基于提供的电厂上下文回答；涉及安全、检修和控制操作时，必须提示人工确认，不得声称已经执行操作。\n\n当前电厂上下文：\n${context}`,
            },
            ...history,
          ],
        }),
      });
      if (!response.ok || !response.body) throw new Error('流式接口不可用，请检查 FastAPI 服务和 LLM 配置。');
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
          const eventType = event.split('\n').find((line) => line.startsWith('event: '))?.slice(7);
          const payload = JSON.parse(dataLine.slice(6)) as { text?: string; message?: string };
          const text = eventType === 'token' ? payload.text : eventType === 'error' ? payload.message : '';
          if (text) {
            setMessages((current) =>
              current.map((message, index) =>
                index === assistantIndex ? { ...message, content: `${message.content}${text}` } : message,
              ),
            );
          }
        }
        if (done) break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 助手暂时无法回答。';
      setMessages((current) =>
        current.map((item, index) =>
          index === assistantIndex ? { ...item, content: `暂时无法完成回答：${message}` } : item,
        ),
      );
    } finally {
      setStreaming(false);
    }
  };

  return (
    <>
      {open && (
        <section
          className="fixed right-4 bottom-24 z-70 flex h-[min(600px,calc(100dvh-8rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-surface-strong) shadow-2xl"
          aria-label="智电助手对话窗口"
        >
          <header className="flex items-center justify-between border-(--color-border) border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-(--color-primary)/15 p-2 text-(--color-primary)">
                <Bot size={19} aria-hidden="true" />
              </div>
              <div>
                <div className="font-semibold text-sm">智电助手</div>
                <div className="text-(--color-muted) text-xs">设备、检修与双碳问答</div>
              </div>
            </div>
            <button type="button" className="focus-ring rounded-lg p-1.5" onClick={() => setOpen(false)} aria-label="关闭智电助手">
              <X size={17} />
            </button>
          </header>
          <div className="flex-1 space-y-3 overflow-y-auto p-3" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6 ${message.role === 'user' ? 'bg-(--color-primary) text-(--color-surface)' : 'bg-white/8 text-(--color-text)'}`}>
                  {message.content || (streaming && index === messages.length - 1 ? '正在分析当前电厂数据…' : '')}
                </div>
              </div>
            ))}
          </div>
          <div className="border-(--color-border) border-t p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {['当前有哪些异常？', '给出检修建议', '当前碳排放如何？'].map((question) => (
                <button
                  type="button"
                  key={question}
                  onClick={() => void sendMessage(question)}
                  disabled={streaming}
                  className="focus-ring rounded-full border border-(--color-border) px-2.5 py-1 text-(--color-muted) text-xs hover:text-(--color-text) disabled:opacity-50"
                >
                  {question}
                </button>
              ))}
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void sendMessage();
              }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="询问设备状态、检修或碳排放…"
                className="focus-ring min-w-0 flex-1 rounded-xl border border-(--color-border) bg-white/5 px-3 py-2 text-sm outline-none"
                disabled={streaming}
              />
              <button type="submit" className="focus-ring rounded-xl bg-(--color-primary) p-2.5 text-(--color-surface) disabled:opacity-50" disabled={streaming || !input.trim()} aria-label="发送问题">
                <Send size={16} />
              </button>
            </form>
          </div>
        </section>
      )}
      <button
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          window.setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="focus-ring fixed right-5 bottom-5 z-70 flex h-14 w-14 items-center justify-center rounded-full border border-(--color-primary)/50 bg-(--color-primary) text-(--color-surface) shadow-xl shadow-(--color-primary)/20 transition-transform hover:scale-105"
        aria-label={open ? '收起智电助手' : '打开智电助手'}
        title="智电助手"
      >
        {open ? <ChevronDown size={22} /> : <Sparkles size={22} />}
      </button>
    </>
  );
}
