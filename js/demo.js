/* ============================================================
   demo.js — the live demo caller.

   Captures the microphone, encodes to 8kHz μ-law, and speaks the same
   WebSocket protocol Twilio speaks, so the demo runs down the exact
   path a real phone call takes: same prompt, same tools, same guards,
   same voice-activity tuning. A demo that diverges from the product is
   a demo that lies — and 8kHz μ-law means it sounds like the phone,
   which is the honest thing to demonstrate.

   PROTOCOL (matches backend/src/mediaStream.js)
     out: {event:'connected'}
          {event:'start', start:{streamSid, callSid, customParameters}}
          {event:'media', streamSid, media:{payload:<base64 μ-law>}}
          {event:'stop',  streamSid}
     in:  {event:'media', streamSid, media:{payload:<base64 μ-law>}}
          {event:'clear', streamSid}          ← MUST flush playback
          {event:'demoTimeUp'}                ← server hit the cap

   The 'clear' event is not optional. It is the pre-emptive audio
   cancel that barge-in depends on: when the caller interrupts, or a
   guard catches Aria mid-sentence, the server tells us to drop every
   queued sample immediately. Ignore it and she talks over the user and
   finishes sentences she was supposed to abandon.
   ============================================================ */

// The demo backend. Its own Railway service — POS off, SMS off, its
// own DATA_DIR — so nothing here can reach a real kitchen.
const DEMO_API = window.YELLOWFONE_DEMO_API || 'https://demo.yellowfone.com';

const SAMPLE_RATE = 8000;   // what the telephony path uses
const FRAME_SAMPLES = 160;  // 20ms at 8kHz, same cadence Twilio sends

/* ---------- μ-law ---------- */
// G.711 μ-law. Lookup tables rather than arithmetic per sample: this
// runs on every 20ms frame in both directions.

const MU_DECODE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff;
  let t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4);
  MU_DECODE[i] = (u & 0x80) ? (0x84 - t) : (t - 0x84);
}

function pcmToMuLaw(sample) {
  const BIAS = 0x84, MAX = 32635;
  // Take the sign from the NUMBER, not from bit 15.
  //
  // The textbook version reads `(sample >> 8) & 0x80`, which is only
  // the sign for a genuine 16-bit sample. Hand it an out-of-range
  // value — 60000, say — and that bit is set by magnitude alone, so a
  // loud positive sample encodes as negative and the waveform inverts
  // instead of clipping. It does not error; it just sounds wrong,
  // which is the hardest kind of audio bug to find.
  const sign = sample < 0 ? 0x80 : 0;
  let mag = Math.abs(sample);
  if (mag > MAX) mag = MAX;
  mag += BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (mag & mask) === 0 && exponent > 0; exponent--, mask >>= 1);
  const mantissa = (mag >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

const bytesToB64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};
const b64ToBytes = (b64) => {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

/* ---------- the call ---------- */

export class DemoCall {
  constructor(handlers = {}) {
    this.on = handlers;          // { onState, onError, onSeconds }
    this.ws = null;
    this.streamSid = 'DEMOSTREAM' + Math.random().toString(36).slice(2, 12);
    this.ctxIn = null;
    this.ctxOut = null;
    this.stream = null;
    this.node = null;
    this.playHead = 0;           // when the next chunk should start, in ctxOut time
    this.sources = new Set();    // live buffer sources, so 'clear' can kill them
    this.sendBuf = [];           // 8kHz samples awaiting a full 20ms frame
    this.stopped = false;
    this.tick = null;
  }

  state(s) { this.on.onState?.(s); }
  fail(msg) { this.on.onError?.(msg); this.stop(); }

  async start(token, secondsAllowed) {
    this.state('connecting');

    // Ask for the mic BEFORE opening the socket. The permission prompt
    // can sit for many seconds, and a socket opened first would burn
    // its share of the two minutes waiting for an answer — and hold a
    // concurrency slot while it did.
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      return this.fail(err && err.name === 'NotAllowedError'
        ? 'Microphone access was blocked. Allow it in your browser and try again.'
        : 'No microphone available. Plug one in, or try a different browser.');
    }

    const url = `${DEMO_API.replace(/^http/, 'ws')}/media?token=${encodeURIComponent(token)}`;
    try { this.ws = new WebSocket(url); } catch { return this.fail('Could not reach the demo service.'); }

    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => this.onOpen(secondsAllowed);
    this.ws.onmessage = (e) => this.onMessage(e);
    this.ws.onerror = () => { if (!this.stopped) this.fail('The connection dropped. Please try again.'); };
    this.ws.onclose = (e) => {
      if (this.stopped) return;
      // 1006 with no reason is the shape of a refused upgrade — the
      // browser is not allowed to see the HTTP status of a failed
      // handshake, so a spent or invalid token looks like a network
      // blip unless we say otherwise.
      this.fail(e.reason || (e.code === 1006
        ? 'The demo could not start — that link may already have been used.'
        : 'The call ended.'));
    };
  }

  onOpen(secondsAllowed) {
    this.send({ event: 'connected', protocol: 'Call', version: '1.0.0' });
    this.send({
      event: 'start',
      sequenceNumber: '1',
      streamSid: this.streamSid,
      start: {
        streamSid: this.streamSid,
        callSid: 'DEMO' + this.streamSid.slice(-8),
        tracks: ['inbound'],
        mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: SAMPLE_RATE, channels: 1 },
        customParameters: { from: 'web-demo' },
      },
    });

    this.startCapture();
    this.startPlayback();
    this.state('live');

    // Display only. The server enforces the real cap and will close
    // the socket whatever this counter says.
    let left = secondsAllowed;
    this.on.onSeconds?.(left);
    this.tick = setInterval(() => {
      left -= 1;
      this.on.onSeconds?.(Math.max(0, left));
      if (left <= 0) clearInterval(this.tick);
    }, 1000);
  }

  send(obj) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  /* ---------- mic → 8kHz μ-law ---------- */

  startCapture() {
    // The browser will not give us 8kHz capture, so take whatever the
    // device offers and decimate. Averaging across the window rather
    // than picking one sample acts as a cheap low-pass: plain
    // decimation aliases high frequencies down into speech range and
    // makes consonants hiss.
    this.ctxIn = new (window.AudioContext || window.webkitAudioContext)();
    const src = this.ctxIn.createMediaStreamSource(this.stream);
    const ratio = this.ctxIn.sampleRate / SAMPLE_RATE;

    this.node = this.ctxIn.createScriptProcessor(4096, 1, 1);
    this.node.onaudioprocess = (e) => {
      if (this.stopped) return;
      const input = e.inputBuffer.getChannelData(0);
      for (let i = 0; i + ratio <= input.length; i += ratio) {
        const from = Math.floor(i), to = Math.min(input.length, Math.floor(i + ratio));
        let sum = 0;
        for (let j = from; j < to; j++) sum += input[j];
        const avg = sum / Math.max(1, to - from);
        this.sendBuf.push(Math.max(-1, Math.min(1, avg)));
      }
      while (this.sendBuf.length >= FRAME_SAMPLES) {
        const frame = this.sendBuf.splice(0, FRAME_SAMPLES);
        const bytes = new Uint8Array(FRAME_SAMPLES);
        for (let i = 0; i < FRAME_SAMPLES; i++) bytes[i] = pcmToMuLaw(frame[i] * 0x7fff);
        this.send({ event: 'media', streamSid: this.streamSid, media: { payload: bytesToB64(bytes) } });
      }
    };
    src.connect(this.node);
    // ScriptProcessor only runs while connected to a destination. A
    // zero gain keeps the caller from hearing their own voice.
    const mute = this.ctxIn.createGain();
    mute.gain.value = 0;
    this.node.connect(mute);
    mute.connect(this.ctxIn.destination);
  }

  /* ---------- μ-law → speakers ---------- */

  startPlayback() {
    this.ctxOut = new (window.AudioContext || window.webkitAudioContext)();
    this.playHead = this.ctxOut.currentTime;
  }

  playChunk(bytes) {
    if (!this.ctxOut || this.stopped) return;
    const buf = this.ctxOut.createBuffer(1, bytes.length, SAMPLE_RATE);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bytes.length; i++) ch[i] = MU_DECODE[bytes[i]] / 0x8000;

    const src = this.ctxOut.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctxOut.destination);

    // Schedule back-to-back. Never behind now, or chunks pile up at
    // currentTime and play on top of each other as garble.
    const now = this.ctxOut.currentTime;
    if (this.playHead < now) this.playHead = now + 0.02;
    src.start(this.playHead);
    this.playHead += buf.duration;

    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /**
   * Drop everything queued, immediately.
   *
   * This is barge-in. Stopping the sources is not enough on its own —
   * the play head has to be reset too, or the next chunk is scheduled
   * after audio that was just cancelled and Aria answers into silence.
   */
  flushPlayback() {
    for (const s of this.sources) { try { s.stop(); } catch {} }
    this.sources.clear();
    if (this.ctxOut) this.playHead = this.ctxOut.currentTime;
  }

  onMessage(e) {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    switch (msg.event) {
      case 'media':       this.playChunk(b64ToBytes(msg.media.payload)); break;
      case 'clear':       this.flushPlayback(); break;
      case 'demoTimeUp':  this.state('timeup'); break;
      default: break;
    }
  }

  stop(reason) {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.tick);
    this.flushPlayback();
    try { this.send({ event: 'stop', streamSid: this.streamSid }); } catch {}
    try { this.ws?.close(1000, 'caller hung up'); } catch {}
    try { this.node?.disconnect(); } catch {}
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch {}
    try { this.ctxIn?.close(); } catch {}
    try { this.ctxOut?.close(); } catch {}
    this.state(reason || 'ended');
  }
}

/* ---------- gate + config ---------- */

export async function fetchDemoConfig() {
  const res = await fetch(`${DEMO_API}/api/demo/config`);
  if (!res.ok) throw new Error('The demo is not available right now.');
  return res.json();
}

export async function requestDemoSession(fields) {
  const res = await fetch(`${DEMO_API}/api/demo/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body.message || 'Could not start the demo.');
    err.code = body.error;
    throw err;
  }
  return body;
}
