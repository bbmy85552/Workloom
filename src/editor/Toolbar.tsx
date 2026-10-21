import { useCallback, useState } from 'react';
import { useUiStore } from '../store/ui';
import {
  Bold,
  Italic,
  Underline as UIcon,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  ListChecks,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Highlighter,
  Undo,
  Redo,
  Table as TableIcon,
  Quote,
  Code,
  Image as ImageIcon,
  Paperclip,
  Upload,
  Superscript as SuperIcon,
  Subscript as SubIcon,
  Search,
  Sparkles,
} from 'lucide-react';
import type { Editor } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

export interface EditorToolbarHandlers {
  onUploadImage?: () => void;
  onUploadAttachment?: () => void;
  onImportFile?: () => void;
  onOpenFind?: () => void;
}

interface ToolbarProps {
  editor: Editor | null;
  fontFamilies: string[];
  handlers?: EditorToolbarHandlers;
}

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '30px', '36px'];
const LINE_HEIGHTS = ['1.0', '1.15', '1.5', '1.75', '2.0', '2.5'];
const PRESET_COLORS = [
  '#1b1b1d',
  '#5e5ce6',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#94a3b8',
];
const HIGHLIGHTS = ['#FEF3C7', '#FCE7F3', '#DBEAFE', '#DCFCE7', '#E0E7FF', '#F3F4F6'];

function ToolButton({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`h-8 min-w-8 px-2 rounded-md flex items-center justify-center text-sm transition-colors ${
        active
          ? 'bg-liquid-indigo/15 text-liquid-indigo'
          : 'text-text-secondary hover:bg-black/5 hover:text-text-primary'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-black/10 mx-1" />;
}

export function EditorToolbar({ editor, fontFamilies, handlers }: ToolbarProps) {
  const [showColor, setShowColor] = useState(false);
  const [showHL, setShowHL] = useState(false);
  const promptDialog = useUiStore((s) => s.promptDialog);
  const showToast = useUiStore((s) => s.showToast);

  const setLink = useCallback(async () => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = await promptDialog({
      title: '插入链接',
      message: '请输入链接地址（留空可移除现有链接）：',
      defaultValue: previous ?? '',
      placeholder: 'https://...',
      confirmText: '确定',
    });
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor, promptDialog]);

  const autoFitCurrentTable = useCallback(() => {
    if (!editor) return;
    const tableInfo = findCurrentTable(editor);
    if (!tableInfo) {
      showToast('请先把光标放到要排版的表格里', 'error');
      return;
    }
    const widths = getTableColumnWidthPercents(tableInfo.node);
    if (widths.length === 0) {
      showToast('没有可排版的表格列', 'error');
      return;
    }

    const tr = editor.state.tr;
    tr.setNodeMarkup(tableInfo.pos, undefined, {
      ...tableInfo.node.attrs,
      autoFit: 'true',
    });

    tableInfo.node.descendants((node, pos) => {
      if (node.type.name !== 'tableHeader' && node.type.name !== 'tableCell') return;
      const colRange = getCellColumnRange(tableInfo.node, pos);
      if (!colRange) return;
      const width = widths.slice(colRange.start, colRange.end).reduce((sum, item) => sum + item, 0);
      const style = mergeCellStyle(node.attrs.style as string | null, {
        width: `${width.toFixed(2)}%`,
        'text-align': node.type.name === 'tableHeader' ? 'center' : 'left',
      });
      tr.setNodeMarkup(tableInfo.pos + 1 + pos, undefined, {
        ...node.attrs,
        colwidth: null,
        style,
      });
    });

    editor.view.dispatch(tr.scrollIntoView());
    editor.commands.focus();
    showToast('已自动排版当前表格', 'success');
  }, [editor, showToast]);

  if (!editor) return null;

  return (
    <div className="editor-toolbar no-print sticky top-0 z-10 -mx-4 sm:-mx-6 lg:-mx-12 px-4 sm:px-6 lg:px-12 pt-2 pb-2 bg-paper-white/95 backdrop-blur border-b border-black/5">
      <div className="flex items-center gap-1 flex-nowrap overflow-x-auto scrollbar-none md:flex-wrap md:overflow-x-visible">
        <ToolButton title="撤销" onClick={() => editor.chain().focus().undo().run()}>
          <Undo size={16} />
        </ToolButton>
        <ToolButton title="重做" onClick={() => editor.chain().focus().redo().run()}>
          <Redo size={16} />
        </ToolButton>

        <Divider />

        <select
          className="h-8 px-2 text-sm rounded-md bg-white border border-black/10 text-text-secondary hover:text-text-primary"
          onChange={(e) => {
            const value = e.target.value;
            if (value === 'p') editor.chain().focus().setParagraph().run();
            else editor.chain().focus().toggleHeading({ level: Number(value) as 1 | 2 | 3 }).run();
          }}
          value={
            editor.isActive('heading', { level: 1 })
              ? '1'
              : editor.isActive('heading', { level: 2 })
                ? '2'
                : editor.isActive('heading', { level: 3 })
                  ? '3'
                  : 'p'
          }
          title="段落样式"
        >
          <option value="p">正文</option>
          <option value="1">标题 1</option>
          <option value="2">标题 2</option>
          <option value="3">标题 3</option>
        </select>

        <select
          className="h-8 px-2 text-sm rounded-md bg-white border border-black/10 text-text-secondary hover:text-text-primary"
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(v).run();
          }}
          defaultValue=""
          title="字体"
        >
          <option value="">默认字体</option>
          {fontFamilies.map((f) => (
            <option key={f} value={f} style={{ fontFamily: f }}>
              {f}
            </option>
          ))}
        </select>

        <select
          className="h-8 px-2 text-sm rounded-md bg-white border border-black/10 text-text-secondary hover:text-text-primary"
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(v).run();
          }}
          defaultValue=""
          title="字号"
        >
          <option value="">字号</option>
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <Divider />

        <ToolButton title="加粗" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={16} />
        </ToolButton>
        <ToolButton title="斜体" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={16} />
        </ToolButton>
        <ToolButton
          title="下划线"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UIcon size={16} />
        </ToolButton>
        <ToolButton title="删除线" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={16} />
        </ToolButton>
        <ToolButton
          title="上标"
          active={editor.isActive('superscript')}
          onClick={() =>
            (editor.chain().focus() as unknown as {
              toggleSuperscript: () => { run: () => boolean };
            })
              .toggleSuperscript()
              .run()
          }
        >
          <SuperIcon size={16} />
        </ToolButton>
        <ToolButton
          title="下标"
          active={editor.isActive('subscript')}
          onClick={() =>
            (editor.chain().focus() as unknown as {
              toggleSubscript: () => { run: () => boolean };
            })
              .toggleSubscript()
              .run()
          }
        >
          <SubIcon size={16} />
        </ToolButton>

        <div className="relative">
          <ToolButton title="字体颜色" onClick={() => setShowColor((s) => !s)}>
            <span className="w-4 h-4 rounded border" style={{ background: editor.getAttributes('textStyle').color ?? '#1b1b1d' }} />
          </ToolButton>
          {showColor && (
            <div className="absolute top-9 left-0 z-20 p-2 bg-surface-container-lowest border border-black/10 rounded-lg shadow-lg flex gap-1.5 flex-wrap w-40">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className="w-6 h-6 rounded border border-black/10"
                  style={{ background: c }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().setColor(c).run();
                    setShowColor(false);
                  }}
                />
              ))}
              <button
                className="text-xs text-text-secondary mt-1 w-full"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setShowColor(false);
                }}
              >
                清除颜色
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <ToolButton title="背景高亮" active={editor.isActive('highlight')} onClick={() => setShowHL((s) => !s)}>
            <Highlighter size={16} />
          </ToolButton>
          {showHL && (
            <div className="absolute top-9 left-0 z-20 p-2 bg-surface-container-lowest border border-black/10 rounded-lg shadow-lg flex gap-1.5 flex-wrap w-44">
              {HIGHLIGHTS.map((c) => (
                <button
                  key={c}
                  className="w-6 h-6 rounded border border-black/10"
                  style={{ background: c }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    editor.chain().focus().toggleHighlight({ color: c }).run();
                    setShowHL(false);
                  }}
                />
              ))}
              <button
                className="text-xs text-text-secondary mt-1 w-full"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().unsetHighlight().run();
                  setShowHL(false);
                }}
              >
                清除高亮
              </button>
            </div>
          )}
        </div>

        <Divider />

        <ToolButton
          title="左对齐"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          <AlignLeft size={16} />
        </ToolButton>
        <ToolButton
          title="居中"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          <AlignCenter size={16} />
        </ToolButton>
        <ToolButton
          title="右对齐"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <AlignRight size={16} />
        </ToolButton>
        <ToolButton
          title="两端对齐"
          active={editor.isActive({ textAlign: 'justify' })}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        >
          <AlignJustify size={16} />
        </ToolButton>

        <select
          className="h-8 px-2 text-sm rounded-md bg-white border border-black/10 text-text-secondary hover:text-text-primary"
          onChange={(e) => {
            const v = e.target.value;
            if (v === '')
              (editor.chain().focus() as unknown as {
                unsetLineHeight: () => { run: () => boolean };
              })
                .unsetLineHeight()
                .run();
            else
              (editor.chain().focus() as unknown as {
                setLineHeight: (v: string) => { run: () => boolean };
              })
                .setLineHeight(v)
                .run();
          }}
          defaultValue=""
          title="行高"
        >
          <option value="">行高</option>
          {LINE_HEIGHTS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>

        <Divider />

        <ToolButton title="无序列表" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={16} />
        </ToolButton>
        <ToolButton title="有序列表" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </ToolButton>
        <ToolButton
          title="任务列表"
          active={editor.isActive('taskList')}
          onClick={() => (editor.chain().focus() as unknown as { toggleTaskList: () => { run: () => boolean } }).toggleTaskList().run()}
        >
          <ListChecks size={16} />
        </ToolButton>

        <Divider />

        <ToolButton title="标题 1" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 size={16} />
        </ToolButton>
        <ToolButton title="标题 2" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={16} />
        </ToolButton>
        <ToolButton title="标题 3" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 size={16} />
        </ToolButton>
        <ToolButton title="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={16} />
        </ToolButton>
        <ToolButton title="代码块" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code size={16} />
        </ToolButton>

        <Divider />

        <ToolButton title="链接" active={editor.isActive('link')} onClick={setLink}>
          <LinkIcon size={16} />
        </ToolButton>

        <ToolButton
          title="插入 3x3 表格"
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon size={16} />
        </ToolButton>
        <ToolButton
          title="自动排版当前表格：自适应列宽，列名居中，数据居左"
          disabled={!editor.isActive('table')}
          onClick={autoFitCurrentTable}
        >
          <Sparkles size={16} />
        </ToolButton>

        {handlers?.onUploadImage && (
          <ToolButton title="插入图片" onClick={handlers.onUploadImage}>
            <ImageIcon size={16} />
          </ToolButton>
        )}
        {handlers?.onUploadAttachment && (
          <ToolButton title="插入附件" onClick={handlers.onUploadAttachment}>
            <Paperclip size={16} />
          </ToolButton>
        )}
        {handlers?.onImportFile && (
          <ToolButton title="导入文件：支持 Word (.docx)、Markdown (.md/.markdown)、纯文本 (.txt)" onClick={handlers.onImportFile}>
            <Upload size={16} />
          </ToolButton>
        )}
        {handlers?.onOpenFind && (
          <ToolButton title="查找替换 (Ctrl+F)" onClick={handlers.onOpenFind}>
            <Search size={16} />
          </ToolButton>
        )}
      </div>
    </div>
  );
}

function findCurrentTable(editor: Editor): { node: ProseMirrorNode; pos: number } | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table') {
      return { node, pos: $from.before(depth) };
    }
  }
  return null;
}

function getTableColumnWidthPercents(table: ProseMirrorNode): number[] {
  const columnScores: number[] = [];
  const columnTexts: string[][] = [];

  table.forEach((row) => {
    let column = 0;
    row.forEach((cell) => {
      const colspan = Math.max(1, Number(cell.attrs.colspan) || 1);
      const text = cell.textContent.trim();
      for (let index = 0; index < colspan; index += 1) {
        const targetColumn = column + index;
        columnTexts[targetColumn] = columnTexts[targetColumn] ?? [];
        columnTexts[targetColumn].push(text);
      }
      column += colspan;
    });
  });

  for (let index = 0; index < columnTexts.length; index += 1) {
    const texts = columnTexts[index] ?? [];
    const widest = texts.reduce((max, text) => Math.max(max, measureEditorTextWidth(text)), 0);
    const widestToken = texts.reduce(
      (max, text) => Math.max(max, measureEditorTextWidth(getLongestTextToken(text))),
      0,
    );
    const average = texts.length
      ? texts.reduce((sum, text) => sum + measureEditorTextWidth(text), 0) / texts.length
      : 0;
    columnScores[index] = Math.max(24, widestToken * 0.55 + widest * 0.15 + average * 1.15);
  }

  const total = columnScores.reduce((sum, score) => sum + score, 0);
  if (total <= 0) return [];

  return distributeColumnPercents(
    columnScores.map((score) => (score / total) * 100),
  );
}

function distributeColumnPercents(rawPercents: number[]): number[] {
  const count = rawPercents.length;
  if (count === 0) return [];

  const minPercent = Math.min(count === 2 ? 18 : count <= 4 ? 12 : 8, 100 / count);
  const maxPercent = count === 2 ? 82 : count === 3 ? 70 : count === 4 ? 58 : 48;
  const locked = new Set<number>();
  const result = rawPercents.map((value) => Math.min(Math.max(value, minPercent), maxPercent));

  for (let guard = 0; guard < count * 2; guard += 1) {
    const total = result.reduce((sum, value) => sum + value, 0);
    const delta = 100 - total;
    if (Math.abs(delta) < 0.01) break;

    const adjustable = result
      .map((value, index) => ({ value, index }))
      .filter(({ value, index }) => {
        if (locked.has(index)) return false;
        return delta > 0 ? value < maxPercent : value > minPercent;
      });
    if (adjustable.length === 0) break;

    const share = delta / adjustable.length;
    for (const item of adjustable) {
      const next = Math.min(Math.max(item.value + share, minPercent), maxPercent);
      if (next === item.value) locked.add(item.index);
      result[item.index] = next;
    }
  }

  const total = result.reduce((sum, value) => sum + value, 0);
  if (total !== 0) {
    const drift = 100 - total;
    const target = result.reduce(
      (best, value, index) => (value > result[best] ? index : best),
      0,
    );
    result[target] += drift;
  }

  return result;
}

function getLongestTextToken(text: string): string {
  const tokens = text
    .split(/[\s,，、;；/]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (tokens.length === 0) return text;
  return tokens.reduce((longest, item) =>
    measureEditorTextWidth(item) > measureEditorTextWidth(longest) ? item : longest,
  );
}

function getCellColumnRange(
  table: ProseMirrorNode,
  targetRelativePos: number,
): { start: number; end: number } | null {
  let found: { start: number; end: number } | null = null;

  table.descendants((node, pos, parent) => {
    if (found) return false;
    if (pos !== targetRelativePos) return;
    if (node.type.name !== 'tableCell' && node.type.name !== 'tableHeader') return;
    if (!parent || parent.type.name !== 'tableRow') return;

    let column = 0;
    parent.forEach((cell) => {
      if (cell === node) {
        const colspan = Math.max(1, Number(cell.attrs.colspan) || 1);
        found = { start: column, end: column + colspan };
      }
      column += Math.max(1, Number(cell.attrs.colspan) || 1);
    });
    return false;
  });

  return found;
}

function measureEditorTextWidth(text: string): number {
  return Array.from(text).reduce((sum, char) => {
    if (char.charCodeAt(0) <= 0x7f) return sum + 7;
    return sum + 14;
  }, 0);
}

function mergeCellStyle(
  style: string | null,
  next: Record<string, string>,
): string {
  const entries = new Map<string, string>();
  for (const part of (style ?? '').split(';')) {
    const [rawKey, ...rawValue] = part.split(':');
    const key = rawKey?.trim().toLowerCase();
    const value = rawValue.join(':').trim();
    if (key && value) entries.set(key, value);
  }
  for (const [key, value] of Object.entries(next)) {
    entries.set(key, value);
  }
  return Array.from(entries, ([key, value]) => `${key}: ${value}`).join('; ');
}
