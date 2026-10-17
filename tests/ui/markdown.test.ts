import { describe, expect, it } from 'vitest';
import { catalogue } from '../../src/content/index.ts';
import { parseInline, parseMarkdown } from '../../src/ui/components/markdown.ts';

describe('parseInline', () => {
  it('parses bold, italic and code', () => {
    expect(parseInline('a **b** `c` *d*')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'strong', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'c' },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'd' }] },
    ]);
  });

  it('leaves stray markers as text', () => {
    expect(parseInline('3 * 4 = 12')).toEqual([{ type: 'text', text: '3 * 4 = 12' }]);
  });
});

describe('parseMarkdown', () => {
  it('splits paragraphs and bullet lists', () => {
    expect(parseMarkdown('One\ntwo.\n\n- a\n- **b**\n\nEnd.')).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: 'One two.' }] },
      {
        type: 'list',
        items: [
          [{ type: 'text', text: 'a' }],
          [{ type: 'strong', children: [{ type: 'text', text: 'b' }] }],
        ],
      },
      { type: 'paragraph', children: [{ type: 'text', text: 'End.' }] },
    ]);
  });

  it('parses every concept card without leftover ** or ` markers', () => {
    const leftovers = (nodes: ReturnType<typeof parseInline>): string[] =>
      nodes.flatMap((n) =>
        n.type === 'text' ? [n.text] : n.type === 'code' ? [] : leftovers(n.children),
      );
    for (const level of catalogue.levels) {
      for (const block of parseMarkdown(level.concept)) {
        const texts =
          block.type === 'paragraph' ? leftovers(block.children) : block.items.flatMap(leftovers);
        for (const text of texts) expect(text, `level ${level.id}`).not.toMatch(/\*\*|`/);
      }
    }
  });
});
