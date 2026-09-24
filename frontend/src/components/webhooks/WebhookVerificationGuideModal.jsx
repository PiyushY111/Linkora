import { useState } from 'react';
import { ShieldCheck, Copy, Check, Terminal, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';

const CODE_SNIPPETS = {
  nodejs: `const crypto = require('crypto');

// Express middleware handler example
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signatureHeader = req.headers['linkora-signature'];
  const webhookSecret = process.env.LINKORA_WEBHOOK_SECRET;

  if (!signatureHeader) {
    return res.status(400).send('Missing Linkora-Signature header');
  }

  // 1. Extract timestamp and signature
  const parts = signatureHeader.split(',').reduce((acc, item) => {
    const [k, v] = item.split('=');
    acc[k] = v;
    return acc;
  }, {});

  const { t: timestamp, v1: signature } = parts;

  // 2. Prevent replay attacks (allow +/- 5 minutes drift)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return res.status(400).send('Signature timestamp expired');
  }

  // 3. Compute expected HMAC SHA-256
  const signedPayload = \`\${timestamp}.\${req.body.toString('utf8')}\`;
  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload)
    .digest('hex');

  // 4. Constant-time equality check to prevent timing attacks
  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );

  if (!isValid) {
    return res.status(400).send('Invalid signature');
  }

  // 5. Process verified event
  const event = JSON.parse(req.body.toString('utf8'));
  console.log('Verified Webhook Event:', event.type, event.data);

  res.status(200).json({ received: true });
});`,

  python: `import hmac
import hashlib
import time
import json
from flask import Flask, request, jsonify, abort

app = Flask(__name__)
WEBHOOK_SECRET = "whsec_your_secret_here"

@app.route("/webhook", methods=["POST"])
def handle_webhook():
    signature_header = request.headers.get("Linkora-Signature")
    if not signature_header:
        abort(400, "Missing Linkora-Signature header")

    # 1. Parse t=... and v1=...
    elements = dict(item.split("=") for item in signature_header.split(","))
    timestamp = elements.get("t")
    signature = elements.get("v1")

    # 2. Prevent replay attacks (5 minutes tolerance)
    if abs(time.time() - int(timestamp)) > 300:
        abort(400, "Signature timestamp expired")

    # 3. Compute expected HMAC
    raw_body = request.get_data()
    signed_payload = f"{timestamp}.".encode("utf-8") + raw_body
    expected_sig = hmac.new(
        WEBHOOK_SECRET.encode("utf-8"),
        signed_payload,
        hashlib.sha256
    ).hexdigest()

    # 4. Constant-time comparison
    if not hmac.compare_digest(signature, expected_sig):
        abort(400, "Invalid signature")

    # 5. Process event
    payload = json.loads(raw_body)
    print("Verified Event:", payload.get("type"))
    return jsonify({"received": True}), 200`,

  go: `package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var webhookSecret = "whsec_your_secret_here"

func webhookHandler(w http.ResponseWriter, r *http.Request) {
	sigHeader := r.Header.Get("Linkora-Signature")
	if sigHeader == "" {
		http.Error(w, "Missing Linkora-Signature header", http.StatusBadRequest)
		return
	}

	// 1. Extract t and v1
	parts := strings.Split(sigHeader, ",")
	var timestamp, signature string
	for _, part := range parts {
		kv := strings.SplitN(part, "=", 2)
		if len(kv) == 2 {
			if kv[0] == "t" { timestamp = kv[1] }
			if kv[0] == "v1" { signature = kv[1] }
		}
	}

	// 2. Prevent replay attack (300s tolerance)
	tsInt, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil || math.Abs(float64(time.Now().Unix()-tsInt)) > 300 {
		http.Error(w, "Signature timestamp expired", http.StatusBadRequest)
		return
	}

	// 3. Read raw body and construct signed payload
	rawBody, _ := io.ReadAll(r.Body)
	signedPayload := fmt.Sprintf("%s.%s", timestamp, string(rawBody))

	// 4. Compute expected HMAC SHA-256
	mac := hmac.New(sha256.New, []byte(webhookSecret))
	mac.Write([]byte(signedPayload))
	expectedSig := hex.EncodeToString(mac.Sum(nil))

	// 5. Constant-time check
	if !hmac.Equal([]byte(signature), []byte(expectedSig)) {
		http.Error(w, "Invalid signature", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(\`{"received":true}\`))
}`,
};

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
    <Modal
      open={open}
      onClose={onClose}
      title="Verify Webhook Signatures"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-4">
        <p className="text-xs text-paper-400">
          Linkora signs every outgoing webhook delivery with HMAC-SHA256 and provides timestamp replay defense matching Stripe &amp; Svix standards.
        </p>

        {/* Specification Box */}
        <div className="rounded-xl border border-ink-700 bg-ink-950 p-3.5 space-y-2 text-xs">
          <div className="flex items-center gap-2 text-accent-400 font-semibold">
            <ShieldCheck size={16} />
            <span>Signature Specification</span>
          </div>
          <div className="font-mono text-paper-200 bg-ink-900 rounded-md p-2 text-[11px] border border-ink-700">
            Linkora-Signature: t=1727018400,v1=3c5d8a9...
          </div>
          <ul className="list-disc list-inside space-y-1 text-paper-300 text-[11px]">
            <li>
              <code className="text-paper-100">t</code> is the UNIX timestamp (seconds) when the delivery attempt was prepared.
            </li>
            <li>
              <code className="text-paper-100">v1</code> is the HMAC-SHA256 hex digest of <code className="text-paper-100">{'${t}.${rawBody}'}</code> signed with your endpoint secret.
            </li>
            <li>
              Reject deliveries where <code className="text-paper-100">Math.abs(now - t) &gt; 300</code> to prevent replay attacks.
            </li>
          </ul>
        </div>

        {/* Code Tabs */}
        <div>
          <div className="flex items-center justify-between border-b border-ink-700 pb-2">
            <div className="flex gap-1.5">
              {[
                { id: 'nodejs', label: 'Node.js (Express)' },
                { id: 'python', label: 'Python (FastAPI / Flask)' },
                { id: 'go', label: 'Go' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLang(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    lang === tab.id
                      ? 'bg-ink-800 text-accent-400 border border-ink-600'
                      : 'text-paper-400 hover:text-paper-200'
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

          <pre className="mt-3 max-h-80 overflow-auto rounded-xl border border-ink-700 bg-ink-950 p-3.5 font-mono text-[11px] leading-relaxed text-paper-200 selection:bg-accent-400 selection:text-ink-950">
            {CODE_SNIPPETS[lang]}
          </pre>
        </div>

        {/* Footer */}
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
