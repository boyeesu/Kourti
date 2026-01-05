import { useState, useCallback } from 'react';

export interface ChatWidgetState {
  isOpen: boolean;
  isMinimized: boolean;
  unreadCount: number;
  documentContext: {
    id: string;
    title: string;
    content?: string;
  } | null;
}

export function useChatWidget() {
  const [state, setState] = useState<ChatWidgetState>({
    isOpen: false,
    isMinimized: false,
    unreadCount: 0,
    documentContext: null,
  });

  const open = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: true,
      isMinimized: false,
      unreadCount: 0,
    }));
  }, []);

  const close = useCallback(() => {
    setState(prev => ({
      ...prev,
      isOpen: false,
      isMinimized: false,
      unreadCount: 0,
    }));
  }, []);

  const minimize = useCallback(() => {
    setState(prev => ({
      ...prev,
      isMinimized: true,
    }));
  }, []);

  const maximize = useCallback(() => {
    setState(prev => ({
      ...prev,
      isMinimized: false,
      unreadCount: 0,
    }));
  }, []);

  const incrementUnread = useCallback(() => {
    setState(prev => ({
      ...prev,
      unreadCount: prev.unreadCount + 1,
    }));
  }, []);

  const setDocumentContext = useCallback((context: ChatWidgetState['documentContext']) => {
    setState(prev => ({
      ...prev,
      documentContext: context,
    }));
  }, []);

  return {
    ...state,
    open,
    close,
    minimize,
    maximize,
    incrementUnread,
    setDocumentContext,
  };
}

