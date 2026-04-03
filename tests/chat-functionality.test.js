import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const chatFile = path.join(process.cwd(), 'src', 'components', 'chat', 'LiveChat.tsx');

function parseSource(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function findExportedFunction(sourceFile, name) {
  let found = null;
  ts.forEachChild(sourceFile, (node) => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === name &&
      node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      found = node;
    }
  });
  return found;
}

function walk(node, predicate) {
  if (predicate(node)) return true;
  return ts.forEachChild(node, (child) => walk(child, predicate)) || false;
}

test('LiveChat component file exists', () => {
  assert.ok(fs.existsSync(chatFile), 'LiveChat.tsx file should exist');
});

test('LiveChat has exported component and portal rendering', () => {
  const source = parseSource(chatFile);
  const component = findExportedFunction(source, 'LiveChat');

  assert.ok(component, 'LiveChat should be exported as a function component');

  const usesPortal = walk(source, (node) => {
    return (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'createPortal'
    );
  });

  assert.ok(usesPortal, 'LiveChat should render via createPortal');
});

test('LiveChat returns null when closed', () => {
  const source = parseSource(chatFile);
  const component = findExportedFunction(source, 'LiveChat');
  assert.ok(component?.body, 'LiveChat function body should exist');

  const hasClosedGuard = walk(component.body, (node) => {
    if (!ts.isIfStatement(node)) return false;
    if (!ts.isPrefixUnaryExpression(node.expression)) return false;
    if (node.expression.operator !== ts.SyntaxKind.ExclamationToken) return false;
    if (!ts.isIdentifier(node.expression.operand) || node.expression.operand.text !== 'isOpen')
      return false;
    return (
      ts.isReturnStatement(node.thenStatement) &&
      node.thenStatement.expression?.kind === ts.SyntaxKind.NullKeyword
    );
  });

  assert.ok(hasClosedGuard, 'LiveChat should short-circuit and return null when isOpen is false');
});

test('LiveChat includes accessibility attributes', () => {
  const source = parseSource(chatFile);

  const hasAriaLabel = walk(source, (node) => {
    return ts.isJsxAttribute(node) && node.name.text === 'aria-label';
  });

  assert.ok(hasAriaLabel, 'LiveChat should include at least one aria-label attribute');
});
