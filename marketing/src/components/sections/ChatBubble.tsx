import { useState } from 'react';
import { MessageCircle, X, Send } from 'lucide-react';

const ChatBubble = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { type: 'agent', text: "Hi! I'm MARTHA. How can I help you today?" },
  ]);
  const [inputValue, setInputValue] = useState('');

  const handleSend = () => {
    if (!inputValue.trim()) return;

    setMessages((prev) => [...prev, { type: 'user', text: inputValue }]);
    setInputValue('');

    // Simulate response
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          type: 'agent',
          text: "Thanks for your message! This is a demo. To experience the full power of MARTHA, create an account and let us show you what's possible.",
        },
      ]);
    }, 1000);
  };

  return (
    <>
      {/* Chat Widget */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-80 sm:w-96 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden animate-scale-in">
          {/* Header */}
          <div className="bg-primary/10 px-4 py-3 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-sm text-foreground">MARTHA</div>
                <div className="text-xs text-muted-foreground">Online</div>
              </div>
            </div>
            <button
              className="h-8 w-8 rounded-lg hover:bg-muted inline-flex items-center justify-center"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="h-72 overflow-y-auto p-4 space-y-3">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={
                    message.type === 'user'
                      ? 'chat-bubble-user max-w-[85%]'
                      : 'chat-bubble-agent max-w-[85%]'
                  }
                >
                  <p className="text-sm">{message.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Type a message..."
                className="flex-1 bg-muted border border-border rounded-full px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
              <button
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 w-10 inline-flex items-center justify-center"
                onClick={handleSend}
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
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>
    </>
  );
};

export default ChatBubble;
