import test from "node:test";
import assert from "node:assert/strict";

import { parseExpressionAst } from "../../src/expr/expression-ast.js";

test("parses left-associative matmul chain", () => {
  const ast = parseExpressionAst("L @ R @ O");
  assert.equal(ast.name, "L @ R @ O");
  assert.equal(ast.left.name, "L @ R");
  assert.equal(ast.right.name, "O");
});

test("parses assignment alias", () => {
  const ast = parseExpressionAst("Q = L @ (R @ O)");
  assert.equal(ast.name, "Q");
  assert.equal(ast.left.name, "L");
  assert.equal(ast.right.name, "R @ O");
});

test("rejects invalid tokens", () => {
  assert.throws(() => parseExpressionAst("L + R"), /unexpected character/);
});
