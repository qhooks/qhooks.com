#!/usr/bin/env node
// Node 18+. Built-ins only. Requires explicit --fixture or --live.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { quoteAndBuild } from './partner-quote.mjs';

export function fixtureFetch(fixture) {
  if (!Array.isArray(fixture.responses)) throw new Error('Fixture requires exact response paths.');
  return async (url, options = {}) => {
    if (options.method !== 'GET') throw new Error('Fixture refuses non-GET requests.');
    const u = new URL(url), path = u.pathname + u.search;
    const match = fixture.responses.find(row => row.path === path);
    if (!match) throw new Error('No offline fixture for GET ' + path);
    return new Response(JSON.stringify(match.body), { status: match.status ?? 200, headers: { 'content-type': 'application/json' } });
  };
}
export async function runCli(args, { read = file => readFile(file, 'utf8'), output = text => process.stdout.write(text + '\n') } = {}) {
  const values = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--live') { if (values.live) throw new Error('Duplicate --live.'); values.live = true; }
    else if (['--input', '--fixture'].includes(key) && args[i + 1] && !args[i + 1].startsWith('--')) {
      if (values[key.slice(2)]) throw new Error('Duplicate ' + key + '.');
      values[key.slice(2)] = args[++i];
    } else throw new Error('Usage: node partner-quote-cli.mjs --input input.json (--fixture fixture.json | --live)');
  }
  if (!values.input || Boolean(values.fixture) === Boolean(values.live)) throw new Error('Provide --input and exactly one of --fixture or --live. --live makes public directory and quote GET requests only.');
  const input = JSON.parse(await read(values.input));
  let dependencies;
  if (values.fixture) {
    const fixture = JSON.parse(await read(values.fixture));
    if (!Number.isSafeInteger(fixture.now) || fixture.now < 0) throw new Error('Offline fixture requires explicit Unix-second now.');
    dependencies = { now: () => fixture.now, fetcher: fixtureFetch(fixture) };
  }
  const result = await quoteAndBuild(input, dependencies);
  output(JSON.stringify({ ...result, evidence: values.fixture ? 'Offline fixture; no live quote or executed trade.' : 'Public API quote; unsigned build only, no executed trade.' }, null, 2));
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch(error => { process.stderr.write((error.code ? error.code + ': ' : '') + error.message + '\n'); process.exitCode = 1; });
}
