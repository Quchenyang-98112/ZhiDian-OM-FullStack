import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';

const args = process.argv.slice(2);
const gitleaksArgs = args.length > 0 ? args : ['git', '--verbose'];

function run(command, commandArgs, stdio = 'inherit') {
  return spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    stdio,
  });
}

const local = run('gitleaks', gitleaksArgs);

if (!local.error) {
  process.exit(local.status ?? 0);
}

if (local.error.code !== 'ENOENT') {
  console.error(local.error.message);
  process.exit(1);
}

const dockerArgs = [
  'run',
  '--rm',
  '-v',
  `${process.cwd()}:/repo`,
  '-w',
  '/repo',
  'ghcr.io/gitleaks/gitleaks:latest',
  ...gitleaksArgs,
];

const docker = run('docker', dockerArgs, 'pipe');

if (!docker.error && docker.status === 0) {
  process.exit(0);
}

if (docker.error) {
  console.warn(docker.error.message);
}

console.warn('gitleaks is not installed and Docker is unavailable; running limited fallback scan.');

const listed = spawnSync('git', ['ls-files'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

if (listed.error || listed.status !== 0) {
  console.error('Unable to list tracked files for fallback secret scan.');
  process.exit(1);
}

const skipPath =
  /(^|\/)(node_modules|dist|coverage|playwright-report|test-results|\.husky)\/|(^|\/)src\/tests\/|(^|\/)\.env\.example$|\.(png|jpe?g|svg|ico|woff2?)$/;
const allowMatch = /your_|placeholder|example|dummy|test-|sk-abcdef|resolveMqttBrokerAuth|mqttBrokerAuth|FIXTURE_/i;
const rules = [
  { id: 'openai-api-key', regex: /sk-[a-zA-Z0-9]{20,}/g },
  { id: 'anthropic-api-key', regex: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
  { id: 'gemini-api-key', regex: /AIza[a-zA-Z0-9_-]{35,}/g },
  { id: 'groq-api-key', regex: /gsk_[a-zA-Z0-9]{20,}/g },
  { id: 'xai-api-key', regex: /xai-[a-zA-Z0-9]{20,}/g },
  { id: 'private-key', regex: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g },
  {
    id: 'hems-token',
    regex:
      /(?:tibber|awattar|mqtt|ocpp|knx)[_-]?(?:api[_-]?)?(?:token|key|secret|password|pass)\s*[:=]\s*['"]?[^\s'"]{16,}/gi,
  },
];

let findings = 0;

for (const file of listed.stdout.split(/\r?\n/).filter(Boolean)) {
  const normalized = file.replaceAll('\\', '/');
  if (skipPath.test(normalized)) continue;

  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    for (const match of text.matchAll(rule.regex)) {
      if (allowMatch.test(match[0])) continue;
      const lineStart = text.lastIndexOf('\n', match.index) + 1;
      const lineEnd = text.indexOf('\n', match.index);
      const lineText = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      if (lineText.includes('placeholder=')) continue;
      findings += 1;
      const line = text.slice(0, match.index).split(/\r?\n/).length;
      console.error(`${rule.id}: ${normalized}:${line}`);
    }
  }
}

if (findings > 0) {
  console.error(`Fallback secret scan found ${findings} potential secret(s).`);
  process.exit(1);
}

console.log('Fallback secret scan passed. Use native gitleaks or Docker for full rule coverage.');
