import { createServer } from 'node:http';
import { mkdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createServer as createViteServer } from 'vite';

const cliPortIndex = process.argv.indexOf('--port');
const port = Number(process.env.PORT || (cliPortIndex >= 0 ? process.argv[cliPortIndex + 1] : 5173));
const hostIndex = process.argv.indexOf('--host');
const host = hostIndex >= 0 ? process.argv[hostIndex + 1] : (process.env.HOST || '127.0.0.1');
const serviceOnly = process.env.RECORDING_SERVICE_ONLY === '1';
const projectRecorder = join(homedir(), 'Projects', 'sysaudio-rec', '.build', 'release', 'sysaudio-rec');
const installedRecorder = join(homedir(), 'sysaudio-rec');
const recordBinary = process.env.SYS_RECORD_BIN || (existsSync(projectRecorder) ? projectRecorder : installedRecorder);
const recordingDir = join('/tmp', 'web-media-inspector-recordings');
let activeRecording = null;
const allowedBrowserOrigins = new Set([
  'https://tangkk.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

function recordLog(event, details = {}) {
  console.log(`[recording] ${event}`, details);
}

await mkdir(recordingDir, { recursive: true });

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

async function startRecording(req, res) {
  if (activeRecording?.status === 'recording') {
    return json(res, 409, { error: 'A recording is already in progress.' });
  }
  if (!existsSync(recordBinary)) {
    return json(res, 503, {
      code: 'RECORDER_NOT_INSTALLED',
      error: 'sysaudio-rec is not installed on this computer.',
    });
  }

  const body = await readBody(req);
  const id = randomUUID();
  const outputPath = join(recordingDir, `system-recording-${id}.mp3`);
  const args = ['--meter', outputPath];
  if (body.device) args.unshift('--device', String(body.device));
  recordLog('starting', { id, binary: recordBinary, args, outputPath });

  const child = spawn(recordBinary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = [];
  const meter = { level: 0, peak: 0, samples: [] };
  let stdoutBuffer = '';
  const handleLine = (line) => {
    line = line.trim();
    if (!line) return;
      const meterMatch = /^METER\s+([\d.]+)(?:\s+([\d.]+))?$/.exec(line);
      if (meterMatch) {
        meter.level = Math.max(0, Math.min(1, Number(meterMatch[1])));
        meter.peak = Math.max(0, Math.min(1, Number(meterMatch[2] || meterMatch[1])));
        meter.samples.push(Math.max(meter.level, meter.peak));
        if (meter.samples.length > 600) meter.samples.shift();
        return;
      }
      logs.push(line);
      if (logs.length > 30) logs.shift();
  };
  const captureStdout = (chunk) => {
    stdoutBuffer += String(chunk);
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    lines.forEach(handleLine);
  };
  child.stdout.on('data', captureStdout);
  child.stderr.on('data', (chunk) => String(chunk).split(/\r?\n/).forEach(handleLine));
  try {
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
  } catch (error) {
    recordLog('start-failed', { id, error: error.message });
    return json(res, 500, { error: `Could not start sysaudio-rec: ${error.message}` });
  }
  activeRecording = { id, child, outputPath, status: 'recording', startedAt: Date.now(), logs, meter };
  recordLog('started', { id, pid: child.pid });
  child.on('error', (error) => {
    recordLog('runtime-error', { id, error: error.message });
    activeRecording.status = 'error';
    activeRecording.error = error.message;
  });
  child.on('exit', (code, signal) => {
    if (activeRecording?.id === id) {
      activeRecording.status = activeRecording.status === 'stopping' ? 'stopped' : (code === 0 ? 'stopped' : 'error');
      activeRecording.code = code;
      activeRecording.signal = signal;
      recordLog('exited', { id, code, signal, status: activeRecording.status, logs: activeRecording.logs });
    }
  });
  return json(res, 200, { id, status: 'recording', startedAt: activeRecording.startedAt });
}

async function listRecordingDevices(res) {
  if (!existsSync(recordBinary)) {
    return json(res, 503, { code: 'RECORDER_NOT_INSTALLED', error: 'sysaudio-rec is not installed on this computer.' });
  }
  const child = spawn(recordBinary, ['--list-devices-json'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += String(chunk); });
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code));
  });
  if (exitCode !== 0) return json(res, 500, { error: stderr.trim() || 'Could not list CoreAudio input devices.' });
  try {
    return json(res, 200, { devices: JSON.parse(stdout) });
  } catch (error) {
    return json(res, 500, { error: 'sysaudio-rec returned an invalid device list.' });
  }
}

async function stopRecording(req, res) {
  if (!activeRecording) return json(res, 404, { error: 'No recording is active.' });
  const recording = activeRecording;
  if (recording.status === 'recording') {
    recordLog('stopping', { id: recording.id, pid: recording.child.pid });
    recording.status = 'stopping';
    recording.child.kill('SIGINT');
  }

  const deadline = Date.now() + 12000;
  while (Date.now() < deadline && recording.status === 'stopping') {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  try {
    const file = await stat(recording.outputPath);
    if (!file.size) throw new Error('The recorder produced an empty file.');
  } catch (error) {
    recordLog('output-invalid', { id: recording.id, error: error.message, logs: recording.logs });
    activeRecording = null;
    return json(res, 500, { error: error.message, logs: recording.logs });
  }
  activeRecording = null;
  recordLog('saved', { id: recording.id, bytes: (await stat(recording.outputPath)).size });
  return json(res, 200, { id: recording.id, status: 'stopped', durationMs: Date.now() - recording.startedAt });
}

async function recordingStatus(res) {
  if (!activeRecording) return json(res, 200, { status: 'idle' });
  let fileSize = 0;
  try { fileSize = (await stat(activeRecording.outputPath)).size; } catch (error) {}
  return json(res, 200, {
    id: activeRecording.id,
    status: activeRecording.status,
    elapsedMs: Date.now() - activeRecording.startedAt,
    processAlive: !activeRecording.child.killed && activeRecording.child.exitCode == null,
    fileSize,
    meter: activeRecording.meter,
    logs: activeRecording.logs,
  });
}

async function serveRecording(req, res, url) {
  const id = url.searchParams.get('id');
  if (!id || !/^[0-9a-f-]+$/i.test(id)) return json(res, 400, { error: 'Invalid recording id.' });
  const path = join(recordingDir, `system-recording-${id}.mp3`);
  try {
    const file = await stat(path);
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': file.size, 'Cache-Control': 'no-store' });
    createReadStream(path).pipe(res);
  } catch (error) {
    json(res, 404, { error: 'Recording not found.' });
  }
}

const vite = serviceOnly ? null : await createViteServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'spa' });
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && allowedBrowserOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') {
    if (!origin || !allowedBrowserOrigins.has(origin)) {
      return json(res, 403, { error: 'Origin is not allowed.' });
    }
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/record/') && (!origin || !allowedBrowserOrigins.has(origin))) {
    return json(res, 403, { error: 'Origin is not allowed.' });
  }
  if (url.pathname === '/api/record/start' && req.method === 'POST') {
    try { return await startRecording(req, res); } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (url.pathname === '/api/record/stop' && req.method === 'POST') {
    try { return await stopRecording(req, res); } catch (error) { return json(res, 500, { error: error.message }); }
  }
  if (url.pathname === '/api/record/status' && req.method === 'GET') return recordingStatus(res);
  if (url.pathname === '/api/record/devices' && req.method === 'GET') return listRecordingDevices(res);
  if (url.pathname === '/api/record/file' && req.method === 'GET') return serveRecording(req, res, url);
  if (serviceOnly) return json(res, 404, { error: 'Recording service endpoint not found.' });
  vite.middlewares(req, res, (error) => {
    if (error) { res.statusCode = 500; res.end(error.message); }
  });
});

server.listen(port, host, () => {
  console.log(`${serviceOnly ? 'Recording bridge' : 'Web Media Inspector'} listening on http://${host}:${port}`);
  console.log(`System recorder: ${recordBinary}`);
});
