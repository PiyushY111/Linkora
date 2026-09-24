import { expect } from '@playwright/test';

/**
 * Registers a fresh user through the API and returns its credentials and
 * access token. Unique per call, so tests never share state.
 * @param {import('@playwright/test').APIRequestContext} request
 */
export async function registerUser(request) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const credentials = { name: 'E2E User', email: `e2e-${suffix}@example.com`, password: 'E2ePassw0rd' };
  const res = await request.post('/api/auth/register', { data: credentials });
  expect(res.status(), await res.text()).toBe(201);
  const { token, user } = await res.json();
  return { ...credentials, token, user };
}

/**
 * Starts the browser already signed in: the SPA reads the access token and
 * user from localStorage on load.
 * @param {import('@playwright/test').Page} page
 */
export async function signIn(page, { token, user }) {
  await page.addInitScript(
    ([t, u]) => {
      localStorage.setItem('linkora_token', t);
      localStorage.setItem('linkora_user', JSON.stringify(u));
    },
    [token, user]
  );
}
