import { createServer } from 'node:http';
import { mkdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { createServer as createViteServer } from 'vite';

const cliPortIndex = process.argv.indexOf('--port');
const port = Number(process.env.PORT || (cliPortIndex >= 0 ? process.argv[cliPortIndex + 1] : 5173));
const hostIndex = process.argv.indexOf('--host');
const host = hostIndex >= 0 ? process.argv[hostIndex + 1] : (process.env.HOST || '0.0.0.0');
const projectRecorder = '/Users/tangkk/Projects/sysaudio-rec/.build/release/sysaudio-rec';
const recordBinary = process.env.SYS_RECORD_BIN || (existsSync(projectRecorder) ? projectRecorder : '/Users/tangkk/sysaudio-rec');
const recordingDir = join('/tmp', 'web-media-inspector-recordings');
let activeRecording = null;

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

  const body = await readBody(req);
  const id = randomUUID();
  const outputPath = join(recordingDir, `system-recording-${id}.mp3`);
  const args = ['--meter', outputPath];
  if (body.device) args.unshift('--device', String(body.device));

  const child = spawn(recordBinary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = [];
  const meter = { level: 0, samples: [] };
  let stdoutBuffer = '';
  const handleLine = (line) => {
    line = line.trim();
    if (!line) return;
      const meterMatch = /^METER\s+([\d.]+)$/.exec(line);
      if (meterMatch) {
        meter.level = Math.max(0, Math.min(1, Number(meterMatch[1])));
        meter.samples.push(meter.level);
        if (meter.samples.length > 160) meter.samples.shift();
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
  activeRecording = { id, child, outputPath, status: 'recording', startedAt: Date.now(), logs, meter };
  child.on('error', (error) => {
    activeRecording.status = 'error';
    activeRecording.error = error.message;
  });
  child.on('exit', (code, signal) => {
    if (activeRecording?.id === id) {
      activeRecording.status = activeRecording.status === 'stopping' ? 'stopped' : (code === 0 ? 'stopped' : 'error');
      activeRecording.code = code;
      activeRecording.signal = signal;
    }
  });
  return json(res, 200, { id, status: 'recording', startedAt: activeRecording.startedAt });
}

async function stopRecording(req, res) {
  if (!activeRecording) return json(res, 404, { error: 'No recording is active.' });
  const recording = activeRecording;
  if (recording.status === 'recording') {
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
    activeRecording = null;
    return json(res, 500, { error: error.message, logs: recording.logs });
  }
  activeRecording = null;
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

const vite = await createViteServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'spa' });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/record/start' && req.method === 'POST') {
    try { return await startRecording(req, res); } catch (error) { return json(res, 400, { error: error.message }); }
  }
  if (url.pathname === '/api/record/stop' && req.method === 'POST') {
    try { return await stopRecording(req, res); } catch (error) { return json(res, 500, { error: error.message }); }
  }
  if (url.pathname === '/api/record/status' && req.method === 'GET') return recordingStatus(res);
  if (url.pathname === '/api/record/file' && req.method === 'GET') return serveRecording(req, res, url);
  vite.middlewares(req, res, (error) => {
    if (error) { res.statusCode = 500; res.end(error.message); }
  });
});

server.listen(port, host, () => {
  console.log(`Web Media Inspector listening on http://localhost:${port}`);
  console.log(`System recorder: ${recordBinary}`);
});
