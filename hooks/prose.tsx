import type { Elements, RenderElement, RenderNode } from 'claude-code'

// ---------------------------------------------------------------------------
// The assistant's prose, redrawn in light orange. Paragraphs, headings, lists,
// quotes and inline marks become coloured text; code blocks keep the app's own
// code drawing and tables its own markdown, so nothing that needs the app's
// layout is lost. The person's own messages and every other row keep the theme.
// ---------------------------------------------------------------------------

export type ProseElements = Pick<Elements['desktop'], 'Box' | 'Text' | 'Link' | 'Code' | 'Markdown'>

export const PROSE = {
  body: '#ffc08a',
  strong: '#ffd6b3',
  quote: '#e3a978',
  marker: '#a682ff',
  rule: '#3a3150',
  code: '#6fd0ff',
  codeBackground: '#1c172e',
} as const

type ListItem = { depth: number; marker: string; text: string }

export type Block =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'list'; items: ListItem[] }
  | { kind: 'code'; language: string; source: string }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' }
  | { kind: 'markdown'; text: string }

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/
const TABLE_ROW = /^\s*\|/
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/
const RAW = /^\s*(<[a-zA-Z!/]|!\[)/

// Strips the indent every line of a fenced block shares (a fence inside a list).
function dedent(lines: string[]): string[] {
  const indents = lines.filter(line => line.trim() !== '').map(line => /^\s*/.exec(line)?.[0].length ?? 0)
  const cut = indents.length === 0 ? 0 : Math.min(...indents)

  return lines.map(line => line.slice(cut))
}

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []

  const endParagraph = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
      paragraph = []
    }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ''
    const fence = FENCE.exec(line)

    if (fence !== null) {
      endParagraph()

      const marker = fence[1] ?? '```'
      const body: string[] = []

      index += 1

      while (index < lines.length && !(lines[index] ?? '').trim().startsWith(marker)) {
        body.push(lines[index] ?? '')
        index += 1
      }

      blocks.push({ kind: 'code', language: fence[2] ?? '', source: dedent(body).join('\n') })
      continue
    }

    if (line.trim() === '') {
      endParagraph()
      continue
    }

    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[index + 1] ?? '')) {
      endParagraph()

      const rows: string[] = []

      while (index < lines.length && TABLE_ROW.test(lines[index] ?? '')) {
        rows.push(lines[index] ?? '')
        index += 1
      }

      index -= 1
      blocks.push({ kind: 'markdown', text: rows.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)

    if (heading !== null) {
      endParagraph()
      blocks.push({ kind: 'heading', level: (heading[1] ?? '#').length, text: heading[2] ?? '' })
      continue
    }

    if (RULE.test(line)) {
      endParagraph()
      blocks.push({ kind: 'rule' })
      continue
    }

    const last = blocks[blocks.length - 1]
    const quote = QUOTE.exec(line)

    if (quote !== null) {
      endParagraph()

      if (last?.kind === 'quote') {
        last.text += ` ${quote[1] ?? ''}`
      } else {
        blocks.push({ kind: 'quote', text: quote[1] ?? '' })
      }

      continue
    }

    const item = ITEM.exec(line)

    if (item !== null) {
      endParagraph()

      const entry: ListItem = {
        depth: Math.min(3, Math.floor((item[1] ?? '').replace(/\t/g, '  ').length / 2)),
        marker: item[2] ?? '-',
        text: item[3] ?? '',
      }

      if (last?.kind === 'list') {
        last.items.push(entry)
      } else {
        blocks.push({ kind: 'list', items: [entry] })
      }

      continue
    }

    if (RAW.test(line)) {
      endParagraph()
      blocks.push({ kind: 'markdown', text: line })
      continue
    }

    // A line indented under a list item carries on that item.
    if (paragraph.length === 0 && last?.kind === 'list' && /^\s+\S/.test(line)) {
      const lastItem = last.items[last.items.length - 1]

      if (lastItem !== undefined) {
        lastItem.text += ` ${line.trim()}`
        continue
      }
    }

    paragraph.push(line.trim())
  }

  endParagraph()

  return blocks
}

export type Span = { text: string; bold?: true; italic?: true; code?: true; strike?: true; href?: string }

type Marks = Omit<Span, 'text'>

const CODE_SPAN = /^(`+)([\s\S]*?[^`])\1(?!`)/
const LINK = /^\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/
const AUTOLINK = /^<(https?:\/\/[^>\s]+)>/
const BOLD = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/
const STRIKE = /^~~(?=\S)([\s\S]*?\S)~~/
const STAR_ITALIC = /^\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/
const UNDERSCORE_ITALIC = /^_(?=\S)([\s\S]*?\S)_(?!\w)/
const ESCAPABLE = /[\\`*_{}[\]()#+\-.!~|>]/

export function parseInline(text: string, marks: Marks = {}): Span[] {
  const spans: Span[] = []
  let plain = ''

  const flush = (): void => {
    if (plain !== '') {
      spans.push({ ...marks, text: plain })
      plain = ''
    }
  }

  let index = 0

  while (index < text.length) {
    const rest = text.slice(index)
    const code = CODE_SPAN.exec(rest)

    if (code !== null) {
      flush()

      const inner = code[2] ?? ''

      spans.push({ ...marks, code: true, text: /^ .* $/.test(inner) ? inner.slice(1, -1) : inner })
      index += code[0].length
      continue
    }

    const link = LINK.exec(rest)

    if (link !== null) {
      flush()
      spans.push(...parseInline(link[1] ?? '', { ...marks, href: link[2] ?? '' }))
      index += link[0].length
      continue
    }

    const autolink = AUTOLINK.exec(rest)

    if (autolink !== null) {
      flush()
      spans.push({ ...marks, href: autolink[1] ?? '', text: autolink[1] ?? '' })
      index += autolink[0].length
      continue
    }

    const bold = BOLD.exec(rest)

    if (bold !== null) {
      flush()
      spans.push(...parseInline(bold[2] ?? '', { ...marks, bold: true }))
      index += bold[0].length
      continue
    }

    const strike = STRIKE.exec(rest)

    if (strike !== null) {
      flush()
      spans.push(...parseInline(strike[1] ?? '', { ...marks, strike: true }))
      index += strike[0].length
      continue
    }

    // An underscore opens emphasis only at a word's edge, never inside snake_case.
    const isWordEdge = index === 0 || !/\w/.test(text[index - 1] ?? '')
    const italic = STAR_ITALIC.exec(rest) ?? (isWordEdge ? UNDERSCORE_ITALIC.exec(rest) : null)

    if (italic !== null) {
      flush()
      spans.push(...parseInline(italic[1] ?? '', { ...marks, italic: true }))
      index += italic[0].length
      continue
    }

    if (rest[0] === '\\' && ESCAPABLE.test(rest[1] ?? '')) {
      plain += rest[1]
      index += 2
      continue
    }

    plain += rest[0]
    index += 1
  }

  flush()

  return spans
}

function inline(text: string, colour: string, el: ProseElements): RenderNode[] {
  const { Text, Link } = el

  return parseInline(text).map(span => {
    if (span.code === true) {
      return (
        <Text mono color={PROSE.code} backgroundColor={PROSE.codeBackground}>
          {span.text}
        </Text>
      )
    }

    if (span.href !== undefined) {
      return <Link href={span.href}>{span.text}</Link>
    }

    const marks: { bold?: boolean; italic?: boolean; strikethrough?: boolean } = {}

    if (span.bold === true) {
      marks.bold = true
    }

    if (span.italic === true) {
      marks.italic = true
    }

    if (span.strike === true) {
      marks.strikethrough = true
    }

    return (
      <Text color={span.bold === true ? PROSE.strong : colour} {...marks}>
        {span.text}
      </Text>
    )
  })
}

const BULLETS = ['•', '◦', '▪', '▫'] as const

function block(item: Block, el: ProseElements): RenderElement {
  const { Box, Text, Code, Markdown } = el

  switch (item.kind) {
    case 'paragraph':
      return <Text color={PROSE.body}>{inline(item.text, PROSE.body, el)}</Text>

    case 'heading':
      return (
        <Text color={PROSE.strong} weight="semibold" size={item.level <= 2 ? 'heading' : 'body'}>
          {inline(item.text, PROSE.strong, el)}
        </Text>
      )

    case 'list':
      return (
        <Box flexDirection="column" gap="xs">
          {item.items.map(entry => (
            <Box flexDirection="row" marginLeft={entry.depth * 2}>
              <Text color={PROSE.marker}>
                {/^\d/.test(entry.marker) ? `${entry.marker} ` : `${BULLETS[entry.depth] ?? '•'} `}
              </Text>
              <Box flexShrink={1} flexGrow={1}>
                <Text color={PROSE.body}>{inline(entry.text, PROSE.body, el)}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      )

    case 'code':
      return item.language === '' ? <Code source={item.source} /> : <Code source={item.source} language={item.language} />

    case 'quote':
      return (
        <Box flexDirection="row">
          <Text color={PROSE.marker}>▎ </Text>
          <Box flexShrink={1} flexGrow={1}>
            <Text color={PROSE.quote} italic>
              {inline(item.text, PROSE.quote, el)}
            </Text>
          </Box>
        </Box>
      )

    case 'rule':
      return <Text color={PROSE.rule}>────────────────────────</Text>

    case 'markdown':
      return <Markdown text={item.text} />
  }
}

export function renderProse(markdown: string, el: ProseElements): RenderElement {
  const { Box } = el

  return (
    <Box flexDirection="column" gap="md">
      {parseBlocks(markdown).map(item => block(item, el))}
    </Box>
  )
}
