import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextStyle from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import TableRow from '@tiptap/extension-table-row';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import Superscript from '@tiptap/extension-superscript';
import Subscript from '@tiptap/extension-subscript';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { FontSize } from './FontSize';
import { FontFamily } from './FontFamily';
import { LineHeight } from './LineHeight';
import { FindReplacePanel } from './FindReplacePanel';
import { EditorToolbar, type EditorToolbarHandlers } from './Toolbar';
import { DocumentTable, DocumentTableCell, DocumentTableHeader } from './TableExtensions';
import { looksLikeMarkdown, markdownToHtml } from './markdownPaste';

interface Props {
  initialContent: string;
  onChange: (json: string) => void;
  fontFamilies: string[];
  editable?: boolean;
  handlers?: EditorToolbarHandlers;
  onPasteImages?: (files: File[]) => void | Promise<void>;
  onHeadingsChange?: (headings: EditorHeading[]) => void;
}

export interface RichEditorRef {
  editor: TiptapEditor | null;
  setContent: (content: string) => void;
}

export interface EditorHeading {
  id: string;
  level: number;
  text: string;
}

function slugifyHeading(text: string) {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^\p{L}\p{N}-]+/gu, '')
      .replace(/^-+|-+$/g, '') || 'heading'
  );
}

function readHeadings(editor: TiptapEditor | null): EditorHeading[] {
  if (!editor) return [];
  const seen = new Map<string, number>();
  return Array.from(editor.view.dom.querySelectorAll('h1,h2,h3,h4,h5,h6')).flatMap((node) => {
    const element = node as HTMLElement;
    const text = element.textContent?.trim() ?? '';
    if (!text) return [];
    const baseId = slugifyHeading(text);
    const next = seen.get(baseId) ?? 0;
    seen.set(baseId, next + 1);
    const id = next === 0 ? baseId : `${baseId}-${next + 1}`;
    element.id = id;
    return [{ id, level: Number(element.tagName.slice(1)), text }];
  });
}

export const RichEditor = forwardRef<RichEditorRef, Props>(function RichEditor(
  {
    initialContent,
    onChange,
    fontFamilies,
    editable = true,
    handlers,
    onPasteImages,
    onHeadingsChange,
  },
  ref,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onPasteImagesRef = useRef(onPasteImages);
  onPasteImagesRef.current = onPasteImages;
  const editableRef = useRef(editable);
  editableRef.current = editable;
  const onHeadingsChangeRef = useRef(onHeadingsChange);
  onHeadingsChangeRef.current = onHeadingsChange;

  const syncHeadings = (editor: TiptapEditor | null) => {
    window.requestAnimationFrame(() => {
      onHeadingsChangeRef.current?.(readHeadings(editor));
    });
  };

  const initialContentInput = useMemo(() => {
    if (!initialContent) return '';
    if (initialContent.trim().startsWith('{')) {
      try {
        return JSON.parse(initialContent);
      } catch {
        return initialContent;
      }
    }
    return initialContent;
  }, [initialContent]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank' } }),
      DocumentTable.configure({ resizable: true }),
      TableRow,
      DocumentTableHeader,
      DocumentTableCell,
      Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: 'doc-image' } }),
      TaskList.configure({ HTMLAttributes: { class: 'doc-tasklist' } }),
      TaskItem.configure({ nested: true, HTMLAttributes: { class: 'doc-taskitem' } }),
      CharacterCount.configure(),
      Superscript,
      Subscript,
      FontSize,
      FontFamily,
      LineHeight,
    ],
    content: initialContentInput,
    editable,
    onCreate: ({ editor }) => {
      syncHeadings(editor);
    },
    onUpdate: ({ editor }) => {
      onChangeRef.current(editor.getHTML());
      syncHeadings(editor);
      setCounts({
        characters: editor.storage.characterCount?.characters() ?? 0,
        words: editor.storage.characterCount?.words() ?? 0,
      });
    },
    editorProps: {
      handlePaste: (_view, event) => {
        if (!editableRef.current || !event.clipboardData) {
          return false;
        }
        const itemFiles = Array.from(event.clipboardData.items)
          .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
          .flatMap((item) => {
            const file = item.getAsFile();
            return file ? [file] : [];
          });
        const files =
          itemFiles.length > 0
            ? itemFiles
            : Array.from(event.clipboardData.files).filter((file) =>
                file.type.startsWith('image/'),
              );
        if (files.length > 0 && onPasteImagesRef.current) {
          event.preventDefault();
          void onPasteImagesRef.current(files);
          return true;
        }

        const text = event.clipboardData.getData('text/plain');
        if (!looksLikeMarkdown(text)) return false;

        event.preventDefault();
        editor?.chain().focus().insertContent(markdownToHtml(text)).run();
        return true;
      },
    },
  });
  const [counts, setCounts] = useState({ characters: 0, words: 0 });
  const [findOpen, setFindOpen] = useState(false);

  useEffect(() => {
    if (!editor) return;
    setCounts({
      characters: editor.storage.characterCount?.characters() ?? 0,
      words: editor.storage.characterCount?.words() ?? 0,
    });
  }, [editor]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!editable) return;
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        const target = e.target as HTMLElement | null;
        const inEditor = target?.closest?.('.rich-editor');
        if (!inEditor) return;
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editable]);

  useImperativeHandle(
    ref,
    () => ({
      editor,
      setContent(content: string) {
        if (!editor) return;
        const v = content.trim().startsWith('{')
          ? (() => {
              try {
                return JSON.parse(content);
              } catch {
                return content;
              }
            })()
          : content;
        editor.commands.setContent(v, true);
        syncHeadings(editor);
      },
    }),
    [editor],
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    syncHeadings(editor);
  }, [editor, initialContent]);

  const toolbarHandlers: EditorToolbarHandlers = {
    ...handlers,
    onOpenFind: () => setFindOpen(true),
  };

  return (
    <div className="rich-editor">
      {editable && (
        <EditorToolbar editor={editor} fontFamilies={fontFamilies} handlers={toolbarHandlers} />
      )}
      <EditorContent editor={editor} className="ProseMirror-host" />
      {editable && (
        <div className="editor-status no-print text-xs text-text-secondary mt-2 px-1 flex items-center justify-end gap-3">
          <span>{counts.words} 词</span>
          <span>{counts.characters} 字符</span>
        </div>
      )}
      {editable && <FindReplacePanel editor={editor} open={findOpen} onClose={() => setFindOpen(false)} />}
    </div>
  );
});
