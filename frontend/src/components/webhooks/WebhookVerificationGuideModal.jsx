import { useState } from 'react';
import { ShieldCheck, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';

// Each snippet accepts the header if ANY v1 matches: during a secret
// rotation grace period Linkora sends one v1 per active secret.
const CODE_SNIPPETS = {
  nodejs: `const crypto = require('crypto');

// Verify against the raw bytes: re-serialising parsed JSON changes them.
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const header = req.get('Linkora-Signature');
  if (!header) return res.status(400).send('Missing Linkora-Signature');

  const parts = header.split(',').map((p) => p.split('='));
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1]);
  const signatures = parts.filter(([k]) => k === 'v1').map(([, v]) => v);

  // Reject stale timestamps to stop replays (5 minute tolerance).
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    return res.status(400).send('Stale signature');
  }

  const expected = crypto
    .createHmac('sha256', process.env.LINKORA_WEBHOOK_SECRET)
    .update(\`\${timestamp}.\${req.body.toString('utf8')}\`)
    .digest();
  const valid = signatures.some((sig) => {
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!valid) return res.status(400).send('Invalid signature');

  const event = JSON.parse(req.body.toString('utf8'));
  // Retries and replays reuse event.id (also Linkora-Event-Id): skip ones
  // you have already processed.
  if (alreadyProcessed(event.id)) return res.sendStatus(200);

  handle(event.type, event.data);
  res.sendStatus(200);
});`,

  python: `import hashlib
import hmac
import json
import os
import time
from flask import Flask, abort, request

app = Flask(__name__)
SECRET = os.environ["LINKORA_WEBHOOK_SECRET"].encode()

@app.post("/webhook")
def webhook():
    header = request.headers.get("Linkora-Signature")
    if not header:
        abort(400, "Missing Linkora-Signature")

    parts = [p.split("=", 1) for p in header.split(",")]
    timestamp = next((v for k, v in parts if k == "t"), None)
    signatures = [v for k, v in parts if k == "v1"]

    # Reject stale timestamps to stop replays (5 minute tolerance).
    if not timestamp or not timestamp.isdigit() or abs(time.time() - int(timestamp)) > 300:
        abort(400, "Stale signature")

    raw = request.get_data()
    expected = hmac.new(SECRET, timestamp.encode() + b"." + raw, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(sig, expected) for sig in signatures):
        abort(400, "Invalid signature")

    event = json.loads(raw)
    # Retries and replays reuse event["id"]: skip ones already processed.
    if already_processed(event["id"]):
        return "", 200
    handle(event["type"], event["data"])
    return "", 200`,

  go: `package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

var secret = []byte(os.Getenv("LINKORA_WEBHOOK_SECRET"))

func webhookHandler(w http.ResponseWriter, r *http.Request) {
	header := r.Header.Get("Linkora-Signature")
	var timestamp string
	var signatures []string
	for _, part := range strings.Split(header, ",") {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		switch kv[0] {
		case "t":
			timestamp = kv[1]
		case "v1":
			signatures = append(signatures, kv[1])
		}
	}

	// Reject stale timestamps to stop replays (5 minute tolerance).
	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || math.Abs(float64(time.Now().Unix()-ts)) > 300 {
		http.Error(w, "stale signature", http.StatusBadRequest)
		return
	}

	raw, _ := io.ReadAll(r.Body)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(timestamp + "." + string(raw)))
	expected := mac.Sum(nil)

	valid := false
	for _, sig := range signatures {
		given, err := hex.DecodeString(sig)
		if err == nil && hmac.Equal(given, expected) {
			valid = true
			break
		}
	}
	if !valid {
		http.Error(w, "invalid signature", http.StatusBadRequest)
		return
	}

	// Retries and replays reuse the Linkora-Event-Id: skip ones already processed.
	w.WriteHeader(http.StatusOK)
}`,
};

const HEADERS = [
  ['Linkora-Signature', 't=<unix seconds>,v1=<hex HMAC>[,v1=<hex HMAC>]'],
  ['Linkora-Event-Id', 'Stable across every retry and replay of the event; use it to de-duplicate'],
  ['Linkora-Event', 'The event type, e.g. link.clicked'],
  ['Linkora-Delivery', 'This delivery (one event to one endpoint)'],
  ['Linkora-Attempt', '1 for the first attempt, then 2, 3, …'],
];

const TABS = [
  { id: 'nodejs', label: 'Node.js (Express)' },
  { id: 'python', label: 'Python (Flask)' },
  { id: 'go', label: 'Go' },
];

const WebhookVerificationGuideModal = ({ open, onClose }) => {
  const [lang, setLang] = useState('nodejs');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(CODE_SNIPPETS[lang]);
    setCopied(true);
    toast.success('Code snippet copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Modal open={open} onClose={onClose} title="Verify Webhook Signatures" maxWidth="max-w-3xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-ink-700 bg-ink-950 p-3.5 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-accent-400 font-semibold">
            <ShieldCheck size={16} />
            <span>How deliveries are signed</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-paper-300 text-[11px]">
            <li>
              Each <code className="text-paper-100">v1</code> is HMAC-SHA256 of <code className="text-paper-100">{'${t}.${rawBody}'}</code>{' '}
              keyed with the endpoint secret. Accept the request if <em>any</em> v1 matches: while a rotated secret is in its
              grace period, one v1 is sent per active secret.
            </li>
            <li>
              Reject requests where <code className="text-paper-100">|now − t| &gt; 300</code> seconds.
            </li>
            <li>
              Respond with any 2xx within 10 seconds. Other responses and timeouts are retried with backoff for about 23
              hours; redirects are never followed, and <code className="text-paper-100">410 Gone</code> disables the endpoint.
            </li>
          </ul>
          <table className="w-full text-[11px]">
            <tbody>
              {HEADERS.map(([name, meaning]) => (
                <tr key={name} className="border-t border-ink-800">
                  <td className="py-1 pr-3 font-mono text-paper-100 whitespace-nowrap align-top">{name}</td>
                  <td className="py-1 text-paper-400">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className="flex items-center justify-between border-b border-ink-700 pb-2">
            <div className="flex gap-1.5" role="tablist">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={lang === tab.id}
                  onClick={() => setLang(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    lang === tab.id ? 'bg-ink-800 text-accent-400 border border-ink-600' : 'text-paper-400 hover:text-paper-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-xs text-paper-400 hover:text-accent-400 transition-colors"
            >
              {copied ? <Check size={13} className="text-accent-400" /> : <Copy size={13} />}
              <span>Copy snippet</span>
            </button>
          </div>
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl border border-ink-700 bg-ink-950 p-3.5 font-mono text-[11px] leading-relaxed text-paper-200">
            {CODE_SNIPPETS[lang]}
          </pre>
        </div>

        <div className="flex justify-end pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default WebhookVerificationGuideModal;
