import { memo } from "react";

import CodeBlock from "./CodeBlock.jsx";

/**
 * Markdown renderer kecil dan aman: seluruh hasil dirakit sebagai elemen React,
 * tidak pernah lewat dangerouslySetInnerHTML, jadi HTML/JS dari model tetap teks.
 * URL divalidasi: hanya http(s), mailto, path relatif, dan anchor.
 */

const BLOCK_START = /^(#{1,6}\s|```|~~~|>\s?|\s*([-*+]|\d+[.)])\s|(-{3,}|\*{3,}|_{3,})\s*$)/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/;

function safeHref(url) {
  const value = String(url || "").trim();
  if (!value) return null;
  if (/^(https?:\/\/|mailto:)/i.test(value)) return value;
  if (value.startsWith("/") || value.startsWith("#")) return value;
  return null;
}

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]*\))/g;

export function renderInline(text, keyPrefix = "i") {
  const source = String(text ?? "");
  const nodes = [];
  let last = 0;
  let match;
  INLINE.lastIndex = 0;
  let index = 0;

  while ((match = INLINE.exec(source)) !== null) {
    if (match.index > last) nodes.push(source.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${index++}`;

    if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("~~")) {
      nodes.push(<del key={key}>{token.slice(2, -2)}</del>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="md-code">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]*)\)$/.exec(token);
      const href = linkMatch ? safeHref(linkMatch[2]) : null;
      if (href) {
        nodes.push(
          <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else if (token.startsWith("*") || token.startsWith("_")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      nodes.push(token);
    }
    last = match.index + token.length;
  }
  if (last < source.length) nodes.push(source.slice(last));
  return nodes;
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function buildList(items, index, indent) {
  const ordered = items[index].ordered;
  const children = [];
  let cursor = index;

  while (cursor < items.length && items[cursor].indent === indent) {
    const item = items[cursor];
    cursor += 1;
    let nested = null;
    if (cursor < items.length && items[cursor].indent > indent) {
      const child = buildList(items, cursor, items[cursor].indent);
      nested = child.node;
      cursor = child.next;
    }
    children.push(
      <li key={`li-${cursor}-${children.length}`}>
        {renderInline(item.text, `li-${cursor}`)}
        {nested}
      </li>,
    );
  }

  const Tag = ordered ? "ol" : "ul";
  return { node: <Tag key={`list-${index}`}>{children}</Tag>, next: cursor };
}

function renderBlockquote(lines, key) {
  return (
    <blockquote key={key} className="md-quote">
      {parseBlocks(lines, `${key}-bq`)}
    </blockquote>
  );
}

function parseBlocks(text, prefix = "b") {
  const lines = String(text ?? "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  let blockIndex = 0;
  const nextKey = () => `${prefix}-${blockIndex++}`;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = /^(\s*)(```|~~~)\s*([\w+-]*)/.exec(line);
    if (fence) {
      const marker = fence[2];
      const lang = fence[3] || "";
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(<CodeBlock key={nextKey()} code={body.join("\n")} lang={lang} />);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const Tag = `h${Math.min(heading[1].length + 2, 6)}`;
      blocks.push(
        <Tag key={nextKey()} className="md-heading">
          {renderInline(heading[2], nextKey())}
        </Tag>,
      );
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={nextKey()} className="md-hr" />);
      i += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push(renderBlockquote(quoteLines, nextKey()));
      continue;
    }

    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      TABLE_DIVIDER.test(lines[i + 1])
    ) {
      const header = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push(
        <div key={nextKey()} className="md-table-wrap">
          <table className="md-table">
            <thead>
              <tr>
                {header.map((cell, index) => (
                  <th key={index}>{renderInline(cell, `th-${index}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {header.map((_, cellIndex) => (
                    <td key={cellIndex}>
                      {renderInline(row[cellIndex] ?? "", `td-${rowIndex}-${cellIndex}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const items = [];
      while (i < lines.length) {
        const item = LIST_ITEM.exec(lines[i]);
        if (!item) {
          if (items.length && /^\s{2,}\S/.test(lines[i]) && !LIST_ITEM.test(lines[i])) {
            items[items.length - 1].text += ` ${lines[i].trim()}`;
            i += 1;
            continue;
          }
          break;
        }
        items.push({
          indent: item[1].replace(/\t/g, "  ").length,
          ordered: /\d/.test(item[2]),
          text: item[3],
        });
        i += 1;
      }
      if (items.length) {
        const minIndent = Math.min(...items.map((item) => item.indent));
        const list = buildList(items, 0, minIndent);
        blocks.push(list.node);
        continue;
      }
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i])) {
      paragraph.push(lines[i]);
      i += 1;
    }
    if (paragraph.length) {
      blocks.push(
        <p key={nextKey()} className="md-p">
          {renderInline(paragraph.join("\n"), nextKey())}
        </p>,
      );
    } else {
      i += 1;
    }
  }

  return blocks;
}

function Markdown({ text }) {
  return <div className="md">{parseBlocks(text)}</div>;
}

export default memo(Markdown);
