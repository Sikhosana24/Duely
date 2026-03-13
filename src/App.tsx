import { useState, useEffect, useRef, useCallback } from "react";
import Groq from "groq-sdk";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
});

type Mode = "interview" | "coding" | "meeting" | "general";

const MODES: { id: Mode; label: string; emoji: string; prompt: string }[] = [
  {
    id: "interview",
    label: "Interview",
    emoji: "🎯",
    prompt: `You are a real-time interview coach. The user is in a job interview RIGHT NOW.
When given a question or situation:
1. Give a confident, concise answer (2-3 sentences)
2. One power tip or phrase to use
3. What NOT to say
Be direct. No fluff. Help them win.`,
  },
  {
    id: "coding",
    label: "Coding",
    emoji: "💻",
    prompt: `You are a real-time coding assistant overlay.
When given code or a problem:
1. Give the solution directly with code
2. One line explanation
3. Common pitfall to avoid
Code first, explanation second. Be extremely concise.`,
  },
  {
    id: "meeting",
    label: "Meeting",
    emoji: "📋",
    prompt: `You are a real-time meeting assistant.
Help with:
1. Quick smart responses to what was just said
2. Key talking points to raise
3. Action items to note
Be brief, professional, and sharp.`,
  },
  {
    id: "general",
    label: "General",
    emoji: "🤖",
    prompt: `You are a sharp real-time AI assistant overlay.
Answer concisely and directly. Get straight to the point.
Format responses cleanly. No unnecessary padding or filler.`,
  },
];

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function App() {
  const [mode, setMode] = useState<Mode>("general");
  const [input, setInput] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<Message[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [context, setContext] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [clickThrough, setClickThrough] = useState(false);
  const [opacity, setOpacity] = useState(0.93);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const responseRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const currentMode = MODES.find((m) => m.id === mode)!;

  // Auto scroll response
  useEffect(() => {
    if (responseRef.current) {
      responseRef.current.scrollTop = responseRef.current.scrollHeight;
    }
  }, [response]);

  // Speech recognition setup
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += t;
        else setTranscript((prev) => prev + t);
      }
      if (final) {
        setTranscript((prev) => prev + " " + final);
        setInput((prev) => (prev ? prev + " " + final : final).trim());
      }
    };

    recognition.onerror = () => setListening(false);
    recognition.onend = () => {
      if (recognitionRef.current?.shouldRestart) recognition.start();
    };

    recognitionRef.current = recognition;
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition not supported.");
      return;
    }
    if (listening) {
      recognitionRef.current.shouldRestart = false;
      recognitionRef.current.stop();
      setListening(false);
    } else {
      recognitionRef.current.shouldRestart = true;
      recognitionRef.current.start();
      setListening(true);
      setTranscript("");
    }
  };

  // Toggle click-through
  const toggleClickThrough = async () => {
    const next = !clickThrough;
    setClickThrough(next);
    setOpacity(next ? 0.25 : 0.93);
    try {
      await invoke("toggle_clickthrough", { enabled: next });
    } catch (_) {}
  };

  // Dragging
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (clickThrough) return;
      setIsDragging(true);
      setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
    },
    [position, clickThrough]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    };
    const onMouseUp = () => setIsDragging(false);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, dragOffset]);

  const ask = async (overrideInput?: string) => {
    const query = (overrideInput || input).trim();
    if (!query || loading) return;
    setInput("");
    setLoading(true);
    setResponse("");
    setShowHistory(false);

    const userMsg: Message = { role: "user", content: query, timestamp: new Date() };
    const newHistory = [...history, userMsg];
    setHistory(newHistory);

    try {
      const messages = [
        {
          role: "system" as const,
          content: currentMode.prompt + (context ? `\n\nUser context:\n${context}` : ""),
        },
        ...newHistory.map((m) => ({ role: m.role, content: m.content })),
      ];

      const stream = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        stream: true,
        max_tokens: 600,
      });

      let full = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        full += delta;
        setResponse(full);
      }

      setHistory([...newHistory, { role: "assistant", content: full, timestamp: new Date() }]);
    } catch {
      setResponse("⚠️ Error connecting to Groq. Check your VITE_GROQ_API_KEY in .env");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask();
    }
  };

  const copyResponse = () => {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const clearSession = () => {
    setHistory([]);
    setResponse("");
    setInput("");
    setTranscript("");
  };

  // ── MINIMIZED PILL ──
  if (minimized) {
    return (
      <div
        className="pill"
        style={{ left: position.x, top: position.y }}
        onMouseDown={onMouseDown}
      >
        <span>{currentMode.emoji}</span>
        <span className="pill-label">Duely</span>
        {listening && <span className="live-dot" />}
        <button
          className="pill-expand"
          onClick={async (e) => { 
            e.stopPropagation(); 
            setMinimized(false);
            try {
              await invoke("set_pill_mode", { enabled: false });
            } catch {}
          }}
        >
          ↗ Open
        </button>
      </div>
    );
  }

  return (
    <div
      className="container"
      style={{
        left: position.x,
        top: position.y,
        background: `rgba(8, 8, 12, ${opacity})`,
        cursor: isDragging ? "grabbing" : "default",
      }}
    >
      {/* ── HEADER / DRAG HANDLE ── */}
      <div className="header" onMouseDown={onMouseDown}>
        <div className="header-left">
          <span className="drag-hint">⠿</span>
          <span className="logo">⚡</span>
          <span className="app-name">Duely</span>
          <span className={`badge ${listening ? "badge-live" : ""}`}>
            {listening ? "🔴 LIVE" : "READY"}
          </span>
        </div>
        <div className="header-right">
          {/* Mic toggle */}
          <button
            className={`icon-btn ${listening ? "active-btn" : ""}`}
            onClick={toggleListening}
            title={listening ? "Stop listening" : "Start mic"}
          >
            {listening ? "🎙️" : "🎤"}
          </button>
          {/* Context */}
          <button
            className={`icon-btn ${showContext ? "active-btn" : ""}`}
            onClick={() => setShowContext(!showContext)}
            title="Context panel"
          >
            📄
          </button>
          {/* History */}
          <button
            className={`icon-btn ${showHistory ? "active-btn" : ""}`}
            onClick={() => setShowHistory(!showHistory)}
            title="Session history"
          >
            🕒
          </button>
          {/* Click-through / stealth */}
          <button
            className={`icon-btn ${clickThrough ? "active-btn" : ""}`}
            onClick={toggleClickThrough}
            title="Toggle click-through (stealth)"
          >
            👁️
          </button>
          {/* Clear */}
          <button className="icon-btn" onClick={clearSession} title="Clear session">
            ↺
          </button>
          {/* Minimize to stealth pill */}
          <button className="icon-btn" onClick={async () => {
            setMinimized(true);
            try {
              await invoke("set_pill_mode", { enabled: true });
            } catch {}
          }} title="Minimize to stealth pill (invisible in screen share)">
            STEALTH
          </button>
        </div>
      </div>

      {/* ── MODE SWITCHER ── */}
      <div className="modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`mode-btn ${mode === m.id ? "mode-active" : ""}`}
            onClick={() => setMode(m.id)}
          >
            {m.emoji} {m.label}
          </button>
        ))}
      </div>

      {/* ── CONTEXT PANEL ── */}
      {showContext && (
        <div className="context-panel">
          <div className="context-label">
            {mode === "interview"
              ? "📄 Paste your resume or job description"
              : mode === "coding"
              ? "💻 Paste your code or describe your project"
              : "📋 Add background context for this session"}
          </div>
          <textarea
            className="context-input"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Duely will remember this for the whole session..."
            rows={4}
          />
          {context && (
            <div className="context-set">✅ Context loaded · {context.length} chars</div>
          )}
        </div>
      )}

      {/* ── HISTORY PANEL ── */}
      {showHistory && history.length > 0 && (
        <div className="history-panel">
          {history.map((msg, i) => (
            <div key={i} className={`history-msg ${msg.role}`}>
              <span className="history-role">
                {msg.role === "user" ? "You" : "Duely"}
              </span>
              <span className="history-content">
                {msg.content.slice(0, 120)}{msg.content.length > 120 ? "..." : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── LIVE TRANSCRIPT ── */}
      {listening && transcript && (
        <div className="transcript">
          <span className="transcript-label">🎙️</span> {transcript.slice(-200)}
        </div>
      )}

      {/* ── STEALTH NOTICE ── */}
      {clickThrough && (
        <div className="stealth-notice">
          👁️ Stealth ON — hidden from screen share · click 👁️ to turn off
        </div>
      )}

      {/* ── RESPONSE AREA ── */}
      <div className="response-area" ref={responseRef}>
        {loading && !response ? (
          <div className="dots"><span /><span /><span /></div>
        ) : response ? (
          <div className="response-text">{response}</div>
        ) : (
          <div className="placeholder">
            {currentMode.emoji} {currentMode.label} mode ready
            <br />
            <span>Type, paste, or speak your question</span>
          </div>
        )}
      </div>

      {/* ── COPY + EXCHANGE COUNT ── */}
      {response && !loading && (
        <div className="copy-row">
          <button className="copy-btn" onClick={copyResponse}>
            {copied ? "✅ Copied!" : "📋 Copy"}
          </button>
          <span className="exchange-count">
            {Math.floor(history.length / 2)} exchanges · Shift+Enter for newline
          </span>
        </div>
      )}

      {/* ── INPUT AREA ── */}
      <div className="input-area">
        <textarea
          ref={inputRef}
          className="input-box"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={listening ? "🎙️ Listening... or type here" : "Ask anything... (Enter to send)"}
          rows={2}
          autoFocus
        />
        <button
          className={`send-btn ${loading || !input.trim() ? "send-disabled" : ""}`}
          onClick={() => ask()}
          disabled={loading || !input.trim()}
        >
          {loading ? "···" : "→"}
        </button>
      </div>
    </div>
  );
}
