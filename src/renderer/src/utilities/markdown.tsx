import parse, {
  domToReact,
  DOMNode,
  Element as HtmlElement,
} from "html-react-parser";
import { marked } from "marked";
import { JSX, ReactNode, useEffect, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const api = window.api;

const ALLOWED_TAGS = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  a: new Set(["href"]),
  img: new Set(["src", "alt", "width", "height"]),
};

function normalizeExternalUrl(value: string, baseUrl?: string): string | null {
  if (!value) return null;

  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function unwrapNode(node: Element) {
  const parent = node.parentNode;
  if (!parent) {
    node.remove();
    return;
  }

  while (node.firstChild) {
    parent.insertBefore(node.firstChild, node);
  }

  node.remove();
}

const TABLE_STRUCTURE_TAGS = new Set([
  "table",
  "tbody",
  "tfoot",
  "thead",
  "tr",
]);

function sanitizeNode(node: Node, baseUrl?: string) {
  const children = [...node.childNodes];

  if (node.nodeType === Node.TEXT_NODE) {
    const parentTag = node.parentElement?.tagName.toLowerCase();
    if (
      parentTag &&
      TABLE_STRUCTURE_TAGS.has(parentTag) &&
      !(node.textContent || "").trim()
    ) {
      node.parentNode?.removeChild(node);
    }
    return;
  }

  if (node instanceof Element) {
    const tagName = node.tagName.toLowerCase();

    if (!ALLOWED_TAGS.has(tagName)) {
      unwrapNode(node);
      for (const child of children) sanitizeNode(child, baseUrl);
      return;
    }

    for (const attr of [...node.attributes]) {
      const attrName = attr.name.toLowerCase();
      const allowed = ALLOWED_ATTRIBUTES[tagName]?.has(attrName) ?? false;

      if (!allowed) {
        node.removeAttribute(attr.name);
        continue;
      }

      if (attrName === "href" || attrName === "src") {
        const normalized = normalizeExternalUrl(attr.value, baseUrl);
        if (!normalized) {
          node.removeAttribute(attr.name);
          continue;
        }

        node.setAttribute(attr.name, normalized);
        continue;
      }
    }
  }

  for (const child of children) sanitizeNode(child, baseUrl);
}

export function sanitizeHtml(html: string, baseUrl?: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  doc
    .querySelectorAll("script, style, iframe, object, embed, link, meta")
    .forEach((node) => {
      node.remove();
    });

  for (const child of [...doc.body.childNodes]) sanitizeNode(child, baseUrl);

  return doc.body.innerHTML;
}

function BodyImage({
  src,
  alt,
  width,
  height,
}: {
  src?: string;
  alt: string;
  width?: number;
  height?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return null;

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      className="mx-auto my-3 block max-h-[24rem] max-w-full rounded-lg border border-border bg-surface-2 object-contain shadow-sm"
      style={{
        maxWidth: "100%",
        width: width ? `${width}px` : "auto",
        height: "auto",
      }}
      onError={() => setFailed(true)}
    />
  );
}

export function transformNode(domNode: DOMNode): JSX.Element | void {
  if (domNode.type === "tag") {
    const node = domNode as HtmlElement;

    if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(node.name)) {
      return (
        <p className="mt-4 first:mt-0 text-sm font-semibold text-foreground">
          {domToReact(node.children as DOMNode[], { replace: transformNode })}
        </p>
      );
    }

    if (node.name === "span") {
      return (
        <span>
          {domToReact(node.children as DOMNode[], { replace: transformNode })}
        </span>
      );
    }

    if (node.name === "p") {
      return (
        <p className="my-2 text-muted-foreground">
          {domToReact(node.children as DOMNode[], { replace: transformNode })}
        </p>
      );
    }

    if (node.name === "table") {
      return (
        <div className="my-3 max-w-full overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            {domToReact(node.children as DOMNode[], { replace: transformNode })}
          </table>
        </div>
      );
    }

    if (node.name === "a") {
      const href = node.attribs?.href || "";

      return (
        <a
          href={href}
          className="font-medium text-primary underline underline-offset-4 transition-colors hover:text-primary/80"
          rel="noreferrer"
          onClick={async (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!href) return;
            await api.shell.openExternal(href);
          }}
        >
          {domToReact(node.children as DOMNode[], { replace: transformNode })}
        </a>
      );
    }

    if (node.name === "img") {
      const w = node.attribs?.width ? Number(node.attribs.width) : undefined;
      const h = node.attribs?.height ? Number(node.attribs.height) : undefined;

      return (
        <BodyImage
          src={node.attribs?.src}
          alt={node.attribs?.alt || ""}
          width={w}
          height={h}
        />
      );
    }
  }
}

export function useMarkdownHtml(
  body: string,
  baseUrl?: string,
  keepPrevious = false,
): string | null {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!keepPrevious) setContent(null);

    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        if (cancelled) return;

        Promise.resolve(marked.parse(body))
          .then((html) => {
            if (!cancelled) setContent(sanitizeHtml(html, baseUrl));
          })
          .catch(() => {
            if (!cancelled) setContent("");
          });
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [body, baseUrl, keepPrevious]);

  return content;
}

export const MARKDOWN_PROSE_CLASS =
  "min-w-0 max-w-full overflow-hidden break-words text-sm leading-relaxed [overflow-wrap:anywhere] [&_*]:max-w-full [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-surface-3 [&_code]:px-1 [&_code]:py-0.5 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-surface-2 [&_pre]:p-3 [&_pre]:whitespace-pre-wrap [&_td]:border-t [&_td]:border-border [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:bg-surface-2 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-foreground [&_ul]:list-disc [&_ul]:pl-5";

const defaultFallback = (
  <div className="space-y-3">
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-4 w-full" />
    <Skeleton className="h-4 w-5/6" />
    <Skeleton className="h-40 w-full" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2" />
  </div>
);

export const Markdown = ({
  body,
  baseUrl,
  className = MARKDOWN_PROSE_CLASS,
  fallback = defaultFallback,
  keepPrevious = false,
}: {
  body: string;
  baseUrl?: string;
  className?: string;
  fallback?: ReactNode;
  keepPrevious?: boolean;
}) => {
  const content = useMarkdownHtml(body, baseUrl, keepPrevious);

  const rendered = useMemo(
    () => (content ? parse(content, { replace: transformNode }) : null),
    [content],
  );

  return (
    <div className={className}>{content === null ? fallback : rendered}</div>
  );
};
