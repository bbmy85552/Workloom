import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { api, asApiError } from '../lib/api';
import { useUiStore } from '../store/ui';
import type { DocumentComment } from '../lib/types';

interface Props {
  token: string;
  authReady: boolean;
  loggedIn: boolean;
}

const inputClass =
  'w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-liquid-indigo/30';

export function ShareComments({ token, authReady, loggedIn }: Props) {
  const showToast = useUiStore((s) => s.showToast);
  const [comments, setComments] = useState<DocumentComment[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const { data } = await api.get<{ list: DocumentComment[] }>(`/share/${token}/comments`);
      setComments(data.list);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (body: string, parentId: string | null) => {
    const text = body.trim();
    if (!text || posting) return;
    setPosting(true);
    try {
      await api.post(`/share/${token}/comments`, { body: text, parentId });
      setDraft('');
      setReplyDraft('');
      setReplyTo(null);
      await load();
    } catch (err) {
      showToast(asApiError(err).error, 'error');
    } finally {
      setPosting(false);
    }
  };

  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  const renderComment = (comment: DocumentComment) => {
    const authorName = comment.author.name || comment.author.email;
    const replies = repliesOf(comment.id);
    return (
      <div key={comment.id} className={comment.resolvedAt ? 'opacity-60' : undefined}>
        <div className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-liquid-indigo/10 text-xs font-semibold text-liquid-indigo">
            {authorName.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-text-primary">{authorName}</span>
              <span className="text-xs text-text-secondary">{new Date(comment.createdAt).toLocaleString()}</span>
              {comment.resolvedAt && (
                <span className="rounded bg-black/5 px-1.5 py-0.5 text-[11px] text-text-secondary">已解决</span>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-text-primary">{comment.body}</p>
            {loggedIn && (
              <button
                type="button"
                className="mt-1 text-xs text-liquid-indigo hover:underline"
                onClick={() => {
                  setReplyTo(replyTo === comment.id ? null : comment.id);
                  setReplyDraft('');
                }}
              >
                回复
              </button>
            )}
            {loggedIn && replyTo === comment.id && (
              <div className="mt-2 space-y-2">
                <textarea
                  className={inputClass}
                  rows={2}
                  autoFocus
                  placeholder="写下你的回复…"
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-black/10 px-3 py-1.5 text-xs hover:bg-black/5"
                    onClick={() => setReplyTo(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={!replyDraft.trim() || posting}
                    className="rounded-lg bg-liquid-indigo px-3 py-1.5 text-xs text-white hover:bg-primary disabled:opacity-50"
                    onClick={() => void submit(replyDraft, comment.id)}
                  >
                    发表评论
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        {replies.length > 0 && (
          <div className="ml-11 mt-3 space-y-3 border-l-2 border-black/5 pl-4">
            {replies.map((reply) => renderComment(reply))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="bg-white border border-black/5 rounded-2xl shadow-sm p-6 sm:p-10">
      <div className="mb-4 flex items-center gap-2 text-base font-semibold text-text-primary">
        <MessageSquare size={18} className="text-liquid-indigo" />
        评论
        <span className="text-sm font-normal text-text-secondary">({comments.length})</span>
      </div>

      {authReady && loggedIn && (
        <div className="mb-6 space-y-2">
          <textarea
            className={inputClass}
            rows={3}
            placeholder="写一条评论"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!draft.trim() || posting}
              className="rounded-lg bg-liquid-indigo px-4 py-1.5 text-sm text-white hover:bg-primary disabled:opacity-50"
              onClick={() => void submit(draft, null)}
            >
              发表评论
            </button>
          </div>
        </div>
      )}
      {authReady && !loggedIn && (
        <div className="mb-6 rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3 text-sm text-text-secondary">
          <Link
            to={`/login?next=${encodeURIComponent(`/share/${token}`)}`}
            className="text-liquid-indigo hover:underline"
          >
            登录后参与评论
          </Link>
        </div>
      )}

      {loadFailed ? (
        <p className="text-sm text-text-secondary">评论加载失败，请刷新重试</p>
      ) : roots.length === 0 ? (
        <p className="text-sm text-text-secondary">暂无评论</p>
      ) : (
        <div className="space-y-4">{roots.map((c) => renderComment(c))}</div>
      )}
    </section>
  );
}
