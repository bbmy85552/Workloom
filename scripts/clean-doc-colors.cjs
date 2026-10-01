/**
 * clean-doc-colors.cjs
 *
 * 一次性清洗脚本：修复文档内联颜色在深色/浅色主题下不可见的问题。
 *
 * 背景：从外部（AI 输出、其他编辑器）粘贴进来的内容带有 <font style="color:rgb(...)">
 * 标签和任意 rgb()/hex/rgba() 颜色值，这些值是为特定背景（通常是深色）设计的，
 * 切换主题后文字隐形。TipTap 的 Color 扩展只识别 <span>，<font> 标签会被当成
 * 未知内容原样保留，完全绕过编辑器的颜色处理。
 *
 * 本脚本做的事：
 *   1. 备份 dev.db 到 dev.db.clean-backup-<时间戳>。
 *   2. 遍历 Document.contentJson 和 DocumentVersion.contentJson。
 *   3. 把 <font ...> 归一化为 <span ...>（保留所有属性和 style）。
 *   4. 解析每个内联 style 里的 color 和 background-color，按 WCAG 相对亮度
 *      归类为 light（浅色，仅深底可见）/ dark（深色，仅浅底可见）/ neutral（中性），
 *      写入 data-doc-fg-tone / data-doc-bg-tone 属性。
 *   5. 不删除原始 color 值——CSS 规则在“错误主题”下用 data-doc-tone 覆盖显示。
 *
 * 幂等：重复运行不会叠加标记（每次都从原始 style 重新判定）。
 *
 * 用法（在容器内）：
 *   cd /app && node scripts/clean-doc-colors.cjs
 * 或带 --dry-run 预览不写入。
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client');

const DRY_RUN = process.argv.includes('--dry-run');

/** 解析颜色字符串为 {r,g,b}（0-255），支持 #hex / rgb() / rgba()。无法解析返回 null。 */
function parseColor(value) {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  let m;
  if ((m = v.match(/^#([0-9a-f]{3})$/))) {
    const [, h] = m;
    return { r: parseInt(h[0] + h[0], 16), g: parseInt(h[1] + h[1], 16), b: parseInt(h[2] + h[2], 16) };
  }
  if ((m = v.match(/^#([0-9a-f]{6})$/))) {
    const [, h] = m;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  if ((m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/))) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
  }
  return null;
}

/** WCAG 相对亮度，返回 0~1。 */
function relativeLuminance(rgb) {
  const ch = [rgb.r, rgb.g, rgb.b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** WCAG 对比度比，返回 1~21。 */
function contrastRatio(l1, l2) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// 两个主题的纸张背景亮度（取自 index.css：浅色 #FFFFFF、深色 #151822）。
const LIGHT_BG_LUM = relativeLuminance({ r: 255, g: 255, b: 255 }); // = 1
const DARK_BG_LUM = relativeLuminance({ r: 0x15, g: 0x18, b: 0x22 }); // ≈ 0.0075

/**
 * 按对比度归类色调（比单看亮度更准确）：
 *   计算该色对浅底 / 深底的 WCAG 对比度。哪个底上对比度 ≥ AA(4.5) 说明它是为那个底设计的；
 *   若只对深底清晰 → light（浅色专用）；若只对浅底清晰 → dark（深色专用）；
 *   两边都清晰 → neutral（不动）；两边都不够 → neutral（保守，不强行改）。
 */
function classifyTone(colorValue) {
  const rgb = parseColor(colorValue);
  if (!rgb) return null;
  const L = relativeLuminance(rgb);
  const onLight = contrastRatio(L, LIGHT_BG_LUM); // 对浅底的对比度
  const onDark = contrastRatio(L, DARK_BG_LUM);   // 对深底的对比度
  const AA = 4.5;
  if (onDark >= AA && onLight < AA) return 'light'; // 仅深底可读
  if (onLight >= AA && onDark < AA) return 'dark';  // 仅浅底可读
  return 'neutral'; // 两边都行 / 都不够，保守不改
}

/** 从 style 字符串里提取某个属性值。 */
function extractStyleValue(style, prop) {
  if (!style) return null;
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
  const m = style.match(re);
  return m ? m[1].replace(/\s*!important\s*$/i, '').trim() : null;
}

/**
 * 清洗单个 HTML 字符串。用正则逐标签处理（不引入 DOM 依赖，容器里跑更轻）。
 * 匹配所有带 style 的 <font>/<span> 开标签，归一化标签名并标注色调。
 */
const TAG_RE = /<(font|span)\b([^>]*)>/gi;

function cleanHtml(html) {
  if (!html || (!html.includes('<font') && !html.includes('color:'))) return html;
  let changed = false;
  let result = html.replace(TAG_RE, (full, tag, attrs) => {
    const lower = attrs.toLowerCase();
    const hasStyle = lower.includes('style=');
    const isFont = tag.toLowerCase() === 'font';
    if (!isFont && !hasStyle) return full;

    // 提取 style 内容
    let style = '';
    const styleMatch = attrs.match(/\bstyle\s*=\s*"([^"]*)"/i);
    if (styleMatch) style = styleMatch[1];

    const fgColor = extractStyleValue(style, 'color');
    const bgColor = extractStyleValue(style, 'background-color');
    const fgTone = classifyTone(fgColor);
    const bgTone = classifyTone(bgColor);

    // 去掉旧的 data-doc-*-tone（幂等）
    let rest = attrs.replace(/\s+data-doc-(?:fg|bg)-tone\s*=\s*"[^"]*"/gi, '');

    let extra = '';
    if (fgTone) extra += ` data-doc-fg-tone="${fgTone}"`;
    if (bgTone) extra += ` data-doc-bg-tone="${bgTone}"`;

    changed = changed || isFont || fgTone !== null || bgTone !== null;
    return `<span${rest}${extra}>`;
  });
  // 同步把对应的闭标签 </font> 换成 </span>，避免标签错配。
  if (changed && result.includes('</font>')) {
    result = result.replace(/<\/font\s*>/gi, '</span>');
  }
  return changed ? result : html;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const docs = await prisma.document.findMany({
      where: { OR: [{ contentJson: { contains: '<font' } }, { contentJson: { contains: 'color:' } }] },
      select: { id: true, contentJson: true },
    });
    const versions = await prisma.documentVersion.findMany({
      where: { OR: [{ contentJson: { contains: '<font' } }, { contentJson: { contains: 'color:' } }] },
      select: { id: true, contentJson: true },
    });

    console.log(`扫描到 ${docs.length} 个文档、${versions.length} 个历史版本含内联颜色。`);

    let docChanged = 0;
    let verChanged = 0;
    const samples = [];

    for (const d of docs) {
      const cleaned = cleanHtml(d.contentJson ?? '');
      if (cleaned !== d.contentJson) {
        docChanged++;
        if (samples.length < 3) samples.push({ id: d.id, before: (d.contentJson ?? '').slice(0, 200), after: cleaned.slice(0, 200) });
        if (!DRY_RUN) await prisma.document.update({ where: { id: d.id }, data: { contentJson: cleaned } });
      }
    }
    for (const v of versions) {
      const cleaned = cleanHtml(v.contentJson ?? '');
      if (cleaned !== v.contentJson) {
        verChanged++;
        if (!DRY_RUN) await prisma.documentVersion.update({ where: { id: v.id }, data: { contentJson: cleaned } });
      }
    }

    console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}文档改动: ${docChanged}，版本改动: ${verChanged}`);
    if (samples.length) {
      console.log('\n=== 改动样本 ===');
      samples.forEach((s, i) => {
        console.log(`\n[${i}] ${s.id}`);
        console.log('  前:', s.before);
        console.log('  后:', s.after);
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('清洗失败:', e);
  process.exit(1);
});
