import { Children, isValidElement, type ReactNode } from "react";
import { classHighlighter, highlightTree } from "@lezer/highlight";
import { codeLanguage } from "../editor/codeLanguages";
import "./code-block.css";

export function CodeBlock({ children }: { children?: ReactNode }) {
  const child = Children.toArray(children)[0];
  if (
    !isValidElement<{ className?: string; children?: ReactNode }>(child) ||
    typeof child.props.children !== "string"
  ) {
    return <pre>{children}</pre>;
  }
  const text = child.props.children;
  const label = /(?:^|\s)language-(\S+)/.exec(child.props.className ?? "")?.[1];
  const language = label ? codeLanguage(label) : null;
  const tokens: ReactNode[] = [];
  let offset = 0;
  if (language) {
    highlightTree(
      language.parser.parse(text),
      classHighlighter,
      (from, to, classes) => {
        if (from > offset) tokens.push(text.slice(offset, from));
        tokens.push(
          <span key={from} className={classes}>
            {text.slice(from, to)}
          </span>,
        );
        offset = to;
      },
    );
  }
  tokens.push(text.slice(offset));
  return (
    <div className="code-block">
      <div className="code-block-language">{label || "纯文本"}</div>
      <pre>
        <code className={child.props.className}>{tokens}</code>
      </pre>
    </div>
  );
}
