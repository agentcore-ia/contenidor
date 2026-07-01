#!/usr/bin/env node
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cmd = process.argv[2];
const arg = process.argv[3];

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PAT = process.env.SUPABASE_PAT;
const DATABASE_URL = process.env.DATABASE_URL;
const PROJECT_REF = SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

function log(label, msg) {
  console.log(`[${label}] ${msg}`);
}

function requireEnv(name, value) {
  if (!value) {
    console.error(`Falta ${name} en .env`);
    process.exit(1);
  }
}

async function applySql(label, file) {
  const sql = await readFile(resolve(file), 'utf8');

  if (PAT && PROJECT_REF) {
    log(label, `aplicando ${file} via Management API...`);
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${PAT}` },
      body: JSON.stringify({ query: sql })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Management API ${res.status}: ${err.slice(0, 500)}`);
      process.exit(1);
    }
    log(label, 'OK');
    return;
  }

  if (DATABASE_URL) {
    requireEnv('DATABASE_URL', DATABASE_URL);
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      log(label, `aplicando ${file} via Postgres...`);
      await client.query(sql);
      log(label, 'OK');
    } finally {
      await client.end();
    }
    return;
  }

  console.error('Falta SUPABASE_PAT (Management API) o DATABASE_URL en .env');
  process.exit(1);
}

async function createBucket() {
  requireEnv('SUPABASE_URL', SUPABASE_URL);
  requireEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };

  const listRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, { headers });
  const list = await listRes.json();
  const existing = Array.isArray(list) ? list.find((b) => b.name === 'post-assets') : null;

  if (existing) {
    if (existing.public) {
      log('bucket', 'post-assets ya existe y es publico');
    } else {
      log('bucket', 'post-assets ya existe pero NO es publico. Actualizando...');
      const updateRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/post-assets`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ public: true })
      });
      if (!updateRes.ok) {
        const err = await updateRes.text();
        console.error(`PUT bucket fallo: ${updateRes.status} ${err}`);
        process.exit(1);
      }
      log('bucket', 'OK: post-assets ahora es publico');
    }
    return;
  }

  const createRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'post-assets', public: true, file_size_limit: 52428800 })
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    console.error(`POST bucket fallo: ${createRes.status} ${err}`);
    process.exit(1);
  }
  log('bucket', 'OK: post-assets creado y publico');
}

async function checkStatus() {
  requireEnv('SUPABASE_URL', SUPABASE_URL);
  requireEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);

  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`
  };

  const tables = ['brands', 'content_categories', 'content_calendar', 'generated_posts', 'post_assets', 'post_reviews'];
  console.log('Tablas:');
  for (const table of tables) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`, { headers });
    console.log(`  ${res.ok ? 'OK' : 'FALTA'}  ${table} (${res.status})`);
  }

  console.log('\nCalendario:');
  const calRes = await fetch(`${SUPABASE_URL}/rest/v1/content_calendar?select=publish_date,status,topic&order=publish_date.asc&limit=5`, { headers });
  if (calRes.ok) {
    const rows = await calRes.json();
    if (rows.length === 0) {
      console.log('  (vacio - correr seed)');
    } else {
      rows.forEach((r) => console.log(`  ${r.publish_date}  ${r.status.padEnd(10)}  ${r.topic.slice(0, 60)}`));
    }
  } else {
    console.log(`  ERROR ${calRes.status}`);
  }

  console.log('\nBucket:');
  const bucketRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/post-assets`, { headers });
  if (bucketRes.ok) {
    const b = await bucketRes.json();
    console.log(`  ${b.public ? 'OK (publico)' : 'FALTA (no publico)'}  ${b.name}`);
  } else {
    console.log(`  FALTA (${bucketRes.status})`);
  }
}

switch (cmd) {
  case 'schema':
    await applySql('schema', arg ?? 'supabase/schema.sql');
    break;
  case 'seed':
    await applySql('seed', arg ?? 'supabase/seed_capta.sql');
    break;
  case 'create-bucket':
    await createBucket();
    break;
  case 'status':
    await checkStatus();
    break;
  default:
    console.error('Uso: node scripts/db-setup.js <schema|seed|create-bucket|status>');
    process.exit(1);
}

process.exit(0);
