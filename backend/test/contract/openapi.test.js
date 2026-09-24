import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import fs from 'node:fs';
import request from 'supertest';
import mongoose from 'mongoose';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import app from '../../src/app.js';
import publicApiRouter from '../../src/routes/publicApi.js';
import { connectTestDb, disconnectTestDb, createTestUser, authHeader } from '../helpers/testUtils.js';
import ApiKey from '../../src/models/ApiKey.js';
import Link from '../../src/models/Link.js';
import { closeRedis } from '../../src/services/cacheService.js';

/**
 * docs/openapi.json is the contract for /api/public/v1. These tests keep it
 * true: it must be a valid OpenAPI 3.1 document, list exactly the routes
 * the router serves, and describe what the API actually returns.
 */

const SPEC_PATH = new URL('../../../docs/openapi.json', import.meta.url);
const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));

let user;
let apiKey;
let validateResponse;

beforeAll(async () => {
  await connectTestDb();
  let token;
  ({ user, token } = await createTestUser());
  const created = await request(app)
    .post('/api/developer/keys')
    .set(authHeader(token))
    .send({ name: 'openapi-contract', scopes: ['*'] });
  apiKey = created.body.rawSecret;

  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema({ ...spec, $id: 'openapi' });

  // Validates a supertest response against the schema the spec documents
  // for (path template, method, status), addressed by JSON pointer.
  validateResponse = (template, method, res) => {
    const documented = spec.paths[template][method].responses[String(res.status)];
    assert.ok(documented, `${method.toUpperCase()} ${template} returned undocumented status ${res.status}`);
    const responsePointer = documented.$ref || `#/paths/${escapePointer(template)}/${method}/responses/${res.status}`;
    const schemaRef = `openapi${responsePointer}/content/application~1json/schema`;
    const ok = ajv.validate({ $ref: schemaRef }, res.body);
    assert.ok(ok, `${method.toUpperCase()} ${template} ${res.status}: ${ajv.errorsText(ajv.errors)}`);
  };
});

afterAll(async () => {
  await Link.deleteMany({ user: user._id });
  await ApiKey.deleteMany({ user: user._id });
  await mongoose.model('User').deleteOne({ _id: user._id });
  await disconnectTestDb();
  await closeRedis();
});

function escapePointer(segment) {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Every [METHOD, /path] the public API router serves, in OpenAPI form. */
function routerOperations() {
  const ops = [];
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          ops.push(`${method.toUpperCase()} ${(prefix + layer.route.path).replace(/:(\w+)/g, '{$1}')}`);
        }
      } else if (layer.name === 'router' && layer.handle.stack) {
        const mount = layer.regexp.source.match(/^\^\\\/([\w-]+)/)?.[1];
        walk(layer.handle.stack, mount ? `${prefix}/${mount}` : prefix);
      }
    }
  };
  walk(publicApiRouter.stack, '');
  // The spec's paths are relative to its server URL, /api/public/v1.
  return ops.map((op) => op.replace(' /v1/', ' /')).sort();
}

function specOperations() {
  const methods = ['get', 'post', 'put', 'patch', 'delete'];
  return Object.entries(spec.paths)
    .flatMap(([path, item]) => methods.filter((m) => item[m]).map((m) => `${m.toUpperCase()} ${path}`))
    .sort();
}

describe('docs/openapi.json', () => {
  it('is a valid OpenAPI 3.1 document', async () => {
    const api = await SwaggerParser.validate(structuredClone(spec));
    assert.strictEqual(api.openapi, '3.1.0');
  });

  it('documents exactly the routes the public API serves', () => {
    assert.deepStrictEqual(specOperations(), routerOperations());
  });

  it('is what GET /api/public/v1/openapi.json serves', async () => {
    const res = await request(app).get('/api/public/v1/openapi.json');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, spec);
  });
});

describe('responses match the documented schemas', () => {
  let code;

  it('POST /links', async () => {
    const res = await request(app)
      .post('/api/public/v1/links')
      .set('x-api-key', apiKey)
      .send({ originalUrl: 'https://example.com/contract', title: 'Contract', tags: ['a'] });
    validateResponse('/links', 'post', res);
    code = res.body.link.shortCode;
  });

  it('GET /links', async () => {
    validateResponse('/links', 'get', await request(app).get('/api/public/v1/links').set('x-api-key', apiKey));
  });

  it('GET /links/{code}', async () => {
    validateResponse('/links/{code}', 'get', await request(app).get(`/api/public/v1/links/${code}`).set('x-api-key', apiKey));
  });

  it('PATCH /links/{code}', async () => {
    const res = await request(app).patch(`/api/public/v1/links/${code}`).set('x-api-key', apiKey).send({ title: 'Renamed' });
    validateResponse('/links/{code}', 'patch', res);
  });

  it('GET /links/{code}/analytics', async () => {
    const res = await request(app).get(`/api/public/v1/links/${code}/analytics`).set('x-api-key', apiKey);
    validateResponse('/links/{code}/analytics', 'get', res);
  });

  it('POST /links/bulk, with one bad item', async () => {
    const res = await request(app)
      .post('/api/public/v1/links/bulk')
      .set('x-api-key', apiKey)
      .send({ links: ['https://example.com/bulk-1', { originalUrl: 'http://127.0.0.1/private' }] });
    validateResponse('/links/bulk', 'post', res);
    assert.strictEqual(res.body.failed, 1);
  });

  it('GET /usage', async () => {
    validateResponse('/usage', 'get', await request(app).get('/api/public/v1/usage').set('x-api-key', apiKey));
  });

  it('DELETE /links/{code}', async () => {
    validateResponse('/links/{code}', 'delete', await request(app).delete(`/api/public/v1/links/${code}`).set('x-api-key', apiKey));
  });

  it('404 for an unknown link', async () => {
    validateResponse('/links/{code}', 'get', await request(app).get('/api/public/v1/links/nope-404').set('x-api-key', apiKey));
  });

  it('401 without a key', async () => {
    validateResponse('/links', 'get', await request(app).get('/api/public/v1/links'));
  });

  it('400 for an invalid create', async () => {
    validateResponse('/links', 'post', await request(app).post('/api/public/v1/links').set('x-api-key', apiKey).send({}));
  });
});
