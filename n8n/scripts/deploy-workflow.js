import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const N8N_URL = process.env.N8N_URL?.replace(/\/+$/, '');
const N8N_API_KEY = process.env.N8N_API_KEY;
const WORKFLOW_FILE = resolve(process.argv[2] ?? './workflow.json');

if (!N8N_URL || !N8N_API_KEY) {
  console.error('N8N_URL and N8N_API_KEY env vars are required');
  process.exit(1);
}

const headers = {
  'X-N8N-API-KEY': N8N_API_KEY,
  'Content-Type': 'application/json',
  'Accept': 'application/json'
};

async function api(path, init = {}) {
  const res = await fetch(`${N8N_URL}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    console.error(`API ${init.method ?? 'GET'} ${path} -> ${res.status} ${res.statusText}`);
    console.error(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    process.exit(1);
  }
  return body;
}

const workflow = JSON.parse(await readFile(WORKFLOW_FILE, 'utf8'));

const body = {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
  settings: workflow.settings
};

const existing = await api('/api/v1/workflows?limit=100');
const match = existing.data?.find((w) => w.name === workflow.name);

let result;
if (match) {
  console.log(`Updating existing workflow "${workflow.name}" (id=${match.id})`);
  result = await api(`/api/v1/workflows/${match.id}`, {
    method: 'PUT',
    body: JSON.stringify(body)
  });
} else {
  console.log(`Creating new workflow "${workflow.name}"`);
  result = await api('/api/v1/workflows', {
    method: 'POST',
    body: JSON.stringify(body)
  });
}

console.log(`OK: workflow ${result.id ?? result.data?.id} deployed`);
console.log(`Open: ${N8N_URL}/workflow/${result.id ?? result.data?.id}`);

if (workflow.active === true) {
  const workflowId = result.id ?? result.data?.id;
  console.log(`Activating workflow ${workflowId}...`);
  await api(`/api/v1/workflows/${workflowId}/activate`, { method: 'POST' });
  console.log(`OK: workflow ${workflowId} is active`);
}

process.exit(0);
