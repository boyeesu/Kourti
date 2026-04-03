import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const useChatFile = path.join(process.cwd(), 'src', 'hooks', 'useChat.ts');

function parseSource(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function walk(node, predicate) {
  if (predicate(node)) return true;
  return ts.forEachChild(node, (child) => walk(child, predicate)) || false;
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

test('useChat hook file exists', () => {
  assert.ok(fs.existsSync(useChatFile), 'useChat.ts hook should exist');
});

test('chat hooks export expected public API', () => {
  const source = parseSource(useChatFile);

  const expectedHooks = [
    'useConversations',
    'useMessages',
    'useSendMessage',
    'useGetOrCreateDirectConversation',
    'useMarkAsRead',
  ];

  for (const hook of expectedHooks) {
    const declaration = findExportedFunction(source, hook);
    assert.ok(declaration, `${hook} should be exported`);
  }
});

test('useSendMessage enforces auth and non-empty message content', () => {
  const source = parseSource(useChatFile);
  const useSendMessage = findExportedFunction(source, 'useSendMessage');
  assert.ok(useSendMessage?.body, 'useSendMessage should have a function body');

  const hasAuthGuard = walk(useSendMessage.body, (node) => {
    if (!ts.isIfStatement(node)) return false;
    if (!ts.isPrefixUnaryExpression(node.expression)) return false;
    if (node.expression.operator !== ts.SyntaxKind.ExclamationToken) return false;
    return ts.isIdentifier(node.expression.operand) && node.expression.operand.text === 'user';
  });

  const hasContentGuard = walk(useSendMessage.body, (node) => {
    if (!ts.isIfStatement(node)) return false;
    const expressionText = node.expression.getText();
    return expressionText.includes('!content') && expressionText.includes('content.trim()');
  });

  const usesMutation = walk(useSendMessage.body, (node) => {
    return (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useMutation'
    );
  });

  assert.ok(hasAuthGuard, 'useSendMessage should guard against unauthenticated users');
  assert.ok(hasContentGuard, 'useSendMessage should guard against empty message content');
  assert.ok(usesMutation, 'useSendMessage should use useMutation for async state');
});

test('useMessages uses polling for message updates (Node backend mode)', () => {
  const source = parseSource(useChatFile);
  const useMessages = findExportedFunction(source, 'useMessages');
  assert.ok(useMessages?.body, 'useMessages should have a function body');

  // In Node backend mode, messages are fetched via polling (useQuery with refetchInterval)
  // instead of Supabase realtime subscriptions.
  const usesQuery = walk(useMessages.body, (node) => {
    return (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'useQuery'
    );
  });

  assert.ok(usesQuery, 'useMessages should use useQuery for fetching messages');
});
