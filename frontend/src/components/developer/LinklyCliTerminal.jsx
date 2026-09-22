import { useState, useRef, useEffect } from 'react';
import {
  Terminal as TerminalIcon,
  Maximize2,
  Minimize2,
  Trash2,
  Copy,
  Download,
  CornerDownLeft,
  RotateCw,
  Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  executeCommand,
  getAutoCompletions,
  BANNER_TEXT,
  WELCOME_MESSAGE,
} from '../../utils/cliParser';

const QUICK_COMMANDS = [
  'help',
  'links list',
  'links create https://stripe.com --custom stripe-docs',
  'usage',
  'ping',
  'clear',
];

const LinklyCliTerminal = ({ activeApiKey = '', user = null }) => {
  const [history, setHistory] = useState([
    {
      type: 'system',
      lines: [
        { text: BANNER_TEXT, type: 'accent' },
        { text: WELCOME_MESSAGE, type: 'info' },
      ],
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [commandHistory, setCommandHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const terminalEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom on output updates
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, isExecuting]);

  // Focus input on click anywhere inside terminal body
  const focusInput = () => {
    inputRef.current?.focus();
  };

  const handleRunCommand = async (cmdToRun = inputVal) => {
    const trimmed = cmdToRun.trim();
    if (!trimmed) return;

    // Append to command history
    setCommandHistory((prev) => [trimmed, ...prev]);
    setHistoryIndex(-1);
    setInputVal('');
    setIsExecuting(true);

    // Add command echo into terminal log
    setHistory((prev) => [
      ...prev,
      {
        type: 'user',
        command: trimmed,
      },
    ]);

    try {
      const result = await executeCommand(trimmed, activeApiKey, user);
      if (result.clear) {
        setHistory([]);
      } else {
        setHistory((prev) => [
          ...prev,
          {
            type: 'output',
            lines: result.lines || [],
            latencyMs: result.latencyMs,
          },
        ]);
      }
    } catch (err) {
      setHistory((prev) => [
        ...prev,
        {
          type: 'output',
          lines: [{ text: `Fatal error: ${err.message}`, type: 'error' }],
        },
      ]);
    } finally {
      setIsExecuting(false);
      setTimeout(focusInput, 50);
    }
  };

  const handleKeyDown = (e) => {
    // Up arrow -> Navigate previous history
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
        const nextIdx = historyIndex + 1;
        setHistoryIndex(nextIdx);
        setInputVal(commandHistory[nextIdx]);
      }
    }
    // Down arrow -> Navigate newer history
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setInputVal(commandHistory[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputVal('');
      }
    }
    // Tab -> Auto-completion
    else if (e.key === 'Tab') {
      e.preventDefault();
      const completions = getAutoCompletions(inputVal);
      if (completions.length === 1) {
        setInputVal(completions[0] + ' ');
      } else if (completions.length > 1) {
        setHistory((prev) => [
          ...prev,
          {
            type: 'output',
            lines: [
              {
                text: `Completions: ${completions.join('   ')}`,
                type: 'warn',
              },
            ],
          },
        ]);
      }
    }
    // Enter -> Execute
    else if (e.key === 'Enter') {
      e.preventDefault();
      handleRunCommand();
    }
  };

  const clearScreen = () => {
    setHistory([]);
    toast.success('Terminal buffer cleared');
  };

  const copySession = () => {
    const text = history
      .map((h) => {
        if (h.type === 'user') return `linkly ❯ ${h.command}`;
        return (h.lines || []).map((l) => l.text).join('\n');
      })
      .join('\n');
    navigator.clipboard.writeText(text);
    toast.success('Session output copied');
  };

  const downloadSessionLog = () => {
    const text = history
      .map((h) => {
        if (h.type === 'user') return `linkly ❯ ${h.command}`;
        return (h.lines || []).map((l) => l.text).join('\n');
      })
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `linkly-cli-session-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Session log downloaded');
  };

  return (
    <div
      className={`rounded-2xl border border-ink-700 bg-ink-950 font-mono shadow-2xl transition-all duration-200 overflow-hidden flex flex-col ${
        isMaximized
          ? 'fixed inset-4 z-50 h-[calc(100vh-2rem)]'
          : 'h-[620px] w-full'
      }`}
    >
      {/* Mac Terminal Chrome Title Bar */}
      <div className="flex items-center justify-between border-b border-ink-800 bg-ink-900/90 px-4 py-3 select-none shrink-0">
        {/* Window action dots */}
        <div className="flex items-center gap-2">
          <div
            onClick={clearScreen}
            className="h-3 w-3 rounded-full bg-rose-500/80 cursor-pointer hover:opacity-100 transition-opacity"
            title="Clear buffer"
          />
          <div
            onClick={() => setIsMaximized(false)}
            className="h-3 w-3 rounded-full bg-amber-500/80 cursor-pointer hover:opacity-100 transition-opacity"
            title="Restore size"
          />
          <div
            onClick={() => setIsMaximized(!isMaximized)}
            className="h-3 w-3 rounded-full bg-emerald-500/80 cursor-pointer hover:opacity-100 transition-opacity"
            title="Toggle full-screen"
          />
        </div>

        {/* Window Title */}
        <div className="flex items-center gap-2 text-xs text-paper-400 font-semibold">
          <TerminalIcon size={14} className="text-accent-400" />
          <span>linkly-cli v1.0.4 — 80x24 (zsh)</span>
          <span className="badge text-[10px] bg-accent-400/10 text-accent-400 border border-accent-400/20">
            {activeApiKey?.startsWith('lnk_test') ? 'SANDBOX' : 'LIVE'}
          </span>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-1 text-paper-400">
          <button
            type="button"
            onClick={copySession}
            className="rounded p-1.5 hover:bg-ink-800 hover:text-paper-100 transition-colors"
            title="Copy terminal session"
          >
            <Copy size={13} />
          </button>
          <button
            type="button"
            onClick={downloadSessionLog}
            className="rounded p-1.5 hover:bg-ink-800 hover:text-paper-100 transition-colors"
            title="Download session log"
          >
            <Download size={13} />
          </button>
          <button
            type="button"
            onClick={clearScreen}
            className="rounded p-1.5 hover:bg-ink-800 hover:text-rose-400 transition-colors"
            title="Clear terminal buffer"
          >
            <Trash2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => setIsMaximized(!isMaximized)}
            className="rounded p-1.5 hover:bg-ink-800 hover:text-paper-100 transition-colors"
            title={isMaximized ? 'Restore window' : 'Maximize terminal'}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div
        onClick={focusInput}
        className="flex-1 overflow-y-auto p-4 space-y-3 cursor-text text-xs leading-relaxed"
      >
        {history.map((entry, idx) => {
          if (entry.type === 'user') {
            return (
              <div key={idx} className="flex items-center gap-2 text-paper-200">
                <span className="text-accent-400 font-bold select-none">
                  linkly ❯
                </span>
                <span className="font-semibold text-paper-100">{entry.command}</span>
              </div>
            );
          }

          return (
            <div key={idx} className="space-y-1">
              {entry.lines?.map((line, lIdx) => {
                let colorClass = 'text-paper-300';
                if (line.type === 'accent') colorClass = 'text-accent-400 font-bold';
                else if (line.type === 'success') colorClass = 'text-emerald-400';
                else if (line.type === 'error') colorClass = 'text-rose-400';
                else if (line.type === 'warn') colorClass = 'text-amber-400';
                else if (line.type === 'table')
                  colorClass = 'text-paper-200 font-mono whitespace-pre overflow-x-auto block py-1';

                return (
                  <pre
                    key={lIdx}
                    className={`font-mono text-xs whitespace-pre-wrap ${colorClass}`}
                  >
                    {line.text}
                  </pre>
                );
              })}

              {entry.latencyMs !== undefined && (
                <div className="text-[10px] text-paper-500 font-mono pt-0.5">
                  [completed in {entry.latencyMs}ms]
                </div>
              )}
            </div>
          );
        })}

        {/* Live Loading Spinner */}
        {isExecuting && (
          <div className="flex items-center gap-2 text-accent-400 text-xs font-mono py-1">
            <RotateCw size={13} className="animate-spin" />
            <span>Executing request against Linkly API…</span>
          </div>
        )}

        <div ref={terminalEndRef} />
      </div>

      {/* Quick Action Suggestion Chips */}
      <div className="border-t border-ink-800/80 bg-ink-950/90 px-4 py-2 flex flex-wrap items-center gap-1.5 shrink-0">
        <span className="text-[10px] uppercase font-bold text-paper-500 tracking-wider mr-1 select-none flex items-center gap-1">
          <Sparkles size={11} className="text-accent-400" />
          <span>Quick Run:</span>
        </span>
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd}
            type="button"
            onClick={() => handleRunCommand(cmd)}
            disabled={isExecuting}
            className="rounded bg-ink-900 border border-ink-700 px-2 py-0.5 text-[11px] text-paper-300 hover:border-accent-400/40 hover:text-accent-400 transition-colors"
          >
            {cmd}
          </button>
        ))}
      </div>

      {/* Terminal Input Prompt */}
      <div className="border-t border-ink-800 bg-ink-900/60 p-3.5 flex items-center gap-2 shrink-0">
        <span className="text-accent-400 font-bold select-none text-sm">
          linkly ❯
        </span>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isExecuting}
          placeholder="Type command here (e.g. help, links list, ping)..."
          className="flex-1 bg-transparent text-xs font-mono text-paper-100 placeholder:text-paper-600 outline-none border-none p-0"
          autoFocus
          spellCheck={false}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => handleRunCommand()}
          disabled={isExecuting || !inputVal.trim()}
          className="rounded p-1 text-paper-500 hover:text-accent-400 disabled:opacity-40 transition-colors"
          title="Execute"
        >
          <CornerDownLeft size={14} />
        </button>
      </div>
    </div>
  );
};

export default LinklyCliTerminal;
