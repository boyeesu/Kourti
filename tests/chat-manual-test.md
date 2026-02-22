# Live Chat Manual Test Guide

This document provides step-by-step instructions for manually testing the Live Chat functionality to ensure it doesn't freeze the UI and that message sending/receiving works correctly.

## Prerequisites

1. Start the development server: `npm run dev`
2. Log in to the application
3. Ensure you have a browser with developer tools open (F12)
4. **For send/receive tests:** Have at least 2 user accounts in the same organization

## Test Scenarios

---
## SECTION A: UI Interaction Tests
---

### Test 1: Opening Chat from Sidebar (Desktop)

**Steps:**
1. Navigate to any page in the application (e.g., Dashboard)
2. In the left sidebar, locate the "Live Chat" menu item (under "Workspace" section)
3. Click on "Live Chat"
4. **Expected Result:**
   - Chat modal should slide in from the right
   - Sidebar should remain visible and clickable
   - Other menu items in the sidebar should still be clickable
   - Main content area should be covered by chat overlay
   - Close button (X) should be visible in top-right of chat

**Verify:**
- ✅ Sidebar menu items are still clickable
- ✅ You can navigate to other pages while chat is open
- ✅ Chat doesn't block sidebar interactions
- ✅ Backdrop only covers main content area, not sidebar

### Test 2: Opening Chat from Mobile Navigation

**Steps:**
1. Resize browser to mobile viewport (< 768px) or use mobile device
2. Open the mobile navigation menu
3. Click on "Live Chat"
4. **Expected Result:**
   - Chat modal should open full screen
   - Mobile navigation should close
   - Close button should be visible

**Verify:**
- ✅ Chat opens without freezing
- ✅ Close button works
- ✅ Can navigate back

### Test 3: Closing Chat

**Steps:**
1. Open chat using any method above
2. Click the X button in the top-right corner
3. **Alternative:** Click on the backdrop (main content area)
4. **Expected Result:**
   - Chat should close smoothly
   - UI should return to normal state
   - All menu items should be clickable again

**Verify:**
- ✅ Chat closes without errors
- ✅ No UI freezing after closing
- ✅ Body scroll is restored

### Test 4: Sidebar Interaction While Chat is Open

**Steps:**
1. Open the chat
2. While chat is open, try clicking on other sidebar menu items:
   - Dashboard
   - Matters
   - Clients
   - Calendar
   - Documents
   - Settings
3. **Expected Result:**
   - Each menu item should be clickable
   - Navigation should work normally
   - Chat should remain open (or close if navigating away, depending on implementation)

**Verify:**
- ✅ No UI freezing
- ✅ All sidebar interactions work
- ✅ Navigation is responsive

### Test 5: Multiple Open/Close Cycles

**Steps:**
1. Open chat
2. Close chat
3. Repeat 5-10 times rapidly
4. **Expected Result:**
   - No performance degradation
   - No memory leaks
   - UI remains responsive

**Verify:**
- ✅ No console errors
- ✅ No visual glitches
- ✅ Smooth animations

### Test 6: Browser Console Check

**Steps:**
1. Open browser developer tools (F12)
2. Go to Console tab
3. Open and close chat multiple times
4. **Expected Result:**
   - No JavaScript errors
   - No React warnings
   - No memory leak warnings

**Verify:**
- ✅ No errors in console
- ✅ No warnings about missing keys
- ✅ No portal-related errors

---
## SECTION B: Message Send/Receive Tests
---

### Test 7: Creating a New Conversation

**Steps:**
1. Open the Live Chat
2. Click the "+" button or "Start New Conversation" button
3. Select a user to chat with from the dialog
4. **Expected Result:**
   - New Chat Dialog should open
   - User list should show available users
   - Selecting a user creates/opens conversation
   - Conversation appears in sidebar

**Verify:**
- ✅ Dialog opens without errors
- ✅ User list loads
- ✅ Conversation is created
- ✅ Redirects to new conversation

### Test 8: Sending a Message

**Steps:**
1. Open an existing conversation or create a new one
2. Type a message in the text area
3. Click the Send button (or press Enter)
4. **Expected Result:**
   - Message appears in the chat immediately
   - Message shows with your avatar
   - Timestamp shows "just now" or similar
   - Input field clears after sending

**Verify:**
- ✅ Message appears in chat
- ✅ Send button disables while sending
- ✅ Input clears after send
- ✅ No console errors

### Test 9: Sending with Enter Key

**Steps:**
1. Type a message
2. Press Enter key
3. **Expected Result:**
   - Message sends immediately
   - Input clears

**Steps for Multi-line:**
1. Type partial message
2. Press Shift+Enter
3. **Expected Result:**
   - New line is added (NOT sent)
   - Can continue typing

**Verify:**
- ✅ Enter sends message
- ✅ Shift+Enter adds new line

### Test 10: Receiving Messages (Real-time)

**Prerequisites:** Two browser windows with different users logged in

**Steps:**
1. User A: Open conversation with User B
2. User B: Open same conversation
3. User A: Send a message
4. **Expected Result (User B):**
   - Message appears without page refresh
   - Message shows User A's avatar
   - Notification badge updates

**Steps for Background:**
1. User B: Navigate away from chat (close chat or go to different page)
2. User A: Send a message
3. User B: Check sidebar unread badge
4. **Expected Result:**
   - Unread count badge shows on conversation
   - Badge shows correct count

**Verify:**
- ✅ Real-time message delivery
- ✅ Unread badge updates
- ✅ No page refresh needed

### Test 11: Message Send Error Handling

**Steps:**
1. Open a conversation
2. Disconnect network (airplane mode or disable WiFi)
3. Try to send a message
4. **Expected Result:**
   - Error toast appears with "Failed to send message"
   - Message text is restored in input (not lost)
   - Send button re-enables

**Verify:**
- ✅ Error message shown
- ✅ Message content preserved
- ✅ Can retry after reconnecting

### Test 12: Empty Message Prevention

**Steps:**
1. Open a conversation
2. Leave input empty and click Send
3. Type only spaces and click Send
4. **Expected Result:**
   - Send button should be disabled
   - No empty messages sent

**Verify:**
- ✅ Cannot send empty message
- ✅ Cannot send whitespace-only message

### Test 13: Long Message Handling

**Steps:**
1. Type a very long message (500+ characters)
2. Send the message
3. **Expected Result:**
   - Message sends successfully
   - Message displays with proper wrapping
   - No UI overflow issues

**Verify:**
- ✅ Long messages send
- ✅ Text wraps properly
- ✅ No horizontal scroll

### Test 14: Message List Auto-Scroll

**Steps:**
1. Open a conversation with many messages
2. Scroll up to read older messages
3. Send a new message
4. **Expected Result:**
   - Chat scrolls to bottom after sending
   - New message is visible

**Alternative Test:**
1. Have another user send you a message
2. **Expected Result:**
   - Chat scrolls to show new message

**Verify:**
- ✅ Auto-scroll on send
- ✅ Auto-scroll on receive

### Test 15: Mark as Read

**Steps:**
1. Have User A send messages to User B
2. User B: Check unread badge appears
3. User B: Open the conversation
4. **Expected Result:**
   - Unread badge clears
   - Messages marked as read

**Verify:**
- ✅ Badge clears on open
- ✅ Badge updates in real-time

### Test 16: Conversation Search

**Steps:**
1. Open Live Chat
2. In the search box, type part of a user's name
3. **Expected Result:**
   - Conversation list filters
   - Shows only matching conversations

**Verify:**
- ✅ Search filters correctly
- ✅ Can search by name
- ✅ Clear search shows all

---
## SECTION C: Edge Cases & Known Issues
---

## Known Issues to Check

### Issue: UI Freezing
**Symptoms:**
- Clicking "Live Chat" freezes the entire UI
- Cannot click any menu items
- Cannot interact with sidebar

**Root Cause (Fixed):**
- Backdrop was using `fixed inset-0` which covered entire screen
- Backdrop was blocking pointer events on sidebar

**Fix Applied:**
- Changed backdrop positioning from `inset-0` to `top-0 right-0 bottom-0` with `left-[220px]` on desktop
- This ensures backdrop only covers main content area, not sidebar

## Automated Test Commands

Run all automated tests:
```bash
npm test
```

Run UI/component tests:
```bash
node --test tests/chat-functionality.test.js
```

Run send/receive logic tests:
```bash
node --test tests/chat-send-receive.test.js
```

Run all chat tests:
```bash
node --test tests/chat-functionality.test.js tests/chat-send-receive.test.js
```

## Reporting Issues

If you encounter any issues during testing:

1. Note the exact steps to reproduce
2. Check browser console for errors
3. Note browser and OS version
4. Take screenshots if possible
5. Report with:
   - Test scenario number
   - Steps taken
   - Expected vs actual behavior
   - Console errors (if any)
