import parse, {
  domToReact,
  DOMNode,
  Element as HtmlElement,
} from "html-react-parser";
import { marked } from "marked";
import { JSX, useEffect, useState } from "react";

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

function sanitizeNode(node: Node, baseUrl?: string) {
  if (!(node instanceof Element)) {
    node.childNodes.forEach((child) => sanitizeNode(child, baseUrl));
    return;
  }

  const tagName = node.tagName.toLowerCase();
  if (!ALLOWED_TAGS.has(tagName)) {
    unwrapNode(node);
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

  node.childNodes.forEach((child) => sanitizeNode(child, baseUrl));
}

function sanitizeHtml(html: string, baseUrl?: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  doc
    .querySelectorAll("script, style, iframe, object, embed, link, meta")
    .forEach((node) => {
      node.remove();
    });

  doc.body.childNodes.forEach((child) => sanitizeNode(child, baseUrl));

  return doc.body.innerHTML;
}

export const ModBody = ({ body, baseUrl }: { body: string; baseUrl?: string }) => {
  const [content, setContent] = useState("");

  useEffect(() => {
    let cancelled = false;

    Promise.resolve(marked.parse(body))
      .then((html) => {
        if (!cancelled) setContent(sanitizeHtml(html, baseUrl));
      })
      .catch(() => {
        if (!cancelled) setContent("");
      });

    return () => {
      cancelled = true;
    };
  }, [body, baseUrl]);

  const transformNode = (domNode: DOMNode): JSX.Element | void => {
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
        const h = node.attribs?.height
          ? Number(node.attribs.height)
          : undefined;

        return (
          <img
            src={node.attribs?.src}
            alt={node.attribs?.alt || ""}
            width={w}
            height={h}
            loading="lazy"
            className="mx-auto my-3 block max-h-[24rem] max-w-full rounded-lg border border-border bg-muted/30 object-contain shadow-sm"
            style={{
              maxWidth: "100%",
              width: w ? `${w}px` : "auto",
              height: "auto",
            }}
          />
        );
      }
    }
  };

  return (
    <div className="min-w-0 max-w-full overflow-hidden break-words text-sm leading-relaxed [overflow-wrap:anywhere] [&_*]:max-w-full [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-5">
      {parse(content, { replace: transformNode })}
    </div>
  );
};
