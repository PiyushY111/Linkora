// Prints how many clicks the analytics pipeline recorded for one link, so a
// run's request count can be compared with what was actually stored.
// Usage: node benchmarks/count-clicks.mjs <shortCode> [mongoUri]
// Run from the repo root after `npm ci` in backend/ (it borrows backend's mongoose).
import { createRequire } from 'node:module';

const require = createRequire(new URL('../backend/package.json', import.meta.url));
const mongoose = require('mongoose');

const [shortCode, uri = 'mongodb://127.0.0.1:27017/linkora_bench'] = process.argv.slice(2);
if (!shortCode) {
  console.error('usage: node benchmarks/count-clicks.mjs <shortCode> [mongoUri]');
  process.exit(2);
}

await mongoose.connect(uri);
const db = mongoose.connection.db;
const link = await db.collection('links').findOne({ shortCode }, { projection: { clicks: 1 } });
const events = link ? await db.collection('click_events').countDocuments({ 'meta.linkId': link._id }) : 0;
console.log(JSON.stringify({ shortCode, linkClicks: link?.clicks ?? null, clickEvents: events }));
await mongoose.disconnect();
