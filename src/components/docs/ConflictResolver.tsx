import { useState } from 'react';
import { Modal } from '../Modal';
import { RichEditor } from '../../editor/Editor';

/**
 * 文档保存冲突时，对比“我的修改”与“他人已保存版本”，由用户决定如何处理。
 *
 * 设计：不做 HTML 自动合并（不可靠），改为左右双栏只读预览做视觉对比，
 * 用户三选一：用我的覆盖 / 丢弃我的加载最新 / 取消（暂不处理）。
 */

export interface DocConflictSide {
  title: string;
  contentJson: string;
}

export interface DocConflict {
  mine: DocConflictSide;
  remote: DocConflictSide;
}

interface Props {
  conflict: DocConflict | null;
  onOverwriteMine: () => void;
  onLoadRemote: () => void;
  onClose: () => void;
}

export function ConflictResolver({ conflict, onOverwriteMine, onLoadRemote, onClose }: Props) {
  const [busy, setBusy] = useState<'overwrite' | 'load' | null>(null);
  if (!conflict) return null;

  const wrap = (fn: () => void, key: 'overwrite' | 'load') => async () => {
    setBusy(key);
    await Promise.resolve(fn());
    setBusy(null);
  };

  return (
    <Modal open={!!conflict} onClose={onClose} size="xl" title="文档存在冲突">
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>⚠</span>
          <div>
            你编辑期间，该文档已被他人保存了新版本。下面左右对比了你的修改与他人已保存的版本，
            请选择保留哪一边。下方两个版本均为只读预览。
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-black/5 overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-liquid-indigo/10 text-liquid-indigo text-xs font-semibold">
              我的修改（未保存）
            </div>
            <div className="text-sm font-semibold px-3 pt-2">{conflict.mine.title || '（无标题）'}</div>
            <div className="max-h-[45vh] overflow-y-auto px-1">
              <RichEditor
                initialContent={conflict.mine.contentJson}
                onChange={() => {}}
                fontFamilies={[]}
                editable={false}
              />
            </div>
          </div>

          <div className="rounded-xl border border-black/5 overflow-hidden flex flex-col">
            <div className="px-3 py-2 bg-emerald-500/10 text-emerald-700 text-xs font-semibold">
              他人已保存（服务端最新）
            </div>
            <div className="text-sm font-semibold px-3 pt-2">{conflict.remote.title || '（无标题）'}</div>
            <div className="max-h-[45vh] overflow-y-auto px-1">
              <RichEditor
                initialContent={conflict.remote.contentJson}
                onChange={() => {}}
                fontFamilies={[]}
                editable={false}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:justify-end pt-2 border-t border-black/5">
          <button
            onClick={onClose}
            disabled={busy !== null}
            className="px-4 py-2 rounded-xl border border-black/10 text-sm text-text-secondary hover:bg-black/5 disabled:opacity-50"
          >
            取消（暂不处理）
          </button>
          <button
            onClick={wrap(onLoadRemote, 'load')}
            disabled={busy !== null}
            className="px-4 py-2 rounded-xl border border-black/10 text-sm text-text-primary hover:bg-black/5 disabled:opacity-50"
          >
            {busy === 'load' ? '加载中…' : '丢弃我的，加载最新'}
          </button>
          <button
            onClick={wrap(onOverwriteMine, 'overwrite')}
            disabled={busy !== null}
            className="px-4 py-2 rounded-xl bg-liquid-indigo hover:bg-primary text-white text-sm disabled:opacity-50"
          >
            {busy === 'overwrite' ? '保存中…' : '用我的覆盖'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
