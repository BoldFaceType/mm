"use strict";

const NAME_RE = /[A-Za-z0-9_.!#$%^&/\[\]-]/;

function isNameChar(ch) {
  return NAME_RE.test(ch);
}

function tokenize(input) {
  const tokens = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (ch === "@" || ch === "(" || ch === ")" || ch === "=") {
      tokens.push({ type: ch, value: ch });
      i += 1;
      continue;
    }

    if (isNameChar(ch)) {
      let j = i + 1;
      while (j < input.length && isNameChar(input[j])) {
        j += 1;
      }
      tokens.push({ type: "NAME", value: input.slice(i, j) });
      i = j;
      continue;
    }

    throw new Error(`unexpected character '${ch}' at ${i}`);
  }

  return tokens;
}

function nodeName(n) {
  return /\s+/.test(n.name) ? `(${n.name})` : n.name;
}

function makeMul(left, right) {
  return {
    left,
    right,
    name: `${left.name} @ ${nodeName(right)}`,
  };
}

function parser(tokens) {
  let pos = 0;

  function peek(type) {
    return tokens[pos] && tokens[pos].type === type;
  }

  function consume(type, label = type) {
    const tok = tokens[pos];
    if (!tok || tok.type !== type) {
      throw new Error(`expected ${label}`);
    }
    pos += 1;
    return tok;
  }

  function parseFactor() {
    if (peek("NAME")) {
      return { name: consume("NAME").value };
    }

    if (peek("(")) {
      consume("(");
      const e = parseMul();
      consume(")");
      return e;
    }

    throw new Error("expected matrix name or parenthesized expression");
  }

  function parseMul() {
    let left = parseFactor();
    while (peek("@")) {
      consume("@");
      const right = parseFactor();
      left = makeMul(left, right);
    }
    return left;
  }

  function parseTop() {
    if (
      tokens.length >= 3 &&
      tokens[0].type === "NAME" &&
      tokens[1].type === "="
    ) {
      const alias = consume("NAME").value;
      consume("=");
      const expr = parseMul();
      expr.name = alias;
      return expr;
    }

    return parseMul();
  }

  const out = parseTop();
  if (pos !== tokens.length) {
    throw new Error("trailing tokens");
  }
  return out;
}

export function parseExpressionAst(expr) {
  const tokens = tokenize(expr);
  if (tokens.length === 0) {
    throw new Error("empty expression");
  }
  return parser(tokens);
}
