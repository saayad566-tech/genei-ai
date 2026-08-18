import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";

type SpeechRecognitionEventLike = Event & {
  results: {
    [index: number]: {
      [index: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

interface VoicePromptButtonProps {
  onTranscript: (transcript: string) => void;
  disabled?: boolean;
  label?: string;
}

export function VoicePromptButton({ onTranscript, disabled = false, label = "Use voice input" }: VoicePromptButtonProps) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSupported(Boolean(Recognition));
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) onTranscript(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error !== "aborted" && event.error !== "no-speech") {
        toast.error("Voice input was unavailable. You can keep typing instead.");
      }
    };
    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, [onTranscript]);

  if (!supported) return null;

  const toggleListening = () => {
    const recognition = recognitionRef.current;
    if (!recognition || disabled) return;
    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
      toast.error("Voice input could not start. Check microphone permission.");
    }
  };

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      aria-label={isListening ? "Stop voice input" : label}
      aria-pressed={isListening}
      title={isListening ? "Stop listening" : label}
      className={`min-h-11 min-w-11 rounded-xl border flex items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        isListening
          ? "border-red-400/50 bg-red-500/15 text-red-300"
          : "border-border bg-secondary text-muted-foreground hover:border-primary/40 hover:text-primary"
      }`}
    >
      {isListening ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
