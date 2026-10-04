import Markdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import "./markdown-preview.css";

function MarkdownImage({
  src,
  alt,
  title,
}: {
  src?: string;
  alt?: string;
  title?: string;
}) {
  const source = src ?? "";
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(source)?.[1]?.toLowerCase();
  if (source && (!scheme || scheme === "file")) {
    // Relative and file: sources resolve against the document directory after
    // mount; see localImages.ts and the live Markdown widget.
    return (
      <span className="preview-image">
        <img data-local-src={source} alt={alt ?? ""} title={title} />
        <span className="preview-image-error preview-image-placeholder" hidden>
          图片加载失败，请检查文件是否存在。
        </span>
      </span>
    );
  }
  let url: URL | undefined;
  if (scheme === "http" || scheme === "https") {
    try {
      const parsed = new URL(source);
      if (!parsed.username && !parsed.password) url = parsed;
    } catch {
      // Fall through to the placeholder below.
    }
  }
  if (!url)
    return (
      <span className="preview-image-placeholder">
        图片链接无效或暂不支持。
      </span>
    );
  return (
    <span className="preview-image">
      <img
        src={url.href}
        alt={alt ?? ""}
        title={title}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
      />
      <span className="preview-image-error preview-image-placeholder" hidden>
        图片加载失败，请检查链接或网络。
      </span>
    </span>
  );
}

// Shared safe rendering for blocks inside the editable Markdown surface.
export function MarkdownContent({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      skipHtml
      urlTransform={(value) =>
        // The default transform strips file: sources before they reach the image
        // component; everything else keeps the default scheme vetting.
        /^file:\/\//i.test(value) ? value : defaultUrlTransform(value)
      }
      components={{
        pre: CodeBlock,
        img: MarkdownImage,
        a: ({ href, children }) => (
          <a
            href={href}
            title={href ? `${href}（当前仅展示，可复制链接）` : "不支持的链接"}
            onClick={(event) => event.preventDefault()}
            onAuxClick={(event) => event.preventDefault()}
          >
            {children}
          </a>
        ),
      }}
    >
      {text}
    </Markdown>
  );
}
