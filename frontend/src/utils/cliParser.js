import { publicApiService, developerService, authService } from '../services/index.js';

export const BANNER_TEXT = `
  _     ___ _   _ _  _____  ____      _       ____ _     ___ 
 | |   |_ _| \\ | | |/ / _ \\|  _ \\    / \\     / ___| |   |_ _|
 | |    | ||  \\| | ' / | | | |_) |  / _ \\   | |   | |    | | 
 | |___ | || |\\  | . \\ |_| |  _ <  / ___ \\  | |___| |___ | | 
 |_____|___|_| \\_|_|\\_\\___/|_| \\_\\/_/   \\_\\  \\____|_____|___|
                                            v1.0.4
`;

export const WELCOME_MESSAGE = `
Welcome to Linkora Interactive CLI (v1.0.4).
Type "help" for a list of available commands or "banner" to display the welcome art.
Tip: Press [Tab] to auto-complete commands, [Up/Down] arrows for history.
`;

const COMMANDS_LIST = [
  'help',
  'banner',
  'clear',
  'auth',
  'whoami',
  'ping',
  'usage',
  'links list',
  'links create',
  'links get',
  'links stats',
  'links delete',
  'keys list',
  'echo',
];

/**
 * Tokenizes a command string respecting quoted arguments.
 * e.g. links create https://example.com --title "My Title" -> ['links', 'create', 'https://example.com', '--title', 'My Title']
 */
function tokenize(input) {
  const tokens = [];
  const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
  let match;
  while ((match = regex.exec(input)) !== null) {
    if (match[1] !== undefined) {
      tokens.push(match[1]);
    } else if (match[2] !== undefined) {
      tokens.push(match[2]);
    } else {
      tokens.push(match[0]);
    }
  }
  return tokens;
}

/**
 * Parses flags like --custom <val>, --limit <n>, --title <val>
 */
function parseFlags(tokens) {
  const args = [];
  const flags = {};
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith('--')) {
        flags[key] = nextToken;
        i++;
      } else {
        flags[key] = true;
      }
    } else if (token.startsWith('-')) {
      const key = token.slice(1);
      const nextToken = tokens[i + 1];
      if (nextToken && !nextToken.startsWith('-')) {
        flags[key] = nextToken;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      args.push(token);
    }
  }
  return { args, flags };
}

/**
 * Generates an ASCII table from an array of objects.
 */
function renderAsciiTable(headers, rows) {
  if (rows.length === 0) return 'No records found.';

  const colWidths = headers.map((h, i) => {
    let max = h.length;
    rows.forEach((r) => {
      const cell = String(r[i] ?? '');
      if (cell.length > max) max = cell.length;
    });
    return Math.min(max, 45); // Max column width
  });

  const separator = '+' + colWidths.map((w) => '-'.repeat(w + 2)).join('+') + '+';

  const formatRow = (cells) =>
    '| ' +
    cells
      .map((c, i) => {
        const str = String(c ?? '');
        const truncated = str.length > colWidths[i] ? str.slice(0, colWidths[i] - 3) + '...' : str;
        return truncated.padEnd(colWidths[i], ' ');
      })
      .join(' | ') +
    ' |';

  const headerRow = formatRow(headers);
  const dataRows = rows.map((r) => formatRow(r)).join('\n');

  return `${separator}\n${headerRow}\n${separator}\n${dataRows}\n${separator}`;
}

/**
 * Executes a command line and returns an array of output message items.
 * @param {string} commandLine
 * @param {string} apiKey
 * @param {object} contextUser
 * @returns {Promise<{ lines: Array<{ text: string, type: 'info'|'success'|'error'|'warn'|'table'|'accent' }>, clear?: boolean, latencyMs?: number }>}
 */
export async function executeCommand(commandLine, apiKey, contextUser) {
  const startTime = Date.now();
  const trimmed = commandLine.trim();

  if (!trimmed) {
    return { lines: [] };
  }

  const rawTokens = tokenize(trimmed);
  const { args, flags } = parseFlags(rawTokens);
  const mainCommand = args[0]?.toLowerCase();
  const subCommand = args[1]?.toLowerCase();

  try {
    // 1. clear
    if (mainCommand === 'clear') {
      return { lines: [], clear: true };
    }

    // 2. banner
    if (mainCommand === 'banner') {
      return {
        lines: [
          { text: BANNER_TEXT, type: 'accent' },
          { text: WELCOME_MESSAGE, type: 'info' },
        ],
        latencyMs: Date.now() - startTime,
      };
    }

    // 3. help
    if (mainCommand === 'help' || mainCommand === '?') {
      const helpText = `
Linkora CLI — Command Reference Manual

CORE COMMANDS:
  help                       Display this manual
  banner                     Display the Linkora ASCII banner
  auth [--status]            Show active user, key info, and scopes
  whoami                     Alias for auth
  ping                       Measure API latency and connectivity
  usage                      View rate limits, capacity, and quota
  clear                      Clear the terminal window

LINK MANAGEMENT:
  links list                 List shortened links
      --limit <n>            Number of items to fetch (default: 10, max: 50)
      --search <query>       Filter by short code, title, or destination
      --tag <tag>            Filter by specific tag

  links create <url>         Create a short link
      --custom <alias>       Assign custom slug (e.g. --custom my-link)
      --title <title>        Set friendly title (e.g. --title "My Post")
      --tags <t1,t2>         Comma-separated tags (e.g. --tags dev,blog)
      --max-clicks <n>       Auto-deactivate after N clicks

  links get <code>           Retrieve metadata and QR code for a link
  links stats <code>         Inspect analytics (clicks, unique visitors, geo)
  links delete <code>        Permanently delete a short link

KEY MANAGEMENT:
  keys list                  List all user API keys and environments
  keys roll <id>             Rotate an API key directly from terminal

EXAMPLES:
  $ links create https://stripe.com --custom stripe-docs --tags api,docs
  $ links list --limit 5
  $ links stats stripe-docs
  $ ping
`;
      return {
        lines: [{ text: helpText, type: 'info' }],
        latencyMs: Date.now() - startTime,
      };
    }

    // 4. auth / whoami
    if (mainCommand === 'auth' || mainCommand === 'whoami') {
      let user = contextUser;
      if (!user?.email) {
        const res = await authService.getCurrentUser();
        user = res.user;
      }

      const activeKeyPrefix = apiKey ? apiKey.slice(0, 12) + '...' : 'Not provided';
      const output = `
Authenticated Session:
  User:        ${user?.name || 'Developer'} <${user?.email || 'unknown'}>
  Active Key:  ${activeKeyPrefix}
  Environment: ${apiKey?.startsWith('lnk_test') ? 'TEST / SANDBOX' : 'LIVE / PRODUCTION'}
  Status:      Active (Verified)
`;
      return {
        lines: [{ text: output, type: 'success' }],
        latencyMs: Date.now() - startTime,
      };
    }

    // 5. ping
    if (mainCommand === 'ping') {
      const pingStart = Date.now();
      await publicApiService.getOpenApiSpec();
      const roundTrip = Date.now() - pingStart;

      return {
        lines: [
          {
            text: `PONG! HTTP ping round-trip completed in ${roundTrip}ms. API server is operational.`,
            type: 'success',
          },
        ],
        latencyMs: Date.now() - startTime,
      };
    }

    // 6. usage
    if (mainCommand === 'usage') {
      if (!apiKey) {
        return {
          lines: [{ text: 'Error: No active API Key found. Generate one in API Keys tab.', type: 'error' }],
          latencyMs: Date.now() - startTime,
        };
      }

      const usage = await publicApiService.getUsage(apiKey);
      const output = `
API Usage & Token-Bucket Rate Limits:
  Key Name:        ${usage.key?.name || 'Primary Key'} (${usage.key?.prefix}...)
  Environment:     ${usage.key?.environment?.toUpperCase() || 'LIVE'}
  Granted Scopes:  [${usage.key?.scopes?.join(', ') || '*'}]
  Algorithm:       Token Bucket (Distributed Redis)
  Burst Capacity:  ${usage.rateLimits?.burstCapacity} requests
  Refill Rate:     ${usage.rateLimits?.refillPerSecond} requests/second
  Total Calls:     ${usage.key?.totalRequests || 0}
`;
      return {
        lines: [{ text: output, type: 'accent' }],
        latencyMs: Date.now() - startTime,
      };
    }

    // 7. links
    if (mainCommand === 'links') {
      if (!apiKey) {
        return {
          lines: [{ text: 'Error: API Key required for link commands.', type: 'error' }],
          latencyMs: Date.now() - startTime,
        };
      }

      // links list
      if (subCommand === 'list') {
        const limit = parseInt(flags.limit || 10, 10);
        const search = flags.search || '';
        const tag = flags.tag || '';

        const res = await publicApiService.listLinks(apiKey, { limit, search, tag });
        const headers = ['CODE', 'ORIGINAL DESTINATION', 'CLICKS', 'STATUS', 'CREATED'];
        const rows = (res.links || []).map((l) => [
          l.shortCode,
          l.originalUrl,
          String(l.clicks || 0),
          l.isActive ? 'ACTIVE' : 'PAUSED',
          new Date(l.createdAt).toLocaleDateString(),
        ]);

        const tableText = renderAsciiTable(headers, rows);
        return {
          lines: [
            { text: `Found ${res.pagination?.total || 0} link(s) (Showing ${rows.length}):`, type: 'info' },
            { text: tableText, type: 'table' },
          ],
          latencyMs: Date.now() - startTime,
        };
      }

      // links create <url>
      if (subCommand === 'create') {
        const originalUrl = args[2];
        if (!originalUrl) {
          return {
            lines: [{ text: 'Usage: links create <url> [--custom <alias>] [--title <title>] [--tags <t1,t2>]', type: 'warn' }],
            latencyMs: Date.now() - startTime,
          };
        }

        const payload = {
          originalUrl,
          customAlias: flags.custom || undefined,
          title: flags.title || undefined,
          maxClicks: flags['max-clicks'] ? parseInt(flags['max-clicks'], 10) : undefined,
          tags: flags.tags ? flags.tags.split(',').map((t) => t.trim()) : undefined,
        };

        const res = await publicApiService.createLink(apiKey, payload);
        if (res.success && res.link) {
          const out = `
✔ Link Shortened Successfully!
  Short URL:    ${res.link.shortUrl}
  Short Code:   ${res.link.shortCode}
  Destination:  ${res.link.originalUrl}
  Title:        ${res.link.title || '(None)'}
  Max Clicks:   ${res.link.maxClicks || 'Unlimited'}
  Created:      ${new Date(res.link.createdAt).toLocaleString()}
`;
          return {
            lines: [{ text: out, type: 'success' }],
            latencyMs: Date.now() - startTime,
          };
        }

        return {
          lines: [{ text: `Failed to create link: ${res.message || 'Unknown error'}`, type: 'error' }],
          latencyMs: Date.now() - startTime,
        };
      }

      // links get <code>
      if (subCommand === 'get') {
        const code = args[2];
        if (!code) {
          return {
            lines: [{ text: 'Usage: links get <short-code>', type: 'warn' }],
            latencyMs: Date.now() - startTime,
          };
        }

        const res = await publicApiService.getLink(apiKey, code);
        if (res.success && res.link) {
          const l = res.link;
          const out = `
Link Metadata for "${l.shortCode}":
  Short URL:    ${l.shortUrl}
  Destination:  ${l.originalUrl}
  Title:        ${l.title || '(None)'}
  Clicks:       ${l.clicks || 0}
  Unique:       ${l.uniqueVisitors || 0}
  Status:       ${l.isActive ? 'Active' : 'Disabled'}
  Tags:         [${(l.tags || []).join(', ')}]
  Expires:      ${l.expiryDate ? new Date(l.expiryDate).toLocaleString() : 'Never'}
`;
          return {
            lines: [{ text: out, type: 'accent' }],
            latencyMs: Date.now() - startTime,
          };
        }

        return {
          lines: [{ text: `Link "${code}" not found.`, type: 'error' }],
          latencyMs: Date.now() - startTime,
        };
      }

      // links stats <code>
      if (subCommand === 'stats') {
        const code = args[2];
        if (!code) {
          return {
            lines: [{ text: 'Usage: links stats <short-code>', type: 'warn' }],
            latencyMs: Date.now() - startTime,
          };
        }

        const res = await publicApiService.getLinkAnalytics(apiKey, code);
        const data = res.data || res.analytics || res;
        const totalClicks = data.totalClicks ?? data.clicks ?? 0;
        const uniqueVisitors = data.uniqueVisitors ?? 0;

        const out = `
Analytics Telemetry for "${code}":
  Total Clicks:       ${totalClicks}
  Unique Visitors:    ${uniqueVisitors}
  Top Countries:      ${data.countries?.map((c) => `${c.country || c._id} (${c.clicks})`).slice(0, 3).join(', ') || 'No geo data yet'}
  Top Referrers:      ${data.referrers?.map((r) => `${r.referrer || r._id} (${r.clicks})`).slice(0, 3).join(', ') || 'Direct / None'}
`;
        return {
          lines: [{ text: out, type: 'info' }],
          latencyMs: Date.now() - startTime,
        };
      }

      // links delete <code>
      if (subCommand === 'delete') {
        const code = args[2];
        if (!code) {
          return {
            lines: [{ text: 'Usage: links delete <short-code>', type: 'warn' }],
            latencyMs: Date.now() - startTime,
          };
        }

        const res = await publicApiService.deleteLink(apiKey, code);
        return {
          lines: [{ text: res.message || `Link "${code}" deleted.`, type: 'success' }],
          latencyMs: Date.now() - startTime,
        };
      }

      return {
        lines: [{ text: `Unknown subcommand "links ${subCommand}". Type "help" for options.`, type: 'warn' }],
        latencyMs: Date.now() - startTime,
      };
    }

    // 8. keys list
    if (mainCommand === 'keys') {
      if (subCommand === 'list') {
        const res = await developerService.listKeys();
        const headers = ['NAME', 'ENV', 'IDENTIFIER', 'SCOPES', 'STATUS', 'REQUESTS'];
        const rows = (res.keys || []).map((k) => [
          k.name,
          k.environment?.toUpperCase(),
          k.maskedKey,
          (k.scopes || []).join(','),
          k.status?.toUpperCase(),
          String(k.totalRequests || 0),
        ]);

        return {
          lines: [
            { text: `Found ${rows.length} API Key(s):`, type: 'info' },
            { text: renderAsciiTable(headers, rows), type: 'table' },
          ],
          latencyMs: Date.now() - startTime,
        };
      }

      return {
        lines: [{ text: `Unknown subcommand "keys ${subCommand}". Type "help" for options.`, type: 'warn' }],
        latencyMs: Date.now() - startTime,
      };
    }

    // 9. echo
    if (mainCommand === 'echo') {
      const text = args.slice(1).join(' ');
      return {
        lines: [{ text, type: 'info' }],
        latencyMs: Date.now() - startTime,
      };
    }

    // Unknown command
    return {
      lines: [
        {
          text: `zsh: command not found: "${mainCommand}". Type "help" for available commands.`,
          type: 'error',
        },
      ],
      latencyMs: Date.now() - startTime,
    };
  } catch (err) {
    const errorMsg = err.response?.data?.message || err.message || 'Execution error';
    return {
      lines: [{ text: `Error: ${errorMsg}`, type: 'error' }],
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Returns auto-complete candidate suggestions for a given input prefix.
 */
export function getAutoCompletions(input) {
  const trimmed = input.trimStart();
  if (!trimmed) return [];

  return COMMANDS_LIST.filter((cmd) => cmd.startsWith(trimmed));
}
