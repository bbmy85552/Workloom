import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { FileText, Table as TableIcon, ExternalLink, LogIn, UserPlus } from 'lucide-react';
import { api, asApiError } from '../../lib/api';
import { startShareTracking } from '../../lib/shareTracker';
import { useAuthStore } from '../../store/auth';
import { useUiStore } from '../../store/ui';
import { RichEditor } from '../../editor/Editor';
import { DocumentToc } from '../../components/docs/DocumentToc';
import { ImageLightbox, type LightboxImage } from '../../components/ImageLightbox';
import { ShareComments } from '../../components/ShareComments';
import type { TableField, TableRecord } from '../../lib/types';
import type { EditorHeading } from '../../editor/Editor';
import { DEFAULT_PUBLIC_SETTINGS, fetchPublicSettings } from '../../lib/publicSettings';

interface SharePayload {
  resourceType: 'doc' | 'table' | 'html';
  role: 'view' | 'edit';
  requireLogin: boolean;
  trackViews?: boolean;
  loginRequired?: boolean;
  doc?: {
    id: string;
    title: string;
    contentJson: string;
    updatedAt: string;
    createdBy: { name: string; email: string; avatarUrl: string | null };
  };
  table?: { id: string; name: string; updatedAt: string };
  html?: { id: string; title: string; entryPath: string };
  fields?: TableField[];
  records?: TableRecord[];
}

export function SharePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const authStatus = useAuthStore((s) => s.status);
  const fetchMe = useAuthStore((s) => s.fetchMe);
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

  const [lightbox, setLightbox] = useState<{ images: LightboxImage[]; index: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (authStatus === 'idle') void fetchMe();
  }, [authStatus, fetchMe]);

  const openLightbox = (e: ReactMouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const img = target.closest('img');
    if (!img || !contentRef.current) return;
    const imgs = Array.from(contentRef.current.querySelectorAll('img'));
    const images = imgs.map((el) => ({ src: el.currentSrc || el.src, alt: el.alt || '' }));
    const index = Math.max(0, imgs.indexOf(img));
    if (images.length > 0) setLightbox({ images, index });
  };

  const trackingRef = useRef(false);
  useEffect(() => {
    if (!token || !data?.trackViews || data.loginRequired) return;
    if (!data.doc && !data.table) return;
    if (trackingRef.current) return;
    trackingRef.current = true;
    const stop = startShareTracking(token);
    return () => {
      stop();
      trackingRef.current = false;
    };
  }, [token, data]);

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

  if (data.resourceType === 'html' && data.html) {
    return <HtmlShareView token={token ?? ''} html={data.html} />;
  }

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
            {authStatus === 'ready' &&
              (me ? (
                <>
                  <Link to="/app" className="px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary">
                    {me.name}
                  </Link>
                  <button
                    onClick={claim}
                    className="px-3 py-1.5 rounded-lg bg-liquid-indigo text-white text-xs hover:bg-primary flex items-center gap-1"
                  >
                    <ExternalLink size={12} /> 加入协作
                  </button>
                </>
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
              ))}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-6">
        {data.loginRequired && (
          <div className="max-w-md mx-auto text-center py-16">
            <div className="text-base font-semibold text-text-primary mb-2">该分享需要登录后查看</div>
            <p className="text-sm text-text-secondary mb-5">
              这条分享链接开启了观看记录：登录后即可查看内容，分享者可以看到你的停留与阅读情况。
            </p>
            <Link
              to={`/login?next=${encodeURIComponent(`/share/${token}`)}`}
              className="inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-liquid-indigo text-white text-sm hover:bg-primary"
            >
              <LogIn size={14} /> 登录后查看
            </Link>
          </div>
        )}
        {data.resourceType === 'doc' && data.doc && (
          <div className={headings.length > 0 ? 'grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px]' : 'grid gap-4'}>
            <div ref={contentRef} onClick={openLightbox} className="share-doc-content bg-white border border-black/5 rounded-2xl shadow-sm p-6 sm:p-10">
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
            <ShareComments token={token ?? ''} authReady={authStatus === 'ready'} loggedIn={!!me} />
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
      {lightbox && (
        <ImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(index) => setLightbox((cur) => (cur ? { ...cur, index } : cur))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function HtmlShareView({
  token,
  html,
}: {
  token: string;
  html: { id: string; title: string; entryPath: string };
}) {
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'F12' ||
        (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) ||
        (e.ctrlKey && ['U', 'S'].includes(e.key.toUpperCase()))
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  const src = `/api/html-previews/${html.id}/files/${html.entryPath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}?token=${encodeURIComponent(token)}`;
  return (
    <iframe
      title={html.title}
      src={src}
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100dvh', border: 0 }}
    />
  );
}
