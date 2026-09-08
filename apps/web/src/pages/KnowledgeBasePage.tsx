import {
  CheckCircle2,
  Database,
  FileText,
  Folder,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { backendApi, type BackendKnowledgeDocument } from '../lib/zhidian-api';

type KnowledgeStatus = '未解析' | '解析中' | '已解析' | '解析失败';

interface KnowledgeDocument {
  id: string;
  name: string;
  fileType: string;
  size: string;
  folder: string;
  system: string;
  status: KnowledgeStatus;
  chunks: number;
  updatedAt: string;
  source?: string;
}

const storageKey = 'zhidian-knowledge-base-documents';
const folderOptions = [
  '全部目录',
  '运行规程',
  '运行策略',
  '历史案例',
  '维护策略',
  '碳排放',
  '安全制度',
  '未分类',
];
const systemOptions = [
  '全部系统',
  '锅炉系统',
  '汽轮机系统',
  '给水系统',
  '风烟系统',
  '环保系统',
  '电气系统',
  '通用',
];

const initialDocuments: KnowledgeDocument[] = [
  {
    id: 'kb-turbine-rule',
    name: '汽轮机轴承振动规程.pdf',
    fileType: 'PDF',
    size: '2.4 MB',
    folder: '运行规程',
    system: '汽轮机系统',
    status: '已解析',
    chunks: 38,
    updatedAt: '2026-09-07 10:40',
  },
  {
    id: 'kb-lubrication-case',
    name: '历史故障案例-轴承润滑案例-2025.docx',
    fileType: 'DOCX',
    size: '1.1 MB',
    folder: '历史案例',
    system: '汽轮机系统',
    status: '已解析',
    chunks: 26,
    updatedAt: '2026-09-06 16:20',
  },
  {
    id: 'kb-maintenance-sop',
    name: '设备维护窗口与检修SOP.docx',
    fileType: 'DOCX',
    size: '860 KB',
    folder: '维护策略',
    system: '通用',
    status: '已解析',
    chunks: 19,
    updatedAt: '2026-09-05 14:08',
  },
  {
    id: 'kb-carbon-operation',
    name: '碳感知运行与新能源消纳策略.md',
    fileType: 'MD',
    size: '18 KB',
    folder: '运行规程',
    system: '通用',
    status: '未解析',
    chunks: 0,
    updatedAt: '2026-09-04 09:30',
  },
];

function readDocuments(): KnowledgeDocument[] {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return initialDocuments;
  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? (parsed as KnowledgeDocument[]) : initialDocuments;
  } catch {
    return initialDocuments;
  }
}

function getFileType(fileName: string): string {
  return fileName.split('.').pop()?.toUpperCase() || 'FILE';
}

function getFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusClass(status: KnowledgeStatus): string {
  if (status === '已解析') return 'bg-emerald-400/10 text-emerald-300';
  if (status === '解析中') return 'bg-sky-400/10 text-sky-300';
  if (status === '解析失败') return 'bg-rose-400/10 text-rose-300';
  return 'bg-amber-400/10 text-amber-300';
}

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>(readDocuments);
  const [backendConnected, setBackendConnected] = useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('全部目录');
  const [fileType, setFileType] = useState('全部类型');
  const [system, setSystem] = useState('全部系统');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [uploadFolder, setUploadFolder] = useState('未分类');
  const [uploadSystem, setUploadSystem] = useState('通用');

  useEffect(() => {
    let mounted = true;
    void backendApi
      .get<BackendKnowledgeDocument[]>('/api/knowledge/documents')
      .then((items) => {
        if (!mounted) return;
        setDocuments(items);
        setBackendConnected(true);
      })
      .catch(() => {
        if (mounted) setNotice('FastAPI 知识库暂不可用，当前使用浏览器本地索引。');
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!backendConnected) localStorage.setItem(storageKey, JSON.stringify(documents));
  }, [backendConnected, documents]);

  const fileTypes = useMemo(
    () => ['全部类型', ...Array.from(new Set(documents.map((document) => document.fileType)))],
    [documents],
  );

  const filteredDocuments = useMemo(
    () =>
      documents.filter((document) => {
        const matchesQuery = `${document.name} ${document.folder} ${document.system}`
          .toLowerCase()
          .includes(query.trim().toLowerCase());
        return (
          matchesQuery &&
          (folder === '全部目录' || document.folder === folder) &&
          (fileType === '全部类型' || document.fileType === fileType) &&
          (system === '全部系统' || document.system === system)
        );
      }),
    [documents, fileType, folder, query, system],
  );

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    if (backendConnected) {
      try {
        const uploaded = await Promise.all(
          files.map(async (file) => {
            const form = new FormData();
            form.append('file', file);
            form.append('folder', uploadFolder);
            form.append('system', uploadSystem);
            return backendApi.send<KnowledgeDocument>('/api/knowledge/documents', {
              method: 'POST',
              body: form,
            });
          }),
        );
        setDocuments((current) => [...uploaded, ...current]);
        setNotice(`已上传 ${uploaded.length} 份文档到后端知识库。`);
        event.target.value = '';
        return;
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '上传失败，已切换本地索引。');
      }
    }
    const now = new Date().toLocaleString('zh-CN', { hour12: false }).slice(0, 16);
    const newDocuments = files.map((file, index) => ({
      id: `kb-${Date.now()}-${index}`,
      name: file.name,
      fileType: getFileType(file.name),
      size: getFileSize(file.size),
      folder: uploadFolder,
      system: uploadSystem,
      status: '未解析' as const,
      chunks: 0,
      updatedAt: now,
    }));
    setDocuments((current) => [...newDocuments, ...current]);
    event.target.value = '';
  };

  const parseDocument = async (id: string) => {
    if (backendConnected) {
      setDocuments((current) =>
        current.map((document) =>
          document.id === id ? { ...document, status: '解析中' } : document,
        ),
      );
      try {
        const parsed = await backendApi.send<KnowledgeDocument>(
          `/api/knowledge/documents/${id}/parse`,
          { method: 'POST' },
        );
        setDocuments((current) => current.map((item) => (item.id === id ? parsed : item)));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '解析失败');
      }
      return;
    }
    setDocuments((current) =>
      current.map((document) =>
        document.id === id ? { ...document, status: '解析中' } : document,
      ),
    );
    window.setTimeout(() => {
      setDocuments((current) =>
        current.map((document) =>
          document.id === id
            ? { ...document, status: '已解析', chunks: Math.max(8, document.name.length * 2) }
            : document,
        ),
      );
    }, 900);
  };

  const saveRename = async (id: string) => {
    const nextName = editingName.trim();
    if (nextName) {
      if (backendConnected) {
        try {
          const renamed = await backendApi.send<KnowledgeDocument>(
            `/api/knowledge/documents/${id}`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: nextName }),
            },
          );
          setDocuments((current) => current.map((item) => (item.id === id ? renamed : item)));
          setEditingId(null);
          return;
        } catch (error) {
          setNotice(error instanceof Error ? error.message : '重命名失败');
        }
      }
      setDocuments((current) =>
        current.map((document) =>
          document.id === id ? { ...document, name: nextName } : document,
        ),
      );
    }
    setEditingId(null);
  };

  const deleteDocument = async (id: string) => {
    const document = documents.find((item) => item.id === id);
    if (!document || !window.confirm(`确定删除“${document.name}”吗？`)) return;
    if (backendConnected) {
      try {
        await backendApi.send(`/api/knowledge/documents/${id}`, { method: 'DELETE' });
        setDocuments((current) => current.filter((item) => item.id !== id));
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '删除失败');
      }
      return;
    }
    setDocuments((current) => current.filter((item) => item.id !== id));
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="本地知识库"
        subtitle="管理诊断规程、历史案例、维护策略和双碳运行资料，为 Agent 检索提供可追溯来源"
        icon={<Database size={22} />}
      />
      {notice && (
        <div className="rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3 text-sky-200 text-sm">
          {notice}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['文档总数', `${documents.length} 份`, '本地索引'],
          [
            '已解析',
            `${documents.filter((document) => document.status === '已解析').length} 份`,
            '可供 Agent 检索',
          ],
          [
            '待处理',
            `${documents.filter((document) => document.status !== '已解析').length} 份`,
            '需要解析或复核',
          ],
          [
            '检索分片',
            `${documents.reduce((sum, document) => sum + document.chunks, 0)} 个`,
            '已解析内容分片',
          ],
        ].map(([label, value, detail]) => (
          <div key={label} className="glass-panel rounded-2xl p-5">
            <div className="text-(--color-muted) text-sm">{label}</div>
            <div className="mt-3 font-semibold text-2xl">{value}</div>
            <div className="mt-2 text-(--color-muted) text-xs">{detail}</div>
          </div>
        ))}
      </section>

      <section className="glass-panel rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-lg">上传与归档</h2>
            <p className="mt-1 text-(--color-muted) text-sm">
              上传后先建立本地索引，再手动解析为 Agent 可检索内容。
            </p>
          </div>
          <label className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-xl bg-(--color-primary) px-4 py-2.5 font-medium text-(--color-surface) text-sm">
            <Upload size={16} /> 上传知识文件
            <input
              type="file"
              multiple
              className="sr-only"
              accept=".pdf,.doc,.docx,.md,.txt,.json"
              onChange={handleUpload}
            />
          </label>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="text-(--color-muted) text-xs">
            上传目录
            <select
              value={uploadFolder}
              onChange={(event) => setUploadFolder(event.target.value)}
              className="mt-2 w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2.5 text-(--color-text) text-sm"
            >
              {folderOptions
                .filter((option) => option !== '全部目录')
                .map((option) => (
                  <option key={option}>{option}</option>
                ))}
            </select>
          </label>
          <label className="text-(--color-muted) text-xs">
            所属设备系统
            <select
              value={uploadSystem}
              onChange={(event) => setUploadSystem(event.target.value)}
              className="mt-2 w-full rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2.5 text-(--color-text) text-sm"
            >
              {systemOptions
                .filter((option) => option !== '全部系统')
                .map((option) => (
                  <option key={option}>{option}</option>
                ))}
            </select>
          </label>
        </div>
      </section>

      <section className="glass-panel rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search
              className="absolute top-1/2 left-3 -translate-y-1/2 text-(--color-muted)"
              size={16}
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索文件名、目录或设备系统…"
              className="w-full rounded-xl border border-(--color-border) bg-(--color-surface) py-2.5 pr-3 pl-9 text-sm outline-none focus:border-(--color-primary)/50"
            />
          </div>
          <select
            value={folder}
            onChange={(event) => setFolder(event.target.value)}
            className="rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2.5 text-sm"
          >
            <option>全部目录</option>
            {folderOptions
              .filter((option) => option !== '全部目录')
              .map((option) => (
                <option key={option}>{option}</option>
              ))}
          </select>
          <select
            value={fileType}
            onChange={(event) => setFileType(event.target.value)}
            className="rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2.5 text-sm"
          >
            {fileTypes.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
          <select
            value={system}
            onChange={(event) => setSystem(event.target.value)}
            className="rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2.5 text-sm"
          >
            {systemOptions.map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </div>
        <div className="mt-5 space-y-3">
          {filteredDocuments.map((document) => (
            <article
              key={document.id}
              className="rounded-2xl border border-(--color-border) bg-white/5 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--color-primary)/10 text-(--color-primary)">
                    <FileText size={19} />
                  </div>
                  <div className="min-w-0">
                    {editingId === document.id ? (
                      <div className="flex flex-wrap gap-2">
                        <input
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => event.key === 'Enter' && saveRename(document.id)}
                          className="rounded-lg border border-(--color-primary)/40 bg-(--color-surface) px-2 py-1 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => saveRename(document.id)}
                          className="rounded-lg bg-(--color-primary) px-2 py-1 text-(--color-surface) text-xs"
                        >
                          保存
                        </button>
                      </div>
                    ) : (
                      <h3 className="truncate font-medium">{document.name}</h3>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-(--color-muted) text-xs">
                      <span className="inline-flex items-center gap-1">
                        <Folder size={13} /> {document.folder}
                      </span>
                      <span>
                        {document.fileType} · {document.size}
                      </span>
                      <span>{document.system}</span>
                      {document.source && <span>{document.source}</span>}
                      <span>更新于 {document.updatedAt}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${statusClass(document.status)}`}
                  >
                    {document.status}
                  </span>
                  {document.status === '已解析' && (
                    <span className="text-(--color-muted) text-xs">{document.chunks} 个分片</span>
                  )}
                  <button
                    type="button"
                    onClick={() => parseDocument(document.id)}
                    disabled={document.status === '解析中'}
                    className="focus-ring inline-flex items-center gap-1 rounded-lg border border-(--color-border) px-2.5 py-1.5 text-(--color-muted) text-xs"
                  >
                    <RefreshCw size={13} /> {document.status === '已解析' ? '重新解析' : '解析'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(document.id);
                      setEditingName(document.name);
                    }}
                    className="focus-ring inline-flex items-center gap-1 rounded-lg border border-(--color-border) px-2.5 py-1.5 text-(--color-muted) text-xs"
                  >
                    <Pencil size={13} /> 重命名
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteDocument(document.id)}
                    disabled={document.source === '内置知识库'}
                    title={document.source === '内置知识库' ? '内置资料不可删除' : undefined}
                    className="focus-ring inline-flex items-center gap-1 rounded-lg border border-rose-400/20 px-2.5 py-1.5 text-rose-300 text-xs disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 size={13} /> 删除
                  </button>
                </div>
              </div>
              {document.status === '已解析' && (
                <div className="mt-3 flex items-center gap-2 text-emerald-300 text-xs">
                  <CheckCircle2 size={14} /> 已建立可追溯来源，可被诊断 Agent 检索
                </div>
              )}
            </article>
          ))}
          {!filteredDocuments.length && (
            <div className="rounded-xl border border-dashed border-(--color-border) p-8 text-center text-(--color-muted) text-sm">
              当前筛选条件下暂无知识文件
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-sky-400/20 bg-sky-400/5 p-4 text-(--color-muted) text-xs leading-5">
        <div className="font-medium text-sky-300">
          {backendConnected ? 'FastAPI 知识库说明' : '本地知识库说明'}
        </div>
        <p className="mt-2">
          {backendConnected
            ? '当前已连接 FastAPI 知识库：内置资料来自后端目录，上传、解析、重命名和删除操作会同步到服务端；诊断 Agent 可按文件名、目录、设备系统和正文检索来源。'
            : 'FastAPI 暂不可用，当前在浏览器本地保存文件索引、分类和解析状态；服务恢复后刷新页面即可重新同步。'}
        </p>
      </section>
    </div>
  );
}
