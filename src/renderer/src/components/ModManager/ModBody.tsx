import { Image, Link } from '@heroui/react'
import parse, { domToReact, DOMNode, Element } from 'html-react-parser'
import styleToObject from 'style-to-object'
import { marked } from 'marked'
import { JSX, useEffect, useState, type CSSProperties } from 'react'

const api = window.api

const IGNORED_STYLES = ['font-size', 'font-size-adjust', 'font-family']

export const ModBody = ({ body }: { body: string }) => {
  const [content, setContent] = useState('')

  useEffect(() => {
    let cancelled = false

    Promise.resolve(marked.parse(body))
      .then((html) => {
        if (!cancelled) setContent(html)
      })
      .catch(() => {
        if (!cancelled) setContent('')
      })

    return () => {
      cancelled = true
    }
  }, [body])

  const transformNode = (domNode: DOMNode): JSX.Element | void => {
    if (domNode.type === 'tag') {
      const node = domNode as Element
      const styleString = node.attribs?.style
      const styleObj: CSSProperties = {}

      if (styleString) {
        styleToObject(styleString, (name, value) => {
          if (IGNORED_STYLES.includes(name)) return

          const camelName = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
          ;(styleObj as any)[camelName] = value
        })
      }

      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(node.name)) {
        return (
          <p style={styleObj}>
            {domToReact(node.children as DOMNode[], { replace: transformNode })}
          </p>
        )
      }

      if (node.name === 'span') {
        return (
          <span style={styleObj}>
            {domToReact(node.children as DOMNode[], { replace: transformNode })}
          </span>
        )
      }

      if (node.name === 'p') {
        return (
          <p style={styleObj}>
            {domToReact(node.children as DOMNode[], { replace: transformNode })}
          </p>
        )
      }

      if (node.name === 'a') {
        const href = node.attribs?.href || ''

        return (
          <Link
            style={styleObj}
            href={href || '#'}
            onPress={async () => {
              if (!href) return
              await api.shell.openExternal(href)
            }}
          >
            {domToReact(node.children as DOMNode[], { replace: transformNode })}
          </Link>
        )
      }

      if (node.name === 'img') {
        const w = node.attribs?.width ? Number(node.attribs.width) : undefined
        const h = node.attribs?.height ? Number(node.attribs.height) : undefined

        return (
          <Image
            style={{ ...styleObj, margin: '2px' }}
            width={w}
            height={h}
            src={node.attribs?.src}
            alt={node.attribs?.alt || ''}
            loading="lazy"
          />
        )
      }
    }
  }

  return <div className="break-all">{parse(content, { replace: transformNode })}</div>
}
