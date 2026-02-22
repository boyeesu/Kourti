import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowLeft, Send, MessageCircle, Paperclip, X, FileText, Image, File, Loader2, Download, Reply, CornerDownRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useMessages, useSendMessage, useSendFileMessage, useMarkAsRead, Message, FileMetadata } from '@/hooks/useChat';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useDropzone } from 'react-dropzone';
import { validateFile, formatFileSize, isImageFile, ALLOWED_CHAT_EXTENSIONS, MAX_CHAT_ATTACHMENT_SIZE } from '@/lib/fileValidation';
import { supabase } from '@/integrations/supabase/client';

interface ChatWindowProps {
  conversationId: string;
  onClose: () => void;
  recipientName?: string;
  showBackButton?: boolean;
}

// Component to load image preview with fresh signed URL
function FileImagePreview({ 
  metadata, 
  isUploading, 
  onDownload 
}: { 
  metadata: FileMetadata; 
  isUploading: boolean; 
  onDownload: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadImage = async () => {
      if (!metadata.file_path) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.storage
          .from('Chat_Storage')
          .createSignedUrl(metadata.file_path, 3600);

        if (!cancelled && data?.signedUrl && !error) {
          setImageUrl(data.signedUrl);
        }
      } catch (err) {
        console.error('Failed to load image preview:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadImage();
    return () => { cancelled = true; };
  }, [metadata.file_path]);

  if (loading || isUploading) {
    return (
      <div className="relative w-[250px] h-[150px] rounded-lg bg-muted flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!imageUrl) {
    return (
      <div 
        className="flex items-center gap-2 p-2 rounded-lg bg-background/50 cursor-pointer hover:bg-background/80"
        onClick={onDownload}
      >
        <Image className="h-5 w-5 text-blue-500" />
        <span className="text-sm">{metadata.file_name}</span>
        <Download className="h-4 w-4 opacity-60 ml-auto" />
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={metadata.file_name}
      className="max-w-[250px] max-h-[200px] rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity"
      onClick={onDownload}
    />
  );
}

export function ChatWindow({ conversationId, onClose, recipientName, showBackButton = false }: ChatWindowProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const { data: messages = [], isLoading } = useMessages(conversationId);
  const sendMessage = useSendMessage();
  const sendFileMessage = useSendFileMessage();
  const markAsRead = useMarkAsRead();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInitialMount = useRef(true);

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    const validation = validateFile(file, { maxSize: MAX_CHAT_ATTACHMENT_SIZE });
    if (!validation.valid) {
      toast({
        variant: 'destructive',
        title: 'Invalid file',
        description: validation.error,
      });
      return;
    }
    setPendingFile(file);
  }, [toast]);

  // Dropzone for drag-and-drop
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        handleFileSelect(acceptedFiles[0]);
      }
      setIsDragging(false);
    },
    onDragEnter: () => setIsDragging(true),
    onDragLeave: () => setIsDragging(false),
    noClick: true, // Don't open file dialog on click (we have a button for that)
    noKeyboard: true,
    multiple: false,
  });

  // Handle file input change (click to upload)
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  // Send file attachment
  const handleSendFile = async () => {
    if (!pendingFile || sendFileMessage.isPending) return;

    const file = pendingFile;
    setPendingFile(null);

    try {
      await sendFileMessage.mutateAsync({ conversationId, file });
    } catch (error) {
      console.error('Failed to send file:', error);
      toast({
        variant: 'destructive',
        title: 'Failed to send file',
        description: error instanceof Error ? error.message : 'An error occurred while uploading.',
      });
    }
  };

  // Auto-scroll to bottom when new messages arrive
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Reset initial mount flag when switching conversations
  useEffect(() => {
    isInitialMount.current = true;
  }, [conversationId]);

  useEffect(() => {
    if (messages.length > 0) {
      // Instant scroll on initial load, smooth for new messages
      scrollToBottom(isInitialMount.current ? 'instant' : 'smooth');
      isInitialMount.current = false;
    }
  }, [messages]);

  // Mark as read when conversation is opened
  useEffect(() => {
    if (conversationId && !markAsRead.isPending) {
      // Use a small delay to avoid race conditions
      const timer = setTimeout(() => {
        markAsRead.mutate(conversationId, {
          onError: (error) => {
            // Silently fail - this is a non-critical operation
            console.warn('Failed to mark conversation as read:', error);
          }
        });
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [conversationId, markAsRead]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sendMessage.isPending) return;

    const content = message.trim();
    const replyToId = replyTo?.id || null;
    setMessage('');
    setReplyTo(null);

    try {
      await sendMessage.mutateAsync({ conversationId, content, replyToId });
      // Scroll handled by useEffect when messages update
    } catch (error: unknown) {
      console.error('Failed to send message:', error);
      setMessage(content); // Restore message on error
      
      // Show error toast
      const errorMessage = error instanceof Error ? error.message : 'An error occurred while sending your message. Please try again.';
      toast({
        variant: 'destructive',
        title: 'Failed to send message',
        description: errorMessage,
      });
    }
  };

  const getSenderInitials = (msg: Message) => {
    if (msg.sender?.first_name && msg.sender?.last_name) {
      return `${msg.sender.first_name[0]}${msg.sender.last_name[0]}`.toUpperCase();
    }
    if (msg.sender?.email) {
      return msg.sender.email.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const getSenderName = (msg: Message) => {
    if (msg.sender?.first_name && msg.sender?.last_name) {
      return `${msg.sender.first_name} ${msg.sender.last_name}`;
    }
    if (msg.sender?.first_name) {
      return msg.sender.first_name;
    }
    if (msg.sender?.email) {
      return msg.sender.email.split('@')[0];
    }
    return 'Unknown';
  };

  const getQuotedContent = (msg: Message) => {
    if (msg.message_type === 'file') {
      const metadata = msg.metadata as FileMetadata | undefined;
      return `📎 ${metadata?.file_name || 'File'}`;
    }
    return msg.content;
  };

  // Render file attachment in message
  const renderFileAttachment = (msg: Message) => {
    const metadata = msg.metadata as FileMetadata | undefined;
    if (!metadata) return null;

    const isImage = isImageFile(metadata.file_type);
    const isUploading = msg.id.startsWith('temp-file-');

    // Generate fresh signed URL on demand (handles expiration + RLS for receiver)
    const handleDownload = async () => {
      if (!metadata.file_path) {
        toast({
          variant: 'destructive',
          title: 'File unavailable',
          description: 'File path not found.',
        });
        return;
      }

      try {
        const { data, error } = await supabase.storage
          .from('Chat_Storage')
          .createSignedUrl(metadata.file_path, 3600); // 1 hour

        if (error || !data?.signedUrl) {
          throw new Error(error?.message || 'Failed to generate download URL');
        }

        window.open(data.signedUrl, '_blank');
      } catch (err) {
        console.error('Download error:', err);
        toast({
          variant: 'destructive',
          title: 'Download failed',
          description: err instanceof Error ? err.message : 'Could not access file.',
        });
      }
    };

    return (
      <div className="mt-1">
        {isImage ? (
          <FileImagePreview 
            metadata={metadata} 
            isUploading={isUploading} 
            onDownload={handleDownload} 
          />
        ) : (
          <div
            className={cn(
              "flex items-center gap-2 p-2 rounded-lg bg-background/50 cursor-pointer hover:bg-background/80 transition-colors",
              isUploading && "opacity-70"
            )}
            onClick={!isUploading ? handleDownload : undefined}
          >
            <div className="p-2 rounded bg-primary/10">
              {metadata.file_type.includes('pdf') ? (
                <FileText className="h-5 w-5 text-red-500" />
              ) : metadata.file_type.includes('image') ? (
                <Image className="h-5 w-5 text-blue-500" />
              ) : (
                <File className="h-5 w-5 text-gray-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{metadata.file_name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(metadata.file_size)}</p>
            </div>
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4 opacity-60" />
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-background border-l border-border md:border-l">
      {/* Header */}
      <div className="flex items-center justify-between p-3 md:p-4 border-b border-border">
        <div className="flex items-center gap-2 md:gap-3">
          {/* Back button - always shown on mobile, optional on desktop */}
          {showBackButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 -ml-1"
              title="Back to conversations"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <MessageCircle className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-foreground">
              {recipientName || 'Chat'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {messages.length} message{messages.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Messages with drag-drop zone */}
      <div {...getRootProps()} className="flex-1 min-h-0 relative">
        <input {...getInputProps()} />
        
        {/* Drag overlay */}
        {(isDragActive || isDragging) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg m-2">
            <div className="text-center">
              <Paperclip className="h-12 w-12 text-primary mx-auto mb-2" />
              <p className="text-lg font-medium text-primary">Drop file to attach</p>
              <p className="text-sm text-muted-foreground">Max {MAX_CHAT_ATTACHMENT_SIZE / 1024 / 1024}MB</p>
            </div>
          </div>
        )}

        <ScrollArea className="h-full p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-sm text-muted-foreground">Loading messages...</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No messages yet</p>
              <p className="text-xs text-muted-foreground mt-1">Start the conversation!</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => {
              const isOwn = msg.sender_id === user?.id;
              const isTemp = msg.id.startsWith('temp-');
              return (
                <div
                  key={msg.id}
                  className={cn(
                    "group flex gap-3",
                    isOwn && "flex-row-reverse"
                  )}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={undefined} />
                    <AvatarFallback className="text-xs">
                      {getSenderInitials(msg)}
                    </AvatarFallback>
                  </Avatar>
                      <div className={cn(
                        "flex flex-col max-w-[85%] md:max-w-[70%]",
                        isOwn && "items-end"
                      )}>
                    {/* Quoted message preview */}
                    {msg.reply_to && (
                      <div className={cn(
                        "flex items-start gap-1.5 mb-1 px-2 py-1.5 rounded-md text-xs max-w-full",
                        isOwn 
                          ? "bg-primary/20 text-primary-foreground/80" 
                          : "bg-muted/80 text-muted-foreground"
                      )}>
                        <CornerDownRight className="h-3 w-3 shrink-0 mt-0.5" />
                        <div className="min-w-0 overflow-hidden">
                          <span className="font-medium">{getSenderName(msg.reply_to)}: </span>
                          <span className="line-clamp-2">{getQuotedContent(msg.reply_to)}</span>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      {/* Reply button - show on left for own messages */}
                      {isOwn && !isTemp && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => setReplyTo(msg)}
                          title="Reply"
                        >
                          <Reply className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <div className={cn(
                        "rounded-lg px-3 py-2",
                        isOwn
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}>
                        {msg.message_type === 'file' ? (
                          renderFileAttachment(msg)
                        ) : (
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {msg.content}
                          </p>
                        )}
                      </div>
                      {/* Reply button - show on right for others' messages */}
                      {!isOwn && !isTemp && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          onClick={() => setReplyTo(msg)}
                          title="Reply"
                        >
                          <Reply className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className={cn(
                      "text-xs text-muted-foreground mt-1 px-1",
                      isOwn && "text-right"
                    )}>
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              );
            })}
            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        )}
        </ScrollArea>
      </div>

      {/* Input */}
      <div className="p-3 md:p-4 border-t border-border safe-area-bottom">
        {/* Reply preview banner */}
        {replyTo && (
          <div className="mb-3 p-3 bg-primary/10 border-l-4 border-primary rounded-r-lg flex items-start gap-3">
            <Reply className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-primary">
                Replying to {getSenderName(replyTo)}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {getQuotedContent(replyTo)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setReplyTo(null)}
              className="h-6 w-6 shrink-0 hover:bg-primary/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Pending file preview */}
        {pendingFile && (
          <div className="mb-3 p-3 bg-muted rounded-lg flex items-center gap-3">
            <div className="p-2 rounded bg-primary/10">
              {isImageFile(pendingFile.type) ? (
                <Image className="h-5 w-5 text-blue-500" />
              ) : pendingFile.type.includes('pdf') ? (
                <FileText className="h-5 w-5 text-red-500" />
              ) : (
                <File className="h-5 w-5 text-gray-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{pendingFile.name}</p>
              <p className="text-xs text-muted-foreground">{formatFileSize(pendingFile.size)}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setPendingFile(null)}
              className="h-8 w-8 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSendFile}
              disabled={sendFileMessage.isPending}
              className="shrink-0"
            >
              {sendFileMessage.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1" />
                  Send
                </>
              )}
            </Button>
          </div>
        )}

        <form onSubmit={handleSend} className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileInputChange}
            accept={ALLOWED_CHAT_EXTENSIONS.join(',')}
            className="hidden"
          />
          
          {/* Attachment button */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={sendFileMessage.isPending}
            className="h-[60px] w-[44px] shrink-0"
            title="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>

          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type a message..."
            className="min-h-[60px] max-h-[120px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!message.trim() || sendMessage.isPending}
            className="h-[60px] w-[60px] shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
