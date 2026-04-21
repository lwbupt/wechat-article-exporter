/**
 * 排版 API
 * 将 Markdown 内容转换为微信公众号兼容的内联样式 HTML
 * 移植自 wewrite WeChatConverter 管线：CJK兼容、容器语法、外链脚注、暗黑模式
 */

import db from '~/server/database/index';

// ========== 类型定义 ==========

interface ThemeColors {
  primary: string;
  text: string;
  background: string;
  code_bg: string;
  code_color: string;
}

interface DarkmodeColors {
  text: string;
  background: string;
  primary: string;
  code_bg: string;
  code_color: string;
  quote_bg: string;
}

interface ThemeStyles {
  container: string;
  h1: string;
  h2: string;
  h3: string;
  h4: string;
  p: string;
  strong: string;
  em: string;
  code: string;
  pre: string;
  blockquote: string;
  list: string;
  image: string;
  table: string;
  th: string;
  td: string;
  a: string;
  hr: string;
  colors: ThemeColors;
  darkmode: DarkmodeColors;
  // 向后兼容旧模板
  title?: string;
  heading?: string;
  paragraph?: string;
  // 精细化装饰样式
  h1_decoration?: string;
  h2_decoration?: string;
  h3_decoration?: string;
  ol_style?: string;
  ul_style?: string;
  hr_style?: string;
  separator?: string;
  // 固定内容插入
  header_content?: string;
  footer_content?: string;
  section_prefix?: string;
  section_suffix?: string;
}

interface ConvertResult {
  html: string;
  title: string;
  digest: string;
}

// ========== 工具函数 ==========

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

function getThemeColors(styles: ThemeStyles): ThemeColors {
  return styles.colors || { primary: '#2563eb', text: '#333333', background: '#ffffff', code_bg: '#1e293b', code_color: '#e2e8f0' };
}

function getStyle(styles: ThemeStyles, key: string): string {
  // 向后兼容旧模板的键名映射
  const compatMap: Record<string, string> = { h1: 'title', h2: 'heading', p: 'paragraph' };
  return (styles as any)[key] || (compatMap[key] ? (styles as any)[compatMap[key]] : '') || '';
}

// ========== 管线步骤 ==========

/**
 * 步骤 1：提取 H1 标题并从正文中移除
 */
function extractTitle(md: string): { title: string; content: string } {
  let title = '';
  const lines = md.split('\n');
  const filtered: string[] = [];

  for (const line of lines) {
    const stripped = line.trim();
    if (!title && stripped.startsWith('# ') && !stripped.startsWith('## ')) {
      title = stripped.slice(2).trim();
    } else {
      filtered.push(line);
    }
  }

  return { title, content: filtered.join('\n') };
}

/**
 * 步骤 2：预处理容器语法（:::dialogue / :::timeline / :::callout / :::quote）
 */
function preprocessContainers(md: string, colors: ThemeColors): string {
  md = processDialogue(md, colors);
  md = processTimeline(md, colors);
  md = processCallout(md);
  md = processQuote(md, colors);
  return md;
}

function processDialogue(md: string, colors: ThemeColors): string {
  return md.replace(/:::dialogue\n([\s\S]*?)\n:::/g, (_match, content: string) => {
    const bubbles: string[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('> ')) {
        const msg = trimmed.slice(2);
        bubbles.push(
          `<div style="display: flex; justify-content: flex-end; margin-bottom: 12px;"><div style="background: #f3f4f6; color: #1f2937; padding: 12px 16px; border-radius: 16px; max-width: 70%; font-size: 15px; line-height: 1.5; word-wrap: break-word;">${escapeHtml(msg)}</div></div>`,
        );
      } else {
        bubbles.push(
          `<div style="display: flex; justify-content: flex-start; margin-bottom: 12px;"><div style="background: ${colors.primary}; color: white; padding: 12px 16px; border-radius: 16px; max-width: 70%; font-size: 15px; line-height: 1.5; word-wrap: break-word;">${escapeHtml(trimmed)}</div></div>`,
        );
      }
    }
    return bubbles.join('\n');
  });
}

function processTimeline(md: string, colors: ThemeColors): string {
  let idx = 0;
  return md.replace(/:::timeline\n([\s\S]*?)\n:::/g, (_match, content: string) => {
    const items: string[] = [];
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let title = '';
      let desc = trimmed;

      // **title** desc 格式
      const boldMatch = trimmed.match(/^\*\*(.+?)\*\*\s*(.*)/);
      if (boldMatch) {
        title = boldMatch[1];
        desc = boldMatch[2] || '';
      }

      idx++;
      items.push(
        `<div style="display: flex; margin-bottom: 32px;"><div style="flex-shrink: 0; width: 32px; height: 32px; background: ${colors.primary}; border-radius: 50%; margin-right: 16px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">${idx}</div><div style="flex: 1;">${title ? `<h3 style="color: ${colors.primary}; margin: 0 0 8px 0; font-size: 18px; font-weight: 600;">${escapeHtml(title)}</h3>` : ''}<div style="color: #333333; font-size: 15px; line-height: 1.6;">${formatInline(desc)}</div></div></div>`,
      );
    }
    return items.join('\n');
  });
}

function processCallout(md: string): string {
  const typeConfig: Record<string, { color: string; bg: string; icon: string }> = {
    tip: { color: '#059669', bg: '#ecfdf5', icon: '💡' },
    warning: { color: '#d97706', bg: '#fffbeb', icon: '⚠️' },
    info: { color: '#2563eb', bg: '#eff6ff', icon: 'ℹ️' },
    danger: { color: '#dc2626', bg: '#fef2f2', icon: '🚨' },
  };

  return md.replace(/:::callout\s+(\w+)\n([\s\S]*?)\n:::/g, (_match, ctype: string, content: string) => {
    const cfg = typeConfig[ctype.toLowerCase()] || typeConfig['info'];
    return `<div style="background: ${cfg.bg}; border-left: 4px solid ${cfg.color}; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0;"><div style="display: flex; align-items: center; margin-bottom: 8px;"><span style="font-size: 20px; margin-right: 8px;">${cfg.icon}</span><span style="font-weight: 600; color: ${cfg.color}; text-transform: uppercase; font-size: 12px;">${escapeHtml(ctype)}</span></div><div style="color: #333333; font-size: 15px; line-height: 1.6;">${formatInline(content.trim())}</div></div>`;
  });
}

function processQuote(md: string, colors: ThemeColors): string {
  return md.replace(/:::quote\n([\s\S]*?)\n:::/g, (_match, content: string) => {
    return `<div style="margin: 24px 0;"><blockquote style="border-left: 4px solid ${colors.primary}; padding-left: 16px; margin: 0; color: #666666; font-style: italic; font-size: 15px; line-height: 1.6;">"${escapeHtml(content.trim())}"</blockquote></div>`;
  });
}

/**
 * 步骤 3：CJK-Latin 自动加空格
 */
function fixCjkSpacing(text: string): string {
  const cjk = '[\\u4e00-\\u9fff\\u3400-\\u4dbf\\u3000-\\u303f\\uff00-\\uffef]';
  const latin = '[A-Za-z0-9]';

  const lines = text.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    let fixed = line;
    // CJK 后跟 Latin/数字
    fixed = fixed.replace(new RegExp(`(${cjk})(${latin})`, 'g'), '$1 $2');
    // Latin/数字 后跟 CJK
    fixed = fixed.replace(new RegExp(`(${latin})(${cjk})`, 'g'), '$1 $2');
    result.push(fixed);
  }

  return result.join('\n');
}

/**
 * 步骤 4：增强版 Markdown → HTML 渲染
 */
function renderMarkdownToHtml(md: string, styles: ThemeStyles): string {
  const lines = md.split('\n');
  const htmlParts: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inBlockquote = false;
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = '';
  let inTable = false;
  let tableRows: string[][] = [];
  let tableIsHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 围栏代码块 ```lang
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // 结束代码块
        const codeContent = escapeHtml(codeBuffer.join('\n'));
        htmlParts.push(
          `<pre style="${getStyle(styles, 'pre')}" data-lang="${escapeHtml(codeLang)}"><code style="${getStyle(styles, 'code')}">${codeContent}</code></pre>`,
        );
        inCodeBlock = false;
        codeBuffer = [];
        codeLang = '';
      } else {
        // 开始代码块
        if (inList) { htmlParts.push(inList === 'ol' ? '</ol>' : '</ul>'); inList = null; }
        if (inBlockquote) { htmlParts.push('</blockquote>'); inBlockquote = false; }
        if (inTable) { htmlParts.push(renderTable(tableRows, tableIsHeader, styles)); inTable = false; tableRows = []; }
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // 表格行 | a | b |
    const tableMatch = line.match(/^\|(.+)\|$/);
    if (tableMatch) {
      const cells = tableMatch[1]
        .split('|')
        .map(c => c.trim())
        .filter(c => c);
      // 分隔行 ---|---
      if (cells.every(c => /^[\-:]+$/.test(c))) {
        tableIsHeader = true;
        continue;
      }
      if (!inTable) inTable = true;
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      htmlParts.push(renderTable(tableRows, tableIsHeader, styles));
      inTable = false;
      tableRows = [];
      tableIsHeader = false;
    }

    // 空行
    if (!line.trim()) {
      if (inList) { htmlParts.push(inList === 'ol' ? '</ol>' : '</ul>'); inList = null; }
      if (inBlockquote) { htmlParts.push('</blockquote>'); inBlockquote = false; }
      continue;
    }

    // 图片 ![alt](url)
    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (imgMatch) {
      const alt = imgMatch[1];
      const url = imgMatch[2];
      htmlParts.push(
        `<p style="text-align: center; margin: 15px 0;"><img style="${getStyle(styles, 'image')}" src="${url}" alt="${escapeHtml(alt)}" /></p>`,
      );
      continue;
    }

    // 标题 ## / ### / ####
    const hMatch = line.match(/^(#{2,4})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = formatInline(hMatch[2]);
      const styleKey = `h${level}` as 'h2' | 'h3' | 'h4';
      htmlParts.push(`<h${level} style="${getStyle(styles, styleKey)}">${text}</h${level}>`);
      continue;
    }

    // 一级标题（已在 extractTitle 中提取，这里处理遗漏情况）
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      const text = formatInline(h1Match[1]);
      htmlParts.push(`<h1 style="${getStyle(styles, 'h1')}">${text}</h1>`);
      continue;
    }

    // 引用 >
    if (line.startsWith('> ') || line.startsWith('>')) {
      const text = formatInline(line.startsWith('> ') ? line.slice(2) : line.slice(1));
      if (!inBlockquote) {
        htmlParts.push(`<blockquote style="${getStyle(styles, 'blockquote')}">`);
        inBlockquote = true;
      }
      htmlParts.push(`<p style="margin: 5px 0;">${text}</p>`);
      continue;
    } else if (inBlockquote) {
      htmlParts.push('</blockquote>');
      inBlockquote = false;
    }

    // 有序列表 1. / 2.
    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      if (inList !== 'ol') {
        if (inList) htmlParts.push('</ul>');
        htmlParts.push(`<ol style="${getStyle(styles, 'list')}; list-style-type: decimal;">`);
        inList = 'ol';
      }
      htmlParts.push(`<li>${formatInline(olMatch[2])}</li>`);
      continue;
    }

    // 无序列表 - / *
    const liMatch = line.match(/^[\-\*]\s+(.+)$/);
    if (liMatch) {
      if (inList !== 'ul') {
        if (inList) htmlParts.push('</ol>');
        htmlParts.push(`<ul style="${getStyle(styles, 'list')}; list-style-type: disc;">`);
        inList = 'ul';
      }
      htmlParts.push(`<li>${formatInline(liMatch[1])}</li>`);
      continue;
    }

    if (inList) { htmlParts.push(inList === 'ol' ? '</ol>' : '</ul>'); inList = null; }

    // 分割线 --- / ***
    if (/^[\-\*]{3,}$/.test(line.trim())) {
      htmlParts.push(`<hr style="${getStyle(styles, 'hr')}" />`);
      continue;
    }

    // 普通段落
    htmlParts.push(`<p style="${getStyle(styles, 'p')}">${formatInline(line)}</p>`);
  }

  // 关闭未闭合的标签
  if (inCodeBlock) {
    htmlParts.push(`<pre style="${getStyle(styles, 'pre')}"><code style="${getStyle(styles, 'code')}">${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }
  if (inList) htmlParts.push(inList === 'ol' ? '</ol>' : '</ul>');
  if (inBlockquote) htmlParts.push('</blockquote>');
  if (inTable) htmlParts.push(renderTable(tableRows, tableIsHeader, styles));

  return `<section style="${styles.container || ''}">\n${htmlParts.join('\n')}\n</section>`;
}

function renderTable(rows: string[][], hasHeader: boolean, styles: ThemeStyles): string {
  if (rows.length === 0) return '';
  const parts: string[] = [`<table style="${getStyle(styles, 'table')}">`];

  rows.forEach((cells, rowIdx) => {
    const isHeaderRow = hasHeader && rowIdx === 0;
    const tag = isHeaderRow ? 'th' : 'td';
    const styleKey = isHeaderRow ? 'th' : 'td';
    parts.push('<tr>');
    for (const cell of cells) {
      parts.push(`<${tag} style="${getStyle(styles, styleKey)}">${formatInline(cell)}</${tag}>`);
    }
    parts.push('</tr>');
  });

  parts.push('</table>');
  return parts.join('\n');
}

/**
 * 行内格式化：加粗/斜体/代码/链接
 */
function formatInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * 步骤 5：CJK 加粗标点修复 — 将中文标点移到 <strong> 外
 */
function fixCjkBoldPunctuation(html: string): string {
  // **内容，** → **内容**，
  return html.replace(/(\*\*)(.*?)([，。！？；：、]+)(\*\*)/g, '$1$2$4$3');
}

/**
 * 步骤 6：ul/ol → section+span（微信列表兼容）
 */
function convertListsToSections(html: string, colors: ThemeColors): string {
  // 处理有序列表
  html = html.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (_match, content: string) => {
    const items: string[] = [];
    let num = 0;
    const liRegex = /<li>([\s\S]*?)<\/li>/g;
    let liMatch: RegExpExecArray | null;
    while ((liMatch = liRegex.exec(content)) !== null) {
      num++;
      items.push(
        `<section style="display: flex; align-items: flex-start; margin-bottom: 8px; color: ${colors.text}"><span style="color: ${colors.primary}; margin-right: 8px; flex-shrink: 0; font-weight: 700; line-height: 1.8;">${num}.</span><span style="flex: 1">${liMatch[1]}</span></section>`,
      );
    }
    return items.join('\n');
  });

  // 处理无序列表
  html = html.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, (_match, content: string) => {
    const items: string[] = [];
    const liRegex = /<li>([\s\S]*?)<\/li>/g;
    let liMatch: RegExpExecArray | null;
    while ((liMatch = liRegex.exec(content)) !== null) {
      items.push(
        `<section style="display: flex; align-items: flex-start; margin-bottom: 8px; color: ${colors.text}"><span style="color: ${colors.primary}; margin-right: 8px; flex-shrink: 0; font-size: 18px; line-height: 1.6;">•</span><span style="flex: 1">${liMatch[1]}</span></section>`,
      );
    }
    return items.join('\n');
  });

  return html;
}

/**
 * 步骤 7：外部链接 → 上标脚注
 */
function convertLinksToFootnotes(html: string, colors: ThemeColors): string {
  const footnotes: { num: number; text: string; href: string }[] = [];
  let counter = 0;

  // 替换 <a> 标签
  html = html.replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_match, href: string, text: string) => {
    if (!href || href.startsWith('#')) return _match;
    counter++;
    const plainText = stripHtmlTags(text);
    footnotes.push({ num: counter, text: plainText, href });
    return `${text}<sup><span style="color: ${colors.primary}; font-size: 12px">[${counter}]</span></sup>`;
  });

  if (footnotes.length > 0) {
    // 在 </section> 前插入参考链接
    const refParts: string[] = [
      `<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 32px 0 16px" />`,
      `<p style="font-size: 13px; color: #999999; margin-bottom: 8px; font-weight: 700">参考链接</p>`,
    ];
    for (const fn of footnotes) {
      refParts.push(
        `<p style="font-size: 12px; color: #999999; margin: 2px 0; word-break: break-all">[${fn.num}] ${escapeHtml(fn.text)}: ${escapeHtml(fn.href)}</p>`,
      );
    }

    // 在最后一个 </section> 前插入
    const lastSection = html.lastIndexOf('</section>');
    if (lastSection > -1) {
      html = html.slice(0, lastSection) + refParts.join('\n') + '\n' + html.slice(lastSection);
    } else {
      html += '\n' + refParts.join('\n');
    }
  }

  return html;
}

/**
 * 步骤 8：应用内联样式（补充 code/strong/em/a 等元素样式）
 */
function applyInlineStyles(html: string, styles: ThemeStyles): string {
  // <code>（非 <pre> 内的）加样式
  const codeStyle = getStyle(styles, 'code');
  if (codeStyle) {
    html = html.replace(/<code>(?![^]*<\/code>)(?![^]*<pre)/g, `<code style="${codeStyle}">`);
    // 更精确：为不在 <pre> 内的 <code> 加样式
    html = html.replace(/<code style="">/g, `<code style="${codeStyle}">`);
    html = html.replace(/<code>(?!.*<\/pre>)/g, `<code style="${codeStyle}">`);
  }

  // <strong> 加样式
  const strongStyle = getStyle(styles, 'strong');
  if (strongStyle) {
    html = html.replace(/<strong>/g, `<strong style="${strongStyle}">`);
  }

  // <em> 加样式
  const emStyle = getStyle(styles, 'em');
  if (emStyle) {
    html = html.replace(/<em>/g, `<em style="${emStyle}">`);
  }

  return html;
}

/**
 * 步骤 9：微信兼容修复
 */
function applyWechatFixes(html: string, styles: ThemeStyles): string {
  const textColor = getThemeColors(styles).text;

  // 所有 <p> 标签确保有显式 color
  html = html.replace(/<p style="([^"]*)"/g, (_match, style: string) => {
    if (style.includes('color')) return _match;
    return `<p style="${style}; color: ${textColor}"`;
  });
  // 无 style 的 <p>
  html = html.replace(/<p>(?!style)/g, `<p style="color: ${textColor}">`);

  // <pre> 添加 white-space 保留
  html = html.replace(/<pre style="([^"]*)"/g, (_match, style: string) => {
    if (style.includes('white-space')) return _match;
    return `<pre style="${style}; white-space: pre-wrap; word-wrap: break-word"`;
  });

  return html;
}

/**
 * 步骤 10：注入暗黑模式属性
 */
function injectDarkmode(html: string, darkmode: DarkmodeColors | undefined): string {
  if (!darkmode) return html;

  // <p> / <span> / <section> 标签
  for (const tag of ['p', 'span', 'section']) {
    const regex = new RegExp(`<${tag} (style="[^"]*color[^"]*")`, 'g');
    html = html.replace(regex, `<${tag} data-darkmode-color="${darkmode.text}" data-darkmode-bgcolor="transparent" $1`);
  }

  // 标题
  for (const tag of ['h1', 'h2', 'h3', 'h4']) {
    html = html.replace(
      new RegExp(`<${tag} `, 'g'),
      `<${tag} data-darkmode-color="${darkmode.text || '#e0e0e0'}" data-darkmode-bgcolor="transparent" `,
    );
  }

  // 代码块
  html = html.replace(/<pre /g, `<pre data-darkmode-bgcolor="${darkmode.code_bg}" data-darkmode-color="${darkmode.code_color}" `);
  html = html.replace(/<code /g, `<code data-darkmode-color="${darkmode.code_color}" `);

  // 引用
  html = html.replace(/<blockquote /g, `<blockquote data-darkmode-bgcolor="${darkmode.quote_bg}" data-darkmode-color="${darkmode.text}" `);

  // <strong>
  html = html.replace(/<strong /g, `<strong data-darkmode-color="${darkmode.primary}" `);

  return html;
}

/**
 * 步骤 11：生成摘要（前 120 字节 UTF-8）
 */
function generateDigest(html: string): string {
  const text = stripHtmlTags(html).replace(/\s+/g, ' ').trim();
  const maxBytes = 120;
  const ellipsis = '...';
  const targetBytes = maxBytes - Buffer.byteLength(ellipsis, 'utf-8');

  const encoded = Buffer.from(text, 'utf-8');
  if (encoded.length <= maxBytes) return text;

  // 截断到有效的 UTF-8 边界
  let truncated = encoded.subarray(0, targetBytes).toString('utf-8');
  return truncated + ellipsis;
}

/**
 * 步骤 12：应用标题装饰样式
 */
function applyDecorations(html: string, styles: ThemeStyles): string {
  const decorations: [string, string][] = [
    ['h1', styles.h1_decoration || ''],
    ['h2', styles.h2_decoration || ''],
    ['h3', styles.h3_decoration || ''],
  ];
  for (const [tag, deco] of decorations) {
    if (!deco) continue;
    const re = new RegExp(`<${tag}\\s+style="([^"]*)"`, 'g');
    html = html.replace(re, `<${tag} style="$1; ${deco}"`);
    // 没有 style 属性的标签也处理
    const re2 = new RegExp(`<${tag}(?!\\s+style)`, 'g');
    html = html.replace(re2, `<${tag} style="${deco}"`);
  }
  return html;
}

/**
 * 步骤 13：应用列表自定义样式
 */
function applyListStyles(html: string, styles: ThemeStyles): string {
  if (styles.ol_style) {
    html = html.replace(/<ol>([\s\S]*?)<\/ol>/g, (_match, content: string) => {
      return `<ol>${content.replace(/<span style="([^"]*)"/g, `<span style="$1; ${styles.ol_style}"`)}</ol>`;
    });
  }
  if (styles.ul_style) {
    html = html.replace(/<ul>([\s\S]*?)<\/ul>/g, (_match, content: string) => {
      return `<ul>${content.replace(/<span style="([^"]*)"/g, `<span style="$1; ${styles.ul_style}"`)}</ul>`;
    });
  }
  return html;
}

/**
 * 步骤 14：应用分隔线样式/自定义分隔符
 */
function applyHrStyles(html: string, styles: ThemeStyles): string {
  if (styles.separator) {
    html = html.replace(/<hr\s*\/?>/g, styles.separator);
  } else if (styles.hr_style) {
    html = html.replace(/<hr\s*\/?>/g, `<hr style="${styles.hr_style}" />`);
  }
  return html;
}

/**
 * 步骤 15：插入固定内容（文首/文末/章节前后）
 */
function insertFixedContent(html: string, styles: ThemeStyles): string {
  // 章节前后内容：在每个 h2 前后插入
  if (styles.section_prefix || styles.section_suffix) {
    html = html.replace(/<h2\s[^>]*>[\s\S]*?<\/h2>/g, match => {
      return (styles.section_prefix || '') + match + (styles.section_suffix || '');
    });
  }

  // 文首内容
  if (styles.header_content) {
    html = styles.header_content + '\n' + html;
  }

  // 文末内容
  if (styles.footer_content) {
    html = html + '\n' + styles.footer_content;
  }

  return html;
}

// ========== 主流程 ==========

function convert(markdown: string, styles: ThemeStyles): ConvertResult {
  const colors = getThemeColors(styles);

  // 1. 提取 H1 标题
  const { title, content: contentAfterTitle } = extractTitle(markdown);

  // 2. 预处理容器语法
  const afterContainers = preprocessContainers(contentAfterTitle, colors);

  // 3. CJK-Latin 自动加空格
  const afterCjkSpacing = fixCjkSpacing(afterContainers);

  // 4. Markdown → HTML 渲染
  let html = renderMarkdownToHtml(afterCjkSpacing, styles);

  // 5. CJK 加粗标点修复
  html = fixCjkBoldPunctuation(html);

  // 6. ul/ol → section+span
  html = convertListsToSections(html, colors);

  // 7. 外部链接 → 脚注
  html = convertLinksToFootnotes(html, colors);

  // 8. 应用内联样式（code/strong/em）
  html = applyInlineStyles(html, styles);

  // 9. 微信兼容修复
  html = applyWechatFixes(html, styles);

  // 10. 注入暗黑模式属性
  html = injectDarkmode(html, styles.darkmode);

  // 12. 应用标题装饰样式
  html = applyDecorations(html, styles);

  // 13. 应用列表自定义样式
  html = applyListStyles(html, styles);

  // 14. 应用分隔线样式/自定义分隔符
  html = applyHrStyles(html, styles);

  // 15. 插入固定内容（文首/文末/章节前后）
  html = insertFixedContent(html, styles);

  // 11. 生成摘要（在固定内容插入之后，确保摘要不包含固定内容）
  const digest = generateDigest(html);

  return { html, title, digest };
}

export default defineEventHandler(async event => {
  try {
    const body = await readBody(event);
    const { articleId, templateId, content, styleJson, preview, accountId } = body as {
      articleId?: number;
      templateId?: number;
      content?: string;
      styleJson?: string;
      preview?: boolean;
      accountId?: number;
    };

    // 预览模式：直接传 styleJson + content，不需要 articleId
    if (preview && styleJson && content) {
      const styles = JSON.parse(styleJson) as ThemeStyles;
      const result = convert(content, styles);
      return { success: true, data: { html: result.html, title: result.title, digest: result.digest, preview: true } };
    }

    if (!articleId || !templateId) {
      return { success: false, error: '缺少参数' };
    }

    // 读取模板
    const template = db
      .prepare('SELECT id, name, style_json FROM layout_templates WHERE id = ?')
      .get(templateId) as { id: number; name: string; style_json: string } | undefined;
    if (!template) {
      return { success: false, error: '模板不存在' };
    }

    // 读取文章内容
    let mdContent = content || '';
    if (!mdContent && articleId) {
      const article = db
        .prepare('SELECT content, content_with_images FROM generated_articles WHERE id = ?')
        .get(articleId) as { content: string; content_with_images: string | null } | undefined;
      if (!article) {
        return { success: false, error: '文章不存在' };
      }
      mdContent = article.content_with_images || article.content || '';
    }

    const styles = JSON.parse(template.style_json) as ThemeStyles;

    // 账号级固定内容覆盖模板中的固定内容
    if (accountId) {
      const accRow = db.prepare('SELECT header_content, footer_content, section_prefix, section_suffix FROM managed_accounts WHERE id = ?').get(accountId) as any;
      if (accRow) {
        if (accRow.header_content) styles.header_content = accRow.header_content;
        if (accRow.footer_content) styles.footer_content = accRow.footer_content;
        if (accRow.section_prefix) styles.section_prefix = accRow.section_prefix;
        if (accRow.section_suffix) styles.section_suffix = accRow.section_suffix;
      }
    }

    const result = convert(mdContent, styles);

    // 保存排版结果
    db.prepare('UPDATE generated_articles SET formatted_html = ?, layout_template = ? WHERE id = ?').run(
      result.html,
      template.name,
      articleId,
    );

    return {
      success: true,
      data: {
        html: result.html,
        templateName: template.name,
        title: result.title,
        digest: result.digest,
      },
    };
  } catch (error) {
    console.error('Format article failed:', error);
    return { success: false, error: '排版失败' };
  }
});
