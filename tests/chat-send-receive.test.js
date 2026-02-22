import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Chat Send/Receive Functionality Tests
 * 
 * These tests verify the chat message sending and receiving logic.
 * Since these involve Supabase calls, we test the structure and logic flow.
 * 
 * For actual E2E testing, see tests/chat-manual-test.md
 */

const useChatFile = path.join(process.cwd(), 'src', 'hooks', 'useChat.ts');
const chatWindowFile = path.join(process.cwd(), 'src', 'components', 'chat', 'ChatWindow.tsx');
const chatSidebarFile = path.join(process.cwd(), 'src', 'components', 'chat', 'ChatSidebar.tsx');
const newChatDialogFile = path.join(process.cwd(), 'src', 'components', 'chat', 'NewChatDialog.tsx');

test('useChat hook file exists', () => {
  assert.ok(fs.existsSync(useChatFile), 'useChat.ts hook should exist');
});

test('useChat exports useSendMessage hook', () => {
  const content = fs.readFileSync(useChatFile, 'utf-8');
  
  // Check export exists
  assert.ok(
    content.includes('export function useSendMessage'),
    'useSendMessage should be exported'
  );
  
  // Check it uses useMutation for async state management
  assert.ok(
    content.includes('useMutation'),
    'useSendMessage should use useMutation for async operations'
  );
});

test('useSendMessage validates user authentication', () => {
  const content = fs.readFileSync(useChatFile, 'utf-8');
  
  // Find the useSendMessage function section
  const sendMessageSection = content.substring(
    content.indexOf('export function useSendMessage'),
    content.indexOf('export function useGetOrCreateDirectConversation')
  );
  
  assert.ok(
    sendMessageSection.includes('!user') || sendMessageSection.includes('User not authenticated'),
    'useSendMessage should check for user authentication'
  );
});

test('useSendMessage validates message content', () => {
  const content = fs.readFileSync(useChatFile, 'utf-8');
  
  const sendMessageSection = content.substring(
    content.indexOf('export function useSendMessage'),
    content.indexOf('export function useGetOrCreateDirectConversation')
  );
  
  assert.ok(
    sendMessageSection.includes('content') && 
    (sendMessageSection.includes('trim()') || sendMessageSection.includes('empty')),
    'useSendMessage should validate message content is not empty'
  );
});

test('useSendMessage inserts message to Supabase', () => {
  const content = fs.readFileSync(useChatFile, 'utf-8');
  
  const sendMessageSection = content.substring(
    content.indexOf('export function useSendMessage'),
    content.indexOf('export function useGetOrCreateDirectConversation')
  );
  
  assert.ok(
    sendMessageSection.includes("from('messages'") || 
    sendMessageSection.includes(".insert("),
    'useSendMessage should insert message to messages table'
  );
});

test('useMessages has realtime subscription', () => {
  const content = fs.readFileSync(useChatFile, 'utf-8');
  
  const messagesSection = content.substring(
    content.indexOf('export function useMessages'),
    content.indexOf('export function useSendMessage')
  );
  
  assert.ok(
    messagesSection.includes('.channel(') && 
    messagesSection.includes('postgres_changes'),
    'useMessages should have realtime subscription for new messages'
  );
  
  assert.ok(
    messagesSection.includes("event: 'INSERT'"),
    'useMessages should listen for INSERT events'
  );
});

test('useMessages handles cleanup on unmount', () => {
  const content = fs.readFileSync(useChatFile, 'utf-8');
  
  const messagesSection = content.substring(
    content.indexOf('export function useMessages'),
    content.indexOf('export function useSendMessage')
  );
  
  assert.ok(
    messagesSection.includes('removeChannel'),
    'useMessages should cleanup channel subscription on unmount'
  );
});

test('ChatWindow handles send button disabled state', () => {
  const content = fs.readFileSync(chatWindowFile, 'utf-8');
  
  assert.ok(
    content.includes('disabled={') && 
    (content.includes('!message.trim()') || content.includes('sendMessage.isPending')),
    'Send button should be disabled when message is empty or sending'
  );
});

test('ChatWindow handles Enter key to send', () => {
  const content = fs.readFileSync(chatWindowFile, 'utf-8');
  
  assert.ok(
    content.includes('onKeyDown') && content.includes("'Enter'"),
    'ChatWindow should handle Enter key to send message'
  );
  
  assert.ok(
    content.includes('!e.shiftKey'),
    'ChatWindow should not send on Shift+Enter (for new line)'
  );
});

test('ChatWindow shows error toast on send failure', () => {
  const content = fs.readFileSync(chatWindowFile, 'utf-8');
  
  assert.ok(
    content.includes('useToast') || content.includes('toast('),
    'ChatWindow should use toast notifications'
  );
  
  assert.ok(
    content.includes('Failed to send message') || content.includes('destructive'),
    'ChatWindow should show error message on send failure'
  );
});

test('ChatWindow restores message on send error', () => {
  const content = fs.readFileSync(chatWindowFile, 'utf-8');
  
  // Find the handleSend function
  const hasErrorRecovery = content.includes('setMessage(content)') || 
    content.includes('// Restore message');
  
  assert.ok(
    hasErrorRecovery,
    'ChatWindow should restore message content if send fails'
  );
});

test('ChatWindow auto-scrolls on new messages', () => {
  const content = fs.readFileSync(chatWindowFile, 'utf-8');
  
  assert.ok(
    content.includes('scrollRef') || content.includes('scrollTop'),
    'ChatWindow should have scroll management'
  );
  
  assert.ok(
    content.includes('scrollHeight'),
    'ChatWindow should auto-scroll to bottom on new messages'
  );
});

test('ChatSidebar fetches conversations', () => {
  const content = fs.readFileSync(chatSidebarFile, 'utf-8');
  
  assert.ok(
    content.includes('useConversations'),
    'ChatSidebar should use useConversations hook'
  );
});

test('ChatSidebar shows unread badge', () => {
  const content = fs.readFileSync(chatSidebarFile, 'utf-8');
  
  assert.ok(
    content.includes('unread_count') || content.includes('unreadCount'),
    'ChatSidebar should track unread count'
  );
  
  assert.ok(
    content.includes('Badge'),
    'ChatSidebar should show Badge for unread messages'
  );
});

test('useConversations fetches user conversations', () => {
  const content = fs.readFileSync(useChatFile, 'utf-8');
  
  assert.ok(
    content.includes('export function useConversations'),
    'useConversations should be exported'
  );
  
  assert.ok(
    content.includes('conversation_participants'),
    'useConversations should query conversation_participants'
  );
});

test('useMarkAsRead updates last_read_at', () => {
  const content = fs.readFileSync(useChatFile, 'utf-8');
  
  assert.ok(
    content.includes('export function useMarkAsRead'),
    'useMarkAsRead should be exported'
  );
  
  assert.ok(
    content.includes('last_read_at'),
    'useMarkAsRead should update last_read_at timestamp'
  );
});

test('NewChatDialog creates conversation', () => {
  assert.ok(fs.existsSync(newChatDialogFile), 'NewChatDialog.tsx should exist');
  
  const content = fs.readFileSync(newChatDialogFile, 'utf-8');
  
  assert.ok(
    content.includes('useGetOrCreateDirectConversation'),
    'NewChatDialog should use useGetOrCreateDirectConversation hook'
  );
});

test('Message type definitions are complete', () => {
  const content = fs.readFileSync(useChatFile, 'utf-8');
  
  // Check Message interface
  assert.ok(content.includes('export interface Message'), 'Message interface should be exported');
  assert.ok(content.includes('id: string'), 'Message should have id');
  assert.ok(content.includes('conversation_id'), 'Message should have conversation_id');
  assert.ok(content.includes('sender_id'), 'Message should have sender_id');
  assert.ok(content.includes('content: string'), 'Message should have content');
  assert.ok(content.includes('created_at'), 'Message should have created_at');
  
  // Check Conversation interface  
  assert.ok(content.includes('export interface Conversation'), 'Conversation interface should be exported');
  assert.ok(content.includes('participants'), 'Conversation should have participants');
  assert.ok(content.includes('last_message'), 'Conversation should have last_message');
});
