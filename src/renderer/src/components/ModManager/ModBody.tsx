import { Image, Link } from '@heroui/react'
import parse, { domToReact, DOMNode, Element } from 'html-react-parser'
import styleToObject from 'style-to-object'
import { marked } from 'marked'
import { JSX } from 'react'

const shell = window.api.shell

const IGNORED_STYLES = ['font-size', 'font-size-adjust', 'font-family']

export const ModBody = ({ body }: { body: string }) => {
  const transformNode = (domNode: DOMNode): JSX.Element | void => {
    if (domNode.type === 'tag') {
      const node = domNode as Element
      const styleString = node.attribs?.style
      let styleObj: React.CSSProperties = {}

      if (styleString) {
        styleToObject(styleString, (name, value) => {
          if (!IGNORED_STYLES.includes(name)) {
            styleObj[name] = value
          }
        })
      }

      if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span'].includes(node.name)) {
        return (
          <p style={styleObj}>
            {domToReact(node.children as DOMNode[], { replace: transformNode })}
          </p>
        )
      }

      if (node.name === 'a') {
        return (
          <Link
            style={styleObj}
            onPress={() => {
              shell.openExternal(node.attribs.href)
            }}
            href="#"
          >
            {domToReact(node.children as DOMNode[], { replace: transformNode })}
          </Link>
        )
      }

      if (node.name === 'img') {
        return (
          <Image
            style={{ ...styleObj, margin: '2px' }}
            width={node.attribs.width}
            height={node.attribs.height}
            src={node.attribs.src}
            alt={node.attribs.alt || ''}
            loading="lazy"
          />
        )
      }
    }
  }

  const content = marked(body)

  if (content instanceof Promise) {
    return null // or a loading indicator
  }

  return <div className="break-all">{parse(content, { replace: transformNode })}</div>
}
