import { useState, useEffect, useRef, useCallback } from "react";
import Groq from "groq-sdk";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

const groq = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  dangerouslyAllowBrowser: true,
});

type Mode = "interview" | "coding" | "meeting" | "general";

type Tone = "professional" | "casual" | "technical" | "assertive";

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
  const [tone, setTone] = useState<Tone>("professional");
  const [autoRespond, setAutoRespond] = useState(true);
  const [silenceThresholdMs, setSilenceThresholdMs] = useState(4500);
  const [lastSpeechAt, setLastSpeechAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const [isAutoReplyActive, setIsAutoReplyActive] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [size, setSize] = useState({ width: 420, height: 420 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0 });
  const [resizeStartSize, setResizeStartSize] = useState({ width: 420, height: 420 });

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
        setLastSpeechAt(Date.now());
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

  // Auto-respond based on silence after speech
  useEffect(() => {
    if (!autoRespond || !listening) return;
    const id = window.setInterval(() => {
      if (!autoRespond || !listening || loading || countdown !== null) return;
      if (!lastSpeechAt || !transcript.trim()) return;
      const elapsed = Date.now() - lastSpeechAt;

      // Simple question detection – only trigger if the recent snippet looks like a question
      const recent = transcript.split(/\s+/).slice(-40).join(" ").trim();
      const looksLikeQuestion =
        recent.endsWith("?") ||
        /\b(what|why|how|when|where|who|which|could you|can you|would you)\b/i.test(
          recent
        );

      if (!looksLikeQuestion) return;

      if (elapsed >= silenceThresholdMs) {
        setCountdown(3);
      }
    }, 600);
    return () => window.clearInterval(id);
  }, [autoRespond, listening, lastSpeechAt, silenceThresholdMs, loading, countdown, transcript]);

  // Countdown visual before auto-asking from transcript
  useEffect(() => {
    if (countdown === null) return;
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
    }
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          window.clearInterval(countdownTimerRef.current ?? undefined);
          countdownTimerRef = { current: null } as any;
          const recent = transcript.split(/\s+/).slice(-60).join(" ");
          if (recent.trim()) {
            setIsAutoReplyActive(true);
            ask(recent.trim());
          }
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (countdownTimerRef.current) {
        window.clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [countdown, transcript]);

  const cancelCountdown = () => {
    if (countdownTimerRef.current) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
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

  // Resizing from bottom-right corner
  const onResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clickThrough) return;
    setIsResizing(true);
    setResizeStart({ x: e.clientX, y: e.clientY });
    setResizeStartSize({ width: size.width, height: size.height });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const dx = e.clientX - resizeStart.x;
      const dy = e.clientY - resizeStart.y;
      setSize({
        width: Math.max(320, resizeStartSize.width + dx),
        height: Math.max(260, resizeStartSize.height + dy),
      });
    };
    const onUp = () => setIsResizing(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing, resizeStart, resizeStartSize]);

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
          content:
            currentMode.prompt +
            `\n\nTone: ${tone.toUpperCase()}. Match this tone in wording.` +
            (context ? `\n\nUser context:\n${context}` : ""),
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
      setIsAutoReplyActive(false);
    }
  };

  const askFromTranscript = () => {
    const recent = transcript.split(/\s+/).slice(-60).join(" ");
    if (!recent.trim()) return;
    ask(
      `From this live conversation snippet, what should I say next?\n\n"${recent.trim()}"`
    );
  };

  const refineLastResponse = async (mode: "shorter" | "longer" | "simpler" | "bolder") => {
    if (!response.trim() || loading) return;
    setLoading(true);
    setShowHistory(false);
    const instruction =
      mode === "shorter"
        ? "Rewrite the answer to be significantly shorter while preserving only the most important points."
        : mode === "longer"
        ? "Expand the answer with a bit more detail and helpful nuance, but stay focused."
        : mode === "simpler"
        ? "Rewrite the answer using simpler, clearer language for a non-expert."
        : "Rewrite the answer to sound more confident, direct, and assertive while staying professional.";

    try {
      const stream = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        stream: true,
        max_tokens: 600,
        messages: [
          {
            role: "system" as const,
            content: `You are refining a previous answer. Keep the same meaning, but apply this transformation: ${instruction}
Tone: ${tone.toUpperCase()}.`,
          },
          { role: "user", content: response },
        ],
      });
      let full = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        full += delta;
        setResponse(full);
      }
      setHistory((prev) => [
        ...prev,
        { role: "assistant", content: full, timestamp: new Date() },
      ]);
    } catch {
      setResponse("⚠️ Error while refining the answer.");
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    if (!history.length || loading) return;
    setLoading(true);
    setShowHistory(false);
    try {
      const transcriptText = history
        .map((m) => `${m.role === "user" ? "User" : "Duely"}: ${m.content}`)
        .join("\n");
      const stream = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        stream: true,
        max_tokens: 700,
        messages: [
          {
            role: "system" as const,
            content: `You generate structured meeting notes and session summaries from transcripts.
Tone: ${tone.toUpperCase()}.
Output sections: 1) Key Points, 2) Decisions, 3) Action Items (with owners if obvious), 4) Risks / Open Questions, 5) Next Steps.`,
          },
          { role: "user", content: transcriptText.slice(-8000) },
        ],
      });
      let full = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        full += delta;
        setResponse(full);
      }
      setHistory((prev) => [
        ...prev,
        { role: "assistant", content: full, timestamp: new Date() },
      ]);
    } catch {
      setResponse("⚠️ Error while generating summary.");
    } finally {
      setLoading(false);
    }
  };

  const generateFollowupEmail = async () => {
    if (!history.length || loading) return;
    setLoading(true);
    setShowHistory(false);
    try {
      const transcriptText = history
        .map((m) => `${m.role === "user" ? "User" : "Duely"}: ${m.content}`)
        .join("\n");
      const stream = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        stream: true,
        max_tokens: 700,
        messages: [
          {
            role: "system" as const,
            content: `You write polished follow-up emails after meetings or interviews.
Tone: ${tone.toUpperCase()}.
Output: subject line suggestion, then email body. Be clear, concise, and outcome-focused.`,
          },
          { role: "user", content: transcriptText.slice(-8000) },
        ],
      });
      let full = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || "";
        full += delta;
        setResponse(full);
      }
      setHistory((prev) => [
        ...prev,
        { role: "assistant", content: full, timestamp: new Date() },
      ]);
    } catch {
      setResponse("⚠️ Error while drafting follow-up email.");
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

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.code === "KeyM") {
        e.preventDefault();
        toggleListening();
      } else if (e.ctrlKey && e.shiftKey && e.code === "KeyS") {
        e.preventDefault();
        askFromTranscript();
      } else if (e.ctrlKey && e.shiftKey && e.code === "KeyA") {
        e.preventDefault();
        setAutoRespond((prev) => !prev);
      } else if (e.key === "Escape" && countdown !== null) {
        e.preventDefault();
        cancelCountdown();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleListening, countdown]);

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
          ↗
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
        width: size.width,
        height: size.height,
        background: `rgba(8, 8, 12, ${opacity})`,
        cursor: isDragging ? "grabbing" : isResizing ? "nwse-resize" : "default",
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
          {/* Tone selector */}
          <select
            className="tone-select"
            value={tone}
            onChange={(e) => setTone(e.target.value as Tone)}
            title="Tone"
          >
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="technical">Technical</option>
            <option value="assertive">Assertive</option>
          </select>
          {/* Auto-respond toggle */}
          <button
            className={`icon-btn ${autoRespond ? "active-btn" : ""}`}
            onClick={() => setAutoRespond((v) => !v)}
            title="Toggle auto-respond from live transcript"
          >
            🤖
          </button>
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

      {/* ── AUTO-RESPOND COUNTDOWN ── */}
      {countdown !== null && (
        <div className="auto-respond-bar">
          <span>
            {isAutoReplyActive ? "Auto-reply" : "Auto-respond"} in {countdown}…
          </span>
          <button className="icon-btn" onClick={cancelCountdown}>
            ✖
          </button>
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
          <div className="refine-group">
            <button className="mini-btn" onClick={() => refineLastResponse("shorter")}>
              Shorter
            </button>
            <button className="mini-btn" onClick={() => refineLastResponse("longer")}>
              Longer
            </button>
            <button className="mini-btn" onClick={() => refineLastResponse("simpler")}>
              Simpler
            </button>
            <button className="mini-btn" onClick={() => refineLastResponse("bolder")}>
              Bolder
            </button>
          </div>
          <span className="exchange-count">
            {Math.floor(history.length / 2)} exchanges · Shift+Enter for newline
          </span>
        </div>
      )}

      {/* ── INPUT AREA ── */}
      <div className="input-area">
        <div className="quick-row">
          <button className="quick-btn" onClick={askFromTranscript}>
            💬 What should I say?
          </button>
          <button className="quick-btn" onClick={generateSummary}>
            📝 Summary
          </button>
          <button className="quick-btn" onClick={generateFollowupEmail}>
            ✉️ Follow-up email
          </button>
        </div>
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
