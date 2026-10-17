import type { Inline } from './markdown.ts';
import { parseMarkdown } from './markdown.ts';

function Inlines({ nodes }: { nodes: Inline[] }) {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text':
        return node.text;
      case 'code':
        return <code key={i}>{node.text}</code>;
      case 'strong':
        return (
          <strong key={i}>
            <Inlines nodes={node.children} />
          </strong>
        );
      case 'em':
        return (
          <em key={i}>
            <Inlines nodes={node.children} />
          </em>
        );
    }
  });
}

/** Renders the concept-card Markdown subset. */
export function Markdown({ text }: { text: string }) {
  return parseMarkdown(text).map((block, i) =>
    block.type === 'paragraph' ? (
      <p key={i}>
        <Inlines nodes={block.children} />
      </p>
    ) : (
      <ul key={i}>
        {block.items.map((item, j) => (
          <li key={j}>
            <Inlines nodes={item} />
          </li>
        ))}
      </ul>
    ),
  );
}
