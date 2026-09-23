import { createClient } from '@clickhouse/client';
import { env } from './env.js';
import { logger } from './logger.js';

let client = null;

/**
 * Lazy factory: nothing connects until the first call, and this returns the
 * same client on every subsequent call unless resetClickHouseClient() has
 * been called in between (test teardown, or picking up a new URL). `overrides`
 * lets tests point this at a testcontainers instance without touching env.
 */
export function getClickHouseClient(overrides = {}) {
  if (!env.CLICKHOUSE_ENABLED && !overrides.url) return null;
  if (client) return client;

  client = createClient({
    url: overrides.url || env.CLICKHOUSE_URL,
    username: overrides.username || env.CLICKHOUSE_USERNAME,
    password: overrides.password || env.CLICKHOUSE_PASSWORD,
    // No default `database`: every query below fully-qualifies table names
    // with CLICKHOUSE_DATABASE, so schema bootstrap (CREATE DATABASE ...)
    // doesn't hit a chicken-and-egg "database does not exist" error.
    clickhouse_settings: {
      date_time_input_format: 'best_effort',
    },
  });

  return client;
}

/** Test-only escape hatch: forces the next getClickHouseClient() call to build a fresh client. */
export function resetClickHouseClient() {
  client = null;
}

const SCHEMA_STATEMENTS = [
  `CREATE DATABASE IF NOT EXISTS ${env.CLICKHOUSE_DATABASE}`,
  `CREATE TABLE IF NOT EXISTS ${env.CLICKHOUSE_DATABASE}.click_events (
      event_id UUID,
      link_id LowCardinality(String),
      short_code LowCardinality(String),
      user_id LowCardinality(String),
      timestamp DateTime64(3, 'UTC'),
      ip_hash FixedString(64),
      country_code LowCardinality(String),
      city LowCardinality(String),
      latitude Float32,
      longitude Float32,
      device_type LowCardinality(String),
      browser_family LowCardinality(String),
      os_family LowCardinality(String),
      referrer_domain String,
      utm_source LowCardinality(String),
      utm_medium LowCardinality(String),
      utm_campaign LowCardinality(String),
      variant_id LowCardinality(String),
      is_bot UInt8,
      bot_name LowCardinality(String)
  ) ENGINE = MergeTree()
  PARTITION BY toYYYYMM(timestamp)
  ORDER BY (user_id, link_id, timestamp)`,
  `CREATE TABLE IF NOT EXISTS ${env.CLICKHOUSE_DATABASE}.daily_link_stats (
      user_id LowCardinality(String),
      link_id LowCardinality(String),
      date Date,
      total_clicks SimpleAggregateFunction(sum, UInt64),
      unique_visitors AggregateFunction(uniqHLL12, FixedString(64))
  ) ENGINE = AggregatingMergeTree()
  PARTITION BY toYYYYMM(date)
  ORDER BY (user_id, link_id, date)`,
  `CREATE MATERIALIZED VIEW IF NOT EXISTS ${env.CLICKHOUSE_DATABASE}.daily_link_stats_mv
  TO ${env.CLICKHOUSE_DATABASE}.daily_link_stats AS
  SELECT
      user_id,
      link_id,
      toDate(timestamp) as date,
      count() as total_clicks,
      uniqHLL12State(ip_hash) as unique_visitors
  FROM ${env.CLICKHOUSE_DATABASE}.click_events
  GROUP BY user_id, link_id, date`,
];

/**
 * Creates the click_events / daily_link_stats tables and the aggregating
 * materialized view if they don't already exist. Safe to call on every boot.
 */
export async function ensureClickHouseSchema() {
  const ch = getClickHouseClient();
  if (!ch) return;

  for (const query of SCHEMA_STATEMENTS) {
    await ch.command({ query });
  }
  logger.info('ClickHouse schema ensured');
}

/**
 * Bulk-inserts rows into a ClickHouse table.
 * @param {string} table
 * @param {Record<string, unknown>[]} rows
 */
export async function bulkInsert(table, rows) {
  const ch = getClickHouseClient();
  if (!ch || rows.length === 0) return;
  await ch.insert({ table: `${env.CLICKHOUSE_DATABASE}.${table}`, values: rows, format: 'JSONEachRow' });
}

/**
 * Runs a parameterized SELECT and returns the parsed rows.
 * @param {string} query
 * @param {Record<string, unknown>} [query_params]
 * @returns {Promise<any[]>}
 */
export async function runQuery(query, query_params = {}) {
  const ch = getClickHouseClient();
  if (!ch) throw new Error('ClickHouse is not enabled (CLICKHOUSE_ENABLED=false)');

  const resultSet = await ch.query({ query, query_params, format: 'JSONEachRow' });
  return resultSet.json();
}

export default { getClickHouseClient, resetClickHouseClient, ensureClickHouseSchema, bulkInsert, runQuery };
