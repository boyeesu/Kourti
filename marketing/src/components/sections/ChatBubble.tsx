import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';
import { streamChat, type ChatTurn } from '@/lib/chatApi';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const GREETING: Message = {
  role: 'assistant',
  text: "Hi! I'm MARTHA, Kourti's AI assistant. Ask me about our features, pricing, or how to get started.",
};

const SUGGESTIONS = [
  'What is Kourti?',
  'How does pricing work?',
  'What can MARTHA do?',
  'How do I get started?',
];

const ChatBubble = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([GREETING]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const abortRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to the latest message as content streams in.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Focus the input when the widget opens.
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isOpen]);

  // Cancel any in-flight stream on unmount.
  useEffect(() => () => abortRef.current?.(), []);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isStreaming) return;

    // History = prior turns (exclude the local greeting) for backend context.
    const history: ChatTurn[] = messages
      .filter((_, i) => i !== 0)
      .map((m) => ({ role: m.role, content: m.text }));

    setMessages((prev) => [
      ...prev,
      { role: 'user', text: trimmed },
      { role: 'assistant', text: '' },
    ]);
    setInputValue('');
    setIsStreaming(true);

    abortRef.current = streamChat(trimmed, history, {
      onDelta: (chunk) => {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = {
            role: 'assistant',
            text: next[next.length - 1].text + chunk,
          };
          return next;
        });
      },
      onDone: () => setIsStreaming(false),
      onError: (msg) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          // If nothing streamed yet, replace the empty placeholder with the error.
          next[next.length - 1] = {
            role: 'assistant',
            text:
              last.text ||
              `Sorry, I hit a snag (${msg}). Please try again, or reach us at the contact page.`,
          };
          return next;
        });
        setIsStreaming(false);
      },
    });
  };

  const lastMsg = messages[messages.length - 1];
  const showTyping = isStreaming && lastMsg.role === 'assistant' && lastMsg.text === '';

  return (
    <>
      {/* Chat Widget */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-80 sm:w-96 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="bg-primary/10 px-4 py-3 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-sm text-foreground">MARTHA</div>
                <div className="text-xs text-muted-foreground">
                  {isStreaming ? 'Typing…' : 'AI Assistant · Online'}
                </div>
              </div>
            </div>
            <button
              className="h-8 w-8 rounded-lg hover:bg-muted inline-flex items-center justify-center"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="h-80 overflow-y-auto p-4 space-y-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={
                    message.role === 'user'
                      ? 'chat-bubble-user max-w-[85%]'
                      : 'chat-bubble-agent max-w-[85%]'
                  }
                >
                  <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                </div>
              </div>
            ))}

            {showTyping && (
              <div className="flex justify-start">
                <div className="chat-bubble-agent max-w-[85%]">
                  <div className="flex gap-1 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                  </div>
                </div>
              </div>
            )}

            {/* Suggested prompts — only before the first user message */}
            {messages.length === 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/50 text-foreground hover:border-primary/50 hover:bg-primary/10 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send(inputValue)}
                placeholder="Ask about Kourti…"
                disabled={isStreaming}
                className="flex-1 bg-muted border border-border rounded-full px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 disabled:opacity-60"
              />
              <button
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-10 inline-flex items-center justify-center disabled:opacity-50"
                onClick={() => send(inputValue)}
                disabled={isStreaming || !inputValue.trim()}
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center z-50 animate-glow-pulse"
        aria-label={isOpen ? 'Close chat' : 'Chat with MARTHA'}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
};

export default ChatBubble;
