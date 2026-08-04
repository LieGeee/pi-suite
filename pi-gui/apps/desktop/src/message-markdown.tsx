
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { highlightCodeBlock } from "./syntax-highlight";

const REMARK_PLUGINS = [remarkGfm, remarkBreaks];

const MARKDOWN_COMPONENTS = {
  code: ({ className, children }: { className?: string; children?: React.ReactNode }) => {
    const language = className?.replace(/^language-/, "");
    const code = String(children).replace(/\n$/, "");
    if (!className) {
      return <code>{code}</code>;
    }
    const highlighted = highlightCodeBlock(code, language);
    return (
      <pre data-language={language}>
        <code className={className} dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
    );
  },
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  ),
} as const;

export function MessageMarkdown({ text, streaming }: { readonly text: string; readonly streaming?: boolean }) {
  // During streaming, ReactMarkdown re-parses the *entire* message on every
  // delta, which becomes increasingly expensive as the message grows. Render a
  // plain <pre> while generating; React escapes text safely without the extra
  // full-string replace passes required by dangerouslySetInnerHTML.
  if (streaming) {
    return (
      <div className="message__content">
        <pre>{text}</pre>
      </div>
    );
  }

  return (
    <div className="message__content">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
