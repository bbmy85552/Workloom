#!/usr/bin/env node
// Rebrand a resolved, server-owned runtime Compose config without replacing its secrets or ports.
import fs from 'node:fs';

const [input, output, envPath = '.env'] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: runtime-compose.mjs INPUT OUTPUT [ENV]');
const config = JSON.parse(fs.readFileSync(input, 'utf8'));
const env = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (!match) return [];
  let value = match[2];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  return [[match[1], value]];
}));
const names = Object.keys(config.services || {});
const requested = process.env.WORKLOOM_SERVICE_NAME || process.env.JIANJI_SERVICE_NAME;
const sourceName = requested || (names.includes('workloom') ? 'workloom' : names.includes('jianji') ? 'jianji' : '');
if (!sourceName || !config.services[sourceName]) throw new Error('Cannot identify the runtime application service; set WORKLOOM_SERVICE_NAME to its existing service key.');
if (sourceName !== 'workloom' && config.services.workloom) throw new Error('A separate Workloom service already exists; reconcile the runtime Compose file before updating.');
const app = config.services[sourceName];
if (!app.volumes?.some(v => v.target === '/app/data') || !app.volumes?.some(v => v.target === '/app/uploads')) throw new Error('Runtime app must have identifiable database and uploads mounts.');
for (const volume of app.volumes) {
  if (['/app/data', '/app/uploads'].includes(volume.target) && volume.type !== 'volume') throw new Error('Bind-mounted application storage requires manual migration.');
}
app.image = 'workloom:runtime';
app.container_name = 'workloom';
delete app.build;
app.environment ||= {};
for (const key of Object.keys(app.environment)) {
  if (key.startsWith('JIANJI_')) {
    const replacement = key.replace(/^JIANJI_/, 'WORKLOOM_');
    app.environment[replacement] ??= app.environment[key];
    delete app.environment[key];
  }
}
// Compose's resolved JSON has already escaped its existing values. Only escape
// the raw values we inject here, so reading this file preserves literal dollars.
for (const [key, value] of Object.entries({...env, ...process.env})) {
  if (key.startsWith('WORKLOOM_') && !['WORKLOOM_DATA_VOLUME', 'WORKLOOM_UPLOADS_VOLUME'].includes(key)) app.environment[key] = value.replace(/\$/g, () => '$$');
}
config.volumes ||= {};
for (const [target, key, logical] of [['/app/data', 'WORKLOOM_DATA_VOLUME', 'workloom-data'], ['/app/uploads', 'WORKLOOM_UPLOADS_VOLUME', 'workloom-uploads']]) {
  const physical = process.env[key] || env[key];
  if (!physical) throw new Error(`Missing verified ${key} mapping.`);
  app.volumes = app.volumes.map(v => v.target === target ? {...v, source: logical} : v);
  config.volumes[logical] = {name: physical, external: true};
}
if (sourceName !== 'workloom') {
  delete config.services[sourceName];
  config.services.workloom = app;
  for (const service of Object.values(config.services)) {
    if (Array.isArray(service.depends_on)) service.depends_on = service.depends_on.map(n => n === sourceName ? 'workloom' : n);
    else if (service.depends_on?.[sourceName]) {
      service.depends_on.workloom = service.depends_on[sourceName];
      delete service.depends_on[sourceName];
    }
  }
  // Existing reverse proxies may still resolve the former service DNS name.
  for (const network of Object.keys(app.networks || {})) {
    app.networks[network] ||= {};
    app.networks[network].aliases = [...new Set([...(app.networks[network].aliases || []), sourceName])];
  }
}
fs.writeFileSync(output, JSON.stringify(config, null, 2) + '\n', {mode: 0o600});
