import http from 'http';

/**
 * A loopback HTTP server that records every webhook it receives and
 * answers with whatever the test asked for. `respond` may be changed
 * between requests to script a flaky endpoint.
 * @returns {Promise<{ url: string, received: Array<{ headers: object, body: string, json: object }>, respond: { status: number, headers?: object, body?: string }, close: () => Promise<void> }>}
 */
export async function startWebhookReceiver({ path = '/hook' } = {}) {
  const received = [];
  const receiver = {
    respond: { status: 200 },
    received,
  };

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      let json = null;
      try {
        json = JSON.parse(body);
      } catch {
        json = null;
      }
      received.push({ headers: req.headers, body, json });
      const { status, headers = {}, body: responseBody = '{"ok":true}' } = receiver.respond;
      res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
      res.end(responseBody);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  receiver.url = `http://127.0.0.1:${server.address().port}${path}`;
  receiver.close = () => new Promise((resolve) => server.close(resolve));
  return receiver;
}

export default startWebhookReceiver;
