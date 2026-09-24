import { useState } from 'react';
import { Copy, Check, Terminal, Code2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiOrigin } from '../../services/api';

const SNIPPET_ENDPOINTS = [
  { id: 'create', label: 'Create Link (POST /links)' },
  { id: 'list', label: 'List Links (GET /links)' },
  { id: 'get', label: 'Get Link (GET /links/:code)' },
  { id: 'analytics', label: 'Link Analytics (GET /links/:code/analytics)' },
  { id: 'bulk', label: 'Bulk Shorten (POST /links/bulk)' },
];

// The API this dashboard talks to: VITE_API_URL, or this page's origin when
// the API is served (or proxied) under the same origin.
const publicApiBaseUrl = () => `${getApiOrigin() || window.location.origin}/api/public/v1`;

function generateSnippets(apiKey = 'YOUR_API_KEY', baseUrl = publicApiBaseUrl()) {
  return {
    curl: {
      create: `curl -X POST ${baseUrl}/links \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey}" \\
  -d '{
    "originalUrl": "https://example.com/blog/product-update",
    "title": "Product Launch Post",
    "tags": ["marketing", "announcements"],
    "maxClicks": 1000
  }'`,
      list: `curl -X GET "${baseUrl}/links?limit=20&page=1" \\
  -H "x-api-key: ${apiKey}"`,
      get: `curl -X GET "${baseUrl}/links/prod-update" \\
  -H "x-api-key: ${apiKey}"`,
      analytics: `curl -X GET "${baseUrl}/links/prod-update/analytics" \\
  -H "x-api-key: ${apiKey}"`,
      bulk: `curl -X POST ${baseUrl}/links/bulk \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${apiKey}" \\
  -d '{
    "links": [
      "https://example.com/feature-a",
      "https://example.com/feature-b"
    ]
  }'`,
    },
    nodejs: {
      create: `// Node.js 18+ native fetch example
const response = await fetch('${baseUrl}/links', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': '${apiKey}',
  },
  body: JSON.stringify({
    originalUrl: 'https://example.com/blog/product-update',
    title: 'Product Launch Post',
    tags: ['marketing', 'announcements'],
    maxClicks: 1000,
  }),
});

const data = await response.json();
console.log('Short Link:', data.link.shortUrl);`,
      list: `const response = await fetch('${baseUrl}/links?limit=20', {
  headers: {
    'x-api-key': '${apiKey}',
  },
});

const { links, pagination } = await response.json();
console.log(\`Fetched \${links.length} of \${pagination.total} links\`);`,
      get: `const response = await fetch('${baseUrl}/links/prod-update', {
  headers: {
    'x-api-key': '${apiKey}',
  },
});

const { link } = await response.json();
console.log(link.shortCode, '->', link.originalUrl);`,
      analytics: `const response = await fetch('${baseUrl}/links/prod-update/analytics', {
  headers: {
    'x-api-key': '${apiKey}',
  },
});

const analytics = await response.json();
console.log('Total Clicks:', analytics.totalClicks);`,
      bulk: `const response = await fetch('${baseUrl}/links/bulk', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': '${apiKey}',
  },
  body: JSON.stringify({
    links: [
      'https://example.com/feature-a',
      'https://example.com/feature-b',
    ],
  }),
});

const result = await response.json();
console.log(\`Provisioned \${result.succeeded}/\${result.total} links\`);`,
    },
    python: {
      create: `import requests

url = "${baseUrl}/links"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "${apiKey}",
}
payload = {
    "originalUrl": "https://example.com/blog/product-update",
    "title": "Product Launch Post",
    "tags": ["marketing", "announcements"],
    "maxClicks": 1000,
}

response = requests.post(url, json=payload, headers=headers)
print("Short Link:", response.json()["link"]["shortUrl"])`,
      list: `import requests

response = requests.get(
    "${baseUrl}/links",
    params={"limit": 20, "page": 1},
    headers={"x-api-key": "${apiKey}"}
)
data = response.json()
print("Links:", len(data["links"]))`,
      get: `import requests

response = requests.get(
    "${baseUrl}/links/prod-update",
    headers={"x-api-key": "${apiKey}"}
)
print(response.json()["link"])`,
      analytics: `import requests

response = requests.get(
    "${baseUrl}/links/prod-update/analytics",
    headers={"x-api-key": "${apiKey}"}
)
print("Analytics:", response.json())`,
      bulk: `import requests

payload = {
    "links": [
        "https://example.com/feature-a",
        "https://example.com/feature-b"
    ]
}
response = requests.post(
    "${baseUrl}/links/bulk",
    json=payload,
    headers={"x-api-key": "${apiKey}"}
)
print("Bulk Result:", response.json())`,
    },
    go: {
      create: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	payload, _ := json.Marshal(map[string]any{
		"originalUrl": "https://example.com/blog/product-update",
		"title":       "Product Launch Post",
		"maxClicks":   1000,
	})

	req, _ := http.NewRequest("POST", "${baseUrl}/links", bytes.NewBuffer(payload))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", "${apiKey}")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	fmt.Println("Status:", resp.Status)
}`,
      list: `package main

import (
	"fmt"
	"net/http"
)

func main() {
	req, _ := http.NewRequest("GET", "${baseUrl}/links?limit=20", nil)
	req.Header.Set("x-api-key", "${apiKey}")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	fmt.Println("Status:", resp.Status)
}`,
      get: `package main

import (
	"fmt"
	"net/http"
)

func main() {
	req, _ := http.NewRequest("GET", "${baseUrl}/links/prod-update", nil)
	req.Header.Set("x-api-key", "${apiKey}")

	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	fmt.Println("Status:", resp.Status)
}`,
      analytics: `package main

import (
	"fmt"
	"net/http"
)

func main() {
	req, _ := http.NewRequest("GET", "${baseUrl}/links/prod-update/analytics", nil)
	req.Header.Set("x-api-key", "${apiKey}")

	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	fmt.Println("Status:", resp.Status)
}`,
      bulk: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

func main() {
	body, _ := json.Marshal(map[string]any{
		"links": []string{
			"https://example.com/feature-a",
			"https://example.com/feature-b",
		},
	})

	req, _ := http.NewRequest("POST", "${baseUrl}/links/bulk", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", "${apiKey}")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	fmt.Println("Status:", resp.Status)
}`,
    },
  };
}

const ApiCodeSnippets = ({ apiKey = 'YOUR_API_KEY' }) => {
  const [lang, setLang] = useState('curl');
  const [endpointId, setEndpointId] = useState('create');
  const [copied, setCopied] = useState(false);

  const snippets = generateSnippets(apiKey);
  const currentSnippet = snippets[lang]?.[endpointId] || '';

  const handleCopy = () => {
    navigator.clipboard.writeText(currentSnippet);
    setCopied(true);
    toast.success('Code snippet copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="panel p-5 space-y-4 border border-ink-700">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-ink-700 pb-3">
        <div>
          <h2 className="text-sm font-semibold text-paper-100">SDK &amp; Integration Quickstarts</h2>
          <p className="text-xs text-paper-500">
            Copy production-ready code snippets with your active API key automatically injected.
          </p>
        </div>

        {/* Language Tabs */}
        <div className="inline-flex rounded-lg border border-ink-700 bg-ink-950 p-0.5">
          {[
            { id: 'curl', label: 'cURL' },
            { id: 'nodejs', label: 'Node.js' },
            { id: 'python', label: 'Python' },
            { id: 'go', label: 'Go' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLang(tab.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                lang === tab.id
                  ? 'bg-ink-800 text-accent-400 shadow-sm'
                  : 'text-paper-400 hover:text-paper-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Endpoint selection pills */}
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {SNIPPET_ENDPOINTS.map((ep) => (
            <button
              key={ep.id}
              type="button"
              onClick={() => setEndpointId(ep.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors border ${
                endpointId === ep.id
                  ? 'bg-ink-800 text-paper-100 border-ink-600 shadow-sm'
                  : 'bg-ink-950 text-paper-400 border-ink-700 hover:border-ink-600 hover:text-paper-200'
              }`}
            >
              {ep.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 rounded-md border border-ink-700 bg-ink-950 px-2.5 py-1 text-xs text-paper-300 hover:text-paper-100 transition-colors"
        >
          {copied ? <Check size={13} className="text-accent-400" /> : <Copy size={13} />}
          <span>Copy Snippet</span>
        </button>
      </div>

      {/* Code Viewer */}
      <pre className="max-h-96 overflow-auto rounded-xl border border-ink-700 bg-ink-950 p-4 font-mono text-xs leading-relaxed text-paper-200 selection:bg-accent-400 selection:text-ink-950">
        {currentSnippet}
      </pre>
    </div>
  );
};

export default ApiCodeSnippets;
