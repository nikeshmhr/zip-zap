/**
 * The small Markdown subset used by concept cards: paragraphs, "- " bullet lists, and inline
 * **bold**, *italic* and `code`. Parsed to data and rendered as React elements (never HTML).
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'code'; text: string };

export type Block = { type: 'paragraph'; children: Inline[] } | { type: 'list'; items: Inline[][] };

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  for (const part of text.split(INLINE)) {
    if (!part) continue;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
      out.push({ type: 'code', text: part.slice(1, -1) });
    } else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      out.push({ type: 'strong', children: parseInline(part.slice(2, -2)) });
    } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      out.push({ type: 'em', children: parseInline(part.slice(1, -1)) });
    } else {
      out.push({ type: 'text', text: part });
    }
  }
  return out;
}

export function parseMarkdown(markdown: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of markdown.trim().split(/\n\s*\n/)) {
    const lines = chunk.split('\n').map((l) => l.trim());
    if (lines.every((l) => l.startsWith('- '))) {
      blocks.push({ type: 'list', items: lines.map((l) => parseInline(l.slice(2))) });
    } else {
      blocks.push({ type: 'paragraph', children: parseInline(lines.join(' ')) });
    }
  }
  return blocks;
}
