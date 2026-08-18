import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, Bot, User, Sparkles, Loader2, Trash2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Streamdown } from "streamdown";
import { VoicePromptButton } from "@/components/VoicePromptButton";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface AIChatPanelProps {
  open: boolean;
  onClose: () => void;
}

const suggestedPrompts = [
  "Generate a hip-hop beat prompt for Suno",
  "Write lyrics for a cinematic film score",
  "Create a storyboard for a music video",
  "Design a logo concept for a tech startup",
  "Plan a social media content strategy",
  "Write a prompt for a futuristic AI image",
];

export function AIChatPanel({ open, onClose }: AIChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hey! I'm your **Genei AI Assistant**. I can help you:\n\n- Generate creative prompts for music, video, and images\n- Write lyrics, scripts, and storyboards\n- Plan your projects and workflows\n- Brainstorm ideas and strategies\n\nWhat would you like to create today?",
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const chatMutation = trpc.ai.chat.useMutation();

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleVoiceTranscript = useCallback((transcript: string) => {
    setInput((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript);
  }, []);

  const sendMessage = async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      const history = messages
        .filter(m => m.id !== "welcome")
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      const result = await chatMutation.mutateAsync({
        message: content.trim(),
        history,
      });

      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: result.content,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([{
      id: "welcome",
      role: "assistant",
      content: "Chat cleared. What would you like to create?",
      timestamp: new Date(),
    }]);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop for mobile */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            className="fixed right-0 top-0 bottom-0 w-full sm:w-96 z-50 flex flex-col border-l border-border"
            style={{ background: "oklch(0.10 0.015 265)" }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-border flex-shrink-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))", boxShadow: "0 0 16px oklch(0.65 0.22 285 / 0.4)" }}>
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-foreground font-display">AI Assistant</div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 genei-pulse inline-block" />
                  Online & Ready
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={clearChat} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Clear chat">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    msg.role === "assistant"
                      ? ""
                      : "bg-secondary"
                  }`}
                    style={msg.role === "assistant" ? {
                      background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))"
                    } : {}}>
                    {msg.role === "assistant"
                      ? <Sparkles className="w-3.5 h-3.5 text-white" />
                      : <User className="w-3.5 h-3.5 text-muted-foreground" />
                    }
                  </div>
                  <div className={`flex-1 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                    <div className={`rounded-xl px-3.5 py-2.5 text-sm ${
                      msg.role === "user"
                        ? "bg-primary/20 border border-primary/30 text-foreground"
                        : "bg-secondary border border-border text-foreground"
                    }`}>
                      {msg.role === "assistant" ? (
                        <div className="prose prose-invert prose-sm max-w-none">
                          <Streamdown>{msg.content}</Streamdown>
                        </div>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 px-1">
                      {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </motion.div>
              ))}

              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3"
                >
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))" }}>
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="bg-secondary border border-border rounded-xl px-3.5 py-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Thinking...</span>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Prompts */}
            {messages.length <= 1 && (
              <div className="px-4 pb-3">
                <div className="text-xs text-muted-foreground mb-2 font-medium">Quick prompts</div>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedPrompts.slice(0, 3).map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendMessage(prompt)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-border hover:border-primary/40 text-muted-foreground hover:text-foreground transition-all duration-150"
                      style={{ background: "oklch(0.13 0.015 265)" }}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="px-4 pb-4 flex-shrink-0 border-t border-border pt-3">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything creative..."
                  rows={1}
                  className="flex-1 bg-secondary border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none transition-all"
                  style={{ minHeight: "44px", maxHeight: "120px" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 120) + "px";
                  }}
                />
                <VoicePromptButton onTranscript={handleVoiceTranscript} disabled={isLoading} />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || isLoading}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: "linear-gradient(135deg, oklch(0.65 0.22 285), oklch(0.60 0.25 310))",
                    boxShadow: input.trim() ? "0 0 16px oklch(0.65 0.22 285 / 0.4)" : "none"
                  }}
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                Press Enter to send · Shift+Enter for new line
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
