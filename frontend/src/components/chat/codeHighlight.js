/**
 * Highlighter ringan (~2 KB) untuk CodeBlock. Tidak memakai library besar:
 * satu regex master per bahasa dengan named group, lalu potongan teks biasa
 * di antaranya. Aman untuk blok panjang dan cukup cepat di CPU Celeron.
 */

const KEYWORDS = {
  js: [
    "const", "let", "var", "function", "return", "if", "else", "for", "while", "do",
    "switch", "case", "break", "continue", "new", "class", "extends", "super", "this",
    "import", "from", "export", "default", "async", "await", "try", "catch", "finally",
    "throw", "typeof", "instanceof", "in", "of", "delete", "void", "yield", "static",
    "get", "set", "true", "false", "null", "undefined",
  ],
  ts: [
    "const", "let", "var", "function", "return", "if", "else", "for", "while", "do",
    "switch", "case", "break", "continue", "new", "class", "extends", "implements",
    "interface", "type", "enum", "namespace", "import", "from", "export", "default",
    "async", "await", "try", "catch", "finally", "throw", "typeof", "keyof", "as",
    "readonly", "public", "private", "protected", "static", "abstract", "declare",
    "true", "false", "null", "undefined", "void", "never", "unknown", "any",
  ],
  py: [
    "def", "class", "return", "if", "elif", "else", "for", "while", "break", "continue",
    "import", "from", "as", "with", "try", "except", "finally", "raise", "pass", "lambda",
    "yield", "global", "nonlocal", "assert", "del", "in", "is", "not", "and", "or",
    "async", "await", "True", "False", "None",
  ],
  bash: [
    "if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac",
    "function", "return", "in", "export", "local", "readonly", "declare", "source",
    "alias", "unset", "shift", "exit", "echo", "cd", "sudo", "curl", "git", "npm",
  ],
  yaml: ["true", "false", "null", "yes", "no", "on", "off"],
  sql: [
    "select", "from", "where", "insert", "into", "values", "update", "set", "delete",
    "create", "table", "alter", "drop", "index", "join", "left", "right", "inner",
    "outer", "on", "group", "by", "order", "having", "limit", "offset", "as", "and",
    "or", "not", "null", "is", "in", "like", "between", "distinct", "union", "all",
    "primary", "key", "foreign", "references", "default", "case", "when", "then",
    "else", "end", "with", "returning",
  ],
  rust: [
    "fn", "let", "mut", "const", "static", "struct", "enum", "impl", "trait", "pub",
    "use", "mod", "crate", "super", "self", "match", "if", "else", "for", "while",
    "loop", "return", "break", "continue", "move", "ref", "where", "async", "await",
    "dyn", "type", "unsafe", "true", "false", "Some", "None", "Ok", "Err",
  ],
};

const ALIASES = {
  javascript: "js",
  jsx: "js",
  mjs: "js",
  cjs: "js",
  node: "js",
  typescript: "ts",
  tsx: "ts",
  python: "py",
  py3: "py",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  yml: "yaml",
  rs: "rust",
  xml: "html",
  htm: "html",
  hjson: "json",
  postgres: "sql",
  postgresql: "sql",
  mysql: "sql",
  sqlite: "sql",
};

export const LANG_LABEL = {
  js: "JavaScript",
  ts: "TypeScript",
  py: "Python",
  bash: "Bash",
  json: "JSON",
  html: "HTML",
  css: "CSS",
  yaml: "YAML",
  sql: "SQL",
  rust: "Rust",
  text: "Teks",
};

const COMMENTS = {
  js: String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`,
  ts: String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`,
  py: String.raw`#[^\n]*`,
  bash: String.raw`#[^\n]*`,
  yaml: String.raw`#[^\n]*`,
  sql: String.raw`--[^\n]*|\/\*[\s\S]*?\*\/`,
  rust: String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`,
  css: String.raw`\/\*[\s\S]*?\*\/`,
  html: String.raw`<!--[\s\S]*?-->`,
};

const STRINGS = {
  js: String.raw`\x60(?:\\[\s\S]|[^\x60\\])*\x60|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'`,
  ts: String.raw`\x60(?:\\[\s\S]|[^\x60\\])*\x60|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'`,
  py: String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'`,
  bash: String.raw`"(?:\\.|[^"\\])*"|'[^']*'`,
  yaml: String.raw`"(?:\\.|[^"\\])*"|'[^']*'`,
  sql: String.raw`'(?:''|[^'])*'`,
  rust: String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'`,
  css: String.raw`"(?:\\.|[^"\\])*"|'[^']*'`,
  html: String.raw`"(?:\\.|[^"\\])*"|'[^']*'`,
  json: String.raw`"(?:\\[\s\S]|[^"\\])*"`,
};

const NUMBERS = {
  js: String.raw`0x[0-9a-fA-F]+|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b`,
  ts: String.raw`0x[0-9a-fA-F]+|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b`,
  py: String.raw`0x[0-9a-fA-F]+|\b\d+(?:\.\d+)?\b`,
  bash: String.raw`\b\d+(?:\.\d+)?\b`,
  yaml: String.raw`\b\d+(?:\.\d+)?\b`,
  sql: String.raw`\b\d+(?:\.\d+)?\b`,
  rust: String.raw`0x[0-9a-fA-F_]+|\b\d[\d_]*(?:\.\d+)?\b`,
  css: String.raw`#[0-9a-fA-F]{3,8}|\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg)?`,
  html: String.raw`\b\d+(?:\.\d+)?\b`,
  json: String.raw`-?\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b`,
};

const EXTRA = {
  html: String.raw`<\/?[a-zA-Z][\w:-]*`,
  css: String.raw`@[\w-]+|[.#][\w-]+`,
  bash: String.raw`\$\{[^}]*\}|\$\w+`,
  yaml: String.raw`^[ \t-]*[\w./-]+(?=\s*:)`,
  json: String.raw`"(?:\\[\s\S]|[^"\\])*"(?=\s*:)`,
};

function escapeWord(word) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const cache = new Map();

export function normalizeLang(raw) {
  const key = String(raw || "").toLowerCase().trim();
  if (!key) return "text";
  if (LANG_LABEL[key]) return key;
  return ALIASES[key] ?? "text";
}

function buildRegex(lang) {
  if (cache.has(lang)) return cache.get(lang);
  const parts = [];
  if (COMMENTS[lang]) parts.push(`(?<comment>${COMMENTS[lang]})`);
  if (STRINGS[lang]) parts.push(`(?<string>${STRINGS[lang]})`);
  if (EXTRA[lang]) parts.push(`(?<attr>${EXTRA[lang]})`);
  if (NUMBERS[lang]) parts.push(`(?<number>${NUMBERS[lang]})`);
  if (KEYWORDS[lang]) {
    const words = KEYWORDS[lang].map(escapeWord).join("|");
    parts.push(`(?<keyword>\\b(?:${words})\\b)`);
  }
  if (["js", "ts", "py", "rust", "css"].includes(lang)) {
    parts.push(`(?<fn>[A-Za-z_$][\w$]*(?=\\s*\\())`);
  }
  const flags = lang === "yaml" || lang === "py" ? "gm" : "g";
  const regex = parts.length ? new RegExp(parts.join("|"), flags) : null;
  cache.set(lang, regex);
  return regex;
}

export function highlight(code, rawLang) {
  const lang = normalizeLang(rawLang);
  const regex = buildRegex(lang);
  if (!regex) return [{ text: code, type: "plain" }];

  const tokens = [];
  let last = 0;
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(code)) !== null) {
    if (match.index > last) {
      tokens.push({ text: code.slice(last, match.index), type: "plain" });
    }
    const groups = match.groups || {};
    const type = Object.keys(groups).find((key) => groups[key] !== undefined) || "plain";
    tokens.push({ text: match[0], type });
    last = match.index + match[0].length;
    if (match[0].length === 0) regex.lastIndex += 1;
  }
  if (last < code.length) {
    tokens.push({ text: code.slice(last), type: "plain" });
  }
  return tokens;
}
