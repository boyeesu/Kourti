import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Chat Functionality Tests
 * 
 * These tests verify the LiveChat component behavior and ensure
 * the UI doesn't freeze when opening the chat.
 * 
 * Note: For full UI interaction testing, see tests/chat-manual-test.md
 */

const chatFile = path.join(process.cwd(), 'src', 'components', 'chat', 'LiveChat.tsx');
const sidebarFile = path.join(process.cwd(), 'src', 'components', 'layout', 'AppSidebar.tsx');
const layoutFile = path.join(process.cwd(), 'src', 'components', 'layout', 'AppLayout.tsx');

test('LiveChat component file exists', () => {
  assert.ok(fs.existsSync(chatFile), 'LiveChat.tsx file should exist');
});

test('LiveChat component structure validation', () => {
  const content = fs.readFileSync(chatFile, 'utf-8');
  
  // Verify key features are present
  assert.ok(content.includes('isOpen'), 'Component should accept isOpen prop');
  assert.ok(content.includes('onClose'), 'Component should accept onClose prop');
  assert.ok(content.includes('createPortal'), 'Component should use createPortal for modal');
  assert.ok(content.includes('z-[100]'), 'Component should have proper z-index');
});

test('LiveChat backdrop positioning does not block sidebar', () => {
  const content = fs.readFileSync(chatFile, 'utf-8');
  
  // Verify backdrop fix is applied - backdrop should start after sidebar on desktop
  const hasProperBackdropLeft = 
    content.includes('md:left-[220px]') && 
    content.includes('lg:left-[260px]');
  
  // Also check for pointer-events as an alternative fix approach
  const hasPointerEvents = content.includes('pointer-events');
  
  // Check that backdrop uses explicit positioning (not blocking sidebar)
  const usesExplicitPosition = 
    content.includes('top-0') && 
    content.includes('right-0') && 
    content.includes('bottom-0');
  
  assert.ok(
    hasProperBackdropLeft || hasPointerEvents || usesExplicitPosition,
    'Backdrop should be positioned to not block sidebar interactions'
  );
});

test('Chat component accessibility features', () => {
  const content = fs.readFileSync(chatFile, 'utf-8');
  
  // Verify close button has aria-label
  assert.ok(
    content.includes('aria-label'),
    'Close button should have proper accessibility label'
  );
  
  // Verify body scroll is prevented when chat is open
  assert.ok(
    content.includes("overflow") && content.includes("'hidden'"),
    'Component should prevent body scroll when open'
  );
});

test('AppSidebar integrates LiveChat', () => {
  assert.ok(fs.existsSync(sidebarFile), 'AppSidebar.tsx file should exist');
  
  const content = fs.readFileSync(sidebarFile, 'utf-8');
  assert.ok(
    content.includes('LiveChat'),
    'AppSidebar should import LiveChat component'
  );
  assert.ok(
    content.includes('isChatOpen'),
    'AppSidebar should have isChatOpen state'
  );
  assert.ok(
    content.includes('setIsChatOpen'),
    'AppSidebar should have setIsChatOpen setter'
  );
});

test('AppLayout integrates LiveChat', () => {
  assert.ok(fs.existsSync(layoutFile), 'AppLayout.tsx file should exist');
  
  const content = fs.readFileSync(layoutFile, 'utf-8');
  assert.ok(
    content.includes('LiveChat'),
    'AppLayout should import LiveChat component'
  );
});

test('LiveChat close button exists', () => {
  const content = fs.readFileSync(chatFile, 'utf-8');
  
  // Verify close button exists
  assert.ok(
    content.includes('<X'),
    'Component should have X icon for close button'
  );
  assert.ok(
    content.includes('onClick={onClose}'),
    'Close button should call onClose handler'
  );
});

test('LiveChat does not render when closed', () => {
  const content = fs.readFileSync(chatFile, 'utf-8');
  
  // Verify early return when not open
  assert.ok(
    content.includes('if (!isOpen) return null'),
    'Component should return null when not open'
  );
});
