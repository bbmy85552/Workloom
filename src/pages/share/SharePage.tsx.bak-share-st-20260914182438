import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { FileText, Table as TableIcon, ExternalLink, LogIn, UserPlus } from 'lucide-react';
import { api, asApiError } from '../../lib/api';
import { useAuthStore } from '../../store/auth';
import { useUiStore } from '../../store/ui';
import { RichEditor } from '../../editor/Editor';
import { DocumentToc } from '../../components/docs/DocumentToc';
import type { TableField, TableRecord } from '../../lib/types';
import type { EditorHeading } from '../../editor/Editor';
import { DEFAULT_PUBLIC_SETTINGS, fetchPublicSettings } from '../../lib/publicSettings';

interface SharePayload {
  resourceType: 'doc' | 'table';
  role: 'view' | 'edit';
  requireLogin: boolean;
  doc?: {
    id: string;
    title: string;
    contentJson: string;
    updatedAt: string;
    createdBy: { name: string; email: string; avatarUrl: string | null };
  };
  table?: { id: string; name: string; updatedAt: string };
  fields?: TableField[];
  records?: TableRecord[];
}

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const showToast = useUiStore((s) => s.showToast);
  const [data, setData] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [headings, setHeadings] = useState<EditorHeading[]>([]);
  const [brandName, setBrandName] = useState(DEFAULT_PUBLIC_SETTINGS.brandName);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const [shareRes, settings] = await Promise.all([
          api.get<SharePayload>(`/share/${token}`),
          fetchPublicSettings().catch(() => DEFAULT_PUBLIC_SETTINGS),
        ]);
        setData(shareRes.data);
        setBrandName(settings.brandName);
      } catch (err) {
        setErrorMsg(asApiError(err).error);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const claim = async () => {
    try {
      const { data } = await api.post<{ redirect: string }>(`/share/${token}/claim`, {});
      showToast('已加入协作', 'success');
      navigate(data.redirect);
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-text-secondary">
        加载中…
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="text-base font-semibold text-text-primary mb-2">无法打开分享内容</div>
          <p className="text-sm text-text-secondary mb-4">{errorMsg}</p>
          <Link
            to={`/login?next=${encodeURIComponent(`/share/${token}`)}`}
            className="inline-flex items-center gap-1 text-sm text-liquid-indigo hover:underline"
          >
            <LogIn size={14} /> 返回登录页
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-paper-white">
      <header className="border-b border-black/5 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between gap-3">
          <Link to="/" className="text-sm font-semibold text-text-primary">
            {brandName}
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-text-secondary">
              来自分享 · {data.role === 'edit' ? '可编辑' : '仅查看'}
            </span>
            {me ? (
              <button
                onClick={claim}
                className="px-3 py-1.5 rounded-lg bg-liquid-indigo text-white text-xs hover:bg-primary flex items-center gap-1"
              >
                <ExternalLink size={12} /> 加入协作
              </button>
            ) : (
              <>
                <Link
                  to={`/login?next=${encodeURIComponent(`/share/${token}`)}`}
                  className="px-3 py-1.5 rounded-lg border border-black/10 text-xs hover:bg-black/5 flex items-center gap-1"
                >
                  <LogIn size={12} /> 登录
                </Link>
                <Link
                  to={`/register?next=${encodeURIComponent(`/share/${token}`)}`}
                  className="px-3 py-1.5 rounded-lg bg-liquid-indigo text-white text-xs hover:bg-primary flex items-center gap-1"
                >
                  <UserPlus size={12} /> 注册
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-6">
        {data.resourceType === 'doc' && data.doc && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
            <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-6 sm:p-10">
              <div className="flex items-center gap-2 text-xs text-text-secondary mb-2">
                <FileText size={14} />
                {data.doc.createdBy.name} · 更新于 {new Date(data.doc.updatedAt).toLocaleString()}
              </div>
              <h1 className="text-3xl sm:text-[36px] font-serif font-bold text-text-primary mb-6">
                {data.doc.title}
              </h1>
              <RichEditor
                initialContent={data.doc.contentJson}
                onChange={() => {}}
                onHeadingsChange={setHeadings}
                fontFamilies={[]}
                editable={false}
              />
            </div>
            <DocumentToc headings={headings} />
          </div>
        )}
        {data.resourceType === 'table' && data.table && (
          <div className="bg-white border border-black/5 rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-2 text-xs text-text-secondary mb-2">
              <TableIcon size={14} /> 更新于 {new Date(data.table.updatedAt).toLocaleString()}
            </div>
            <h1 className="text-2xl sm:text-[28px] font-serif font-bold text-text-primary mb-4">
              {data.table.name}
            </h1>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-text-secondary border-b border-black/5">
                    {(data.fields ?? []).map((f) => (
                      <th key={f.id} className="px-3 py-2 font-medium whitespace-nowrap">
                        {f.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.records ?? []).map((r) => (
                    <tr key={r.id} className="border-b border-black/5">
                      {(data.fields ?? []).map((f) => (
                        <td key={f.id} className="px-3 py-1.5 align-top">
                          {Array.isArray(r.data[f.name])
                            ? (r.data[f.name] as unknown[]).join(', ')
                            : r.data[f.name] == null
                              ? ''
                              : String(r.data[f.name])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
