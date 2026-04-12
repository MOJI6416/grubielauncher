import { Link } from "@heroui/react";
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

function isSafeExternalUrl(value: string, mode: "link" | "image"): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (mode === "image" && url.username) return false;
    return true;
  } catch {
    return false;
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

function sanitizeNode(node: Node) {
  if (!(node instanceof Element)) {
    node.childNodes.forEach((child) => sanitizeNode(child));
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

    if (attrName === "href" && !isSafeExternalUrl(attr.value, "link")) {
      node.removeAttribute(attr.name);
      continue;
    }

    if (attrName === "src" && !isSafeExternalUrl(attr.value, "image")) {
      node.removeAttribute(attr.name);
      continue;
    }
  }

  node.childNodes.forEach((child) => sanitizeNode(child));
}

function sanitizeHtml(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  doc
    .querySelectorAll("script, style, iframe, object, embed, link, meta")
    .forEach((node) => {
      node.remove();
    });

  doc.body.childNodes.forEach((child) => sanitizeNode(child));

  return doc.body.innerHTML;
}

export const ModBody = ({ body }: { body: string }) => {
  const [content, setContent] = useState("");

  useEffect(() => {
    let cancelled = false;

    Promise.resolve(marked.parse(body))
      .then((html) => {
        if (!cancelled) setContent(sanitizeHtml(html));
      })
      .catch(() => {
        if (!cancelled) setContent("");
      });

    return () => {
      cancelled = true;
    };
  }, [body]);

  const transformNode = (domNode: DOMNode): JSX.Element | void => {
    if (domNode.type === "tag") {
      const node = domNode as HtmlElement;

      if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(node.name)) {
        return (
          <p>
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
          <p>
            {domToReact(node.children as DOMNode[], { replace: transformNode })}
          </p>
        );
      }

      if (node.name === "a") {
        const href = node.attribs?.href || "";

        return (
          <Link
            href="#"
            onPress={async () => {
              if (!href) return;
              await api.shell.openExternal(href);
            }}
          >
            {domToReact(node.children as DOMNode[], { replace: transformNode })}
          </Link>
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
            style={{
              display: "block",
              margin: "2px auto",
              maxWidth: "100%",
              width: w ? `${w}px` : "auto",
              height: "auto",
              objectFit: "contain",
            }}
          />
        );
      }
    }
  };

  return (
    <div className="break-all">
      {parse(content, { replace: transformNode })}
    </div>
  );
};
