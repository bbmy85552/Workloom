import { marked } from 'marked';

const BLOCK_MARKDOWN_PATTERNS = [
  /^ {0,3}#{1,6}[ \t]+\S/m,
  /^ {0,3}>\s+\S/m,
  /^ {0,3}(?:[-+*]|\d+[.)])[ \t]+\S/m,
  /^ {0,3}[-+*][ \t]+\[[ xX]\][ \t]+\S/m,
  /^ {0,3}(?:`{3,}|~{3,})[^\n]*$/m,
  /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/m,
];

const INLINE_MARKDOWN_PATTERNS = [
  /!\[[^\]]*]\([^)]+\)/,
  /\[[^\]]+]\([^)]+\)/,
  /\*\*(?=\S)(?:[^*\n]|\*(?!\*))+?\*\*/,
  /__(?=\S)(?:[^_\n]|_(?!_))+?__/,
  /~~(?=\S)[^~\n]+?~~/,
  /`(?=\S)[^`\n]+?`/,
];

const MARKDOWN_TABLE_PATTERN =
  /^ {0,3}\|?.+\|.+\n {0,3}\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/m;

export function looksLikeMarkdown(text: string) {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return false;
  if (BLOCK_MARKDOWN_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (MARKDOWN_TABLE_PATTERN.test(normalized)) return true;
  return INLINE_MARKDOWN_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function markdownToHtml(text: string) {
  return marked.parse(text, {
    async: false,
    gfm: true,
    breaks: false,
  }) as string;
}
