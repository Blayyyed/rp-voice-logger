/*
 * RP Voice Logger PWA
 *
 * This script implements the core logic of the RP Voice Logger application.
 * It handles session creation, local database interactions, audio capture,
 * speech recognition, text‑to‑speech readback and simple parsing of dose
 * entries. While the final specification calls for an extensive set of
 * features (smear collection/counting, voice‑driven command loop, etc.),
 * this module focuses on a minimal viable implementation that can be
 * incrementally expanded. All data persists locally in IndexedDB so the
 * application works offline. See comments throughout for potential
 * extension points.
 */

// -----------------------------------------------------------------------------
// IndexedDB wrapper
//
// The Database class provides simple add/getAll methods for the various
// object stores used in the app. Each store holds a particular entity type.
//
class Database {
  constructor() {
    this.dbPromise = this.#open();
  }

  #open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('rp_voice_logger_db', 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        // Session store
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'id' });
        }
        // Dose entries
        if (!db.objectStoreNames.contains('dosePoints')) {
          db.createObjectStore('dosePoints', { keyPath: 'id', autoIncrement: true });
        }
        // Smear set metadata
        if (!db.objectStoreNames.contains('smearSets')) {
          db.createObjectStore('smearSets', { keyPath: 'id', autoIncrement: true });
        }
        // Individual smear samples
        if (!db.objectStoreNames.contains('smearSamples')) {
          db.createObjectStore('smearSamples', { keyPath: 'id', autoIncrement: true });
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = (event) => reject(event.target.error);
    });
  }

  async add(storeName, record) {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).add(record);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getAll(storeName) {
    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }
}

const db = new Database();

// -----------------------------------------------------------------------------
// Utility functions for audio recording and speech recognition
//
// pickBestMime inspects MediaRecorder support to choose a container that
// should play back on most platforms. iOS Safari cannot play WebM; thus we
// prioritise MP4 with AAC, then fallback to WebM.
function pickBestMime() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  const types = [
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm'
  ];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function extForMime(mime) {
  if (!mime) return 'dat';
  const m = mime.toLowerCase();
  if (m.includes('mp4')) return 'm4a';
  if (m.includes('webm')) return 'webm';
  if (m.includes('wav')) return 'wav';
  return 'dat';
}

// parseDoseTranscript attempts to extract structured data from a voice
// transcription. This is a naive implementation: it looks for a component
// identifier (e.g. 2E22-F001), detects reading type (GA/contact/30cm), the
// numeric value and the unit. It can be extended to handle edge cases.
function parseDoseTranscript(text) {
  const result = {
    component: null,
    type: 'GA',
    value: null,
    unit: null
  };
  if (!text) return result;
  // Normalise whitespace/case
  const t = text.toLowerCase();
  // Component: pattern of alphanumeric groups separated by a dash
  const compMatch = text.match(/[A-Za-z0-9]+-[A-Za-z0-9]+/);
  if (compMatch) result.component = compMatch[0];
  // Reading type
  if (/contact/.test(t)) result.type = 'Contact';
  if (/30\s*cm/.test(t) || /30cm/.test(t)) result.type = '30cm';
  // Value: first number
  const numMatch = text.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (numMatch) result.value = parseFloat(numMatch[1]);
  // Unit
  if (/mrem/.test(t)) result.unit = 'mrem/hr';
  else if (/r\b/.test(t)) result.unit = 'R/hr';
  return result;
}

// speak uses SpeechSynthesis to read a phrase back to the user. It returns
// a promise that resolves when speech has finished so that we can chain
// operations after readback.
function speak(text) {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => resolve();
    speechSynthesis.speak(utterance);
  });
}

// recordAudio handles obtaining microphone access, recording audio via
// MediaRecorder and returning a Blob along with the MIME type. If recording
// fails (permission denied or unsupported), an error is thrown.
async function recordAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickBestMime();
  const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  const chunks = [];
  return new Promise((resolve, reject) => {
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      resolve({ blob, mimeType: recorder.mimeType || mimeType });
    };
    recorder.onerror = (e) => {
      stream.getTracks().forEach(t => t.stop());
      reject(e.error || e);
    };
    recorder.start();
    // automatically stop after maxDuration seconds; this can be tuned
    const maxDurationMs = 5000;
    setTimeout(() => recorder.state === 'recording' && recorder.stop(), maxDurationMs);
  });
}

// transcribeAudio runs the Web Speech API to convert spoken input to text.
// It works best on Chrome/Edge; on Safari the API may be unavailable, in
// which case the promise resolves to null. The user can then manually
// classify the entry later.
async function transcribeAudio() {
  return new Promise((resolve) => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      resolve(null);
      return;
    }
    const rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      resolve(transcript);
    };
    rec.onerror = () => resolve(null);
    rec.onend = () => resolve(null);
    // Start recognition; it will automatically stop on silence
    try {
      rec.start();
    } catch (err) {
      // If recognition cannot start (e.g. user denied permission), return null
      resolve(null);
    }
  });
}

// -----------------------------------------------------------------------------
// UI / Session management

const homeEl = document.getElementById('home');
const sessionViewEl = document.getElementById('sessionView');

document.getElementById('doseBtn').addEventListener('click', () => {
  initDoseSession();
});
document.getElementById('smearCollectBtn').addEventListener('click', () => {
  alert('Smear collection not yet implemented.');
});
document.getElementById('smearCountBtn').addEventListener('click', () => {
  alert('Smear counting not yet implemented.');
});
document.getElementById('reviewBtn').addEventListener('click', () => {
  renderReview();
});
document.getElementById('settingsBtn').addEventListener('click', () => {
  alert('Settings screen not yet implemented.');
});

// Helper to generate a UUID (simple timestamp‑based)
function generateId() {
  return 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 8);
}

// Show the home screen
function showHome() {
  sessionViewEl.innerHTML = '';
  sessionViewEl.classList.add('hidden');
  homeEl.style.display = 'block';
}

// Initialise a dose session: prompts for metadata, then begins the session
function initDoseSession() {
  homeEl.style.display = 'none';
  sessionViewEl.classList.remove('hidden');
  sessionViewEl.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'session-screen';
  container.innerHTML = `
    <h2>Start Dose Session</h2>
    <label>Technician Initials
      <input id="techInitials" maxlength="3" placeholder="e.g. JDF">
    </label>
    <label>Plant Unit
      <input id="plantUnit" placeholder="e.g. Unit 2">
    </label>
    <label>Area/Elevation
      <input id="areaElev" placeholder="e.g. Turbine Floor">
    </label>
    <label>RWP / Job Number
      <input id="rwp" placeholder="e.g. RWP-1234">
    </label>
    <label>Instrument ID(s)
      <input id="instrId" placeholder="Comma separated">
    </label>
    <label>Notes
      <textarea id="sessionNotes" rows="2" placeholder="Optional notes"></textarea>
    </label>
    <div style="margin-top:1rem; text-align:center;">
      <button id="beginDose" class="primary">Begin Session</button>
      <button id="cancelDose" class="secondary" style="margin-left:0.5rem;">Cancel</button>
    </div>
  `;
  sessionViewEl.appendChild(container);
  document.getElementById('cancelDose').addEventListener('click', () => {
    showHome();
  });
  document.getElementById('beginDose').addEventListener('click', async () => {
    const session = {
      id: generateId(),
      type: 'dose',
      start_time: new Date().toISOString(),
      end_time: null,
      techInitials: document.getElementById('techInitials').value.trim(),
      plantUnit: document.getElementById('plantUnit').value.trim(),
      areaElev: document.getElementById('areaElev').value.trim(),
      rwp: document.getElementById('rwp').value.trim(),
      instrId: document.getElementById('instrId').value.trim(),
      notes: document.getElementById('sessionNotes').value.trim(),
    };
    await db.add('sessions', session);
    renderDoseSession(session);
  });
}

// Render the dose session interface: record entries, list them
function renderDoseSession(session) {
  sessionViewEl.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'session-screen';
  container.innerHTML = `
    <h2>Dose Session</h2>
    <p><strong>Session ID:</strong> ${session.id}</p>
    <p><strong>Tech:</strong> ${session.techInitials || 'N/A'}</p>
    <div id="log"></div>
    <div style="margin-top:1rem; text-align:center;">
      <button id="recordEntry" class="primary">Record Dose Entry</button>
      <button id="endSession" class="secondary" style="margin-left:0.5rem;">End Session</button>
    </div>
  `;
  sessionViewEl.appendChild(container);
  const logEl = document.getElementById('log');
  const refreshLog = async () => {
    const entries = await db.getAll('dosePoints');
    const filtered = entries.filter(e => e.sessionId === session.id);
    logEl.innerHTML = '';
    filtered.forEach(e => {
      const div = document.createElement('div');
      div.className = 'entry';
      div.innerHTML = `<strong>${e.component || '(unknown)'}</strong> – ${e.type} ${e.value || '?'} ${e.unit || ''}<br><em>Status:</em> ${e.status}`;
      logEl.appendChild(div);
    });
  };
  refreshLog();
  document.getElementById('recordEntry').addEventListener('click', async () => {
    await handleDoseEntry(session, refreshLog);
  });
  document.getElementById('endSession').addEventListener('click', async () => {
    session.end_time = new Date().toISOString();
    await db.add('sessions', session);
    speak('Session ended.').then(() => {
      alert('Session saved.');
      showHome();
    });
  });
}

// Handle the recording and confirmation of a single dose entry
async function handleDoseEntry(session, refreshLog) {
  // Provide user feedback that recording will start
  await speak('Recording. Please speak your entry now.');
  // Record audio
  let audio;
  try {
    audio = await recordAudio();
  } catch (err) {
    alert('Microphone access denied or unavailable.');
    return;
  }
  // Attempt transcription immediately
  const transcript = await transcribeAudio();
  let parsed = null;
  if (transcript) {
    parsed = parseDoseTranscript(transcript);
  }
  // Build readback message
  let readback;
  if (parsed && parsed.component && parsed.value && parsed.unit) {
    readback = `Component ${parsed.component}, ${parsed.type} reading ${parsed.value} ${parsed.unit}.`; 
  } else {
    readback = `Could not fully understand. Transcribed text: ${transcript || 'none'}.`;
  }
  // Speak the readback
  await speak(readback + ' Is this correct? Say correct or tap confirm.');
  // Display confirm/cancel UI for manual confirmation
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.right = 0;
    overlay.style.bottom = 0;
    overlay.style.background = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    const dialog = document.createElement('div');
    dialog.style.background = '#fff';
    dialog.style.padding = '1rem';
    dialog.style.borderRadius = '8px';
    dialog.style.maxWidth = '90%';
    dialog.innerHTML = `
      <p>${readback}</p>
      <p><em>Transcribed:</em> ${transcript || '(none)'}</p>
      <div style="text-align:center;">
        <button id="confirmEntry" class="primary">Confirm</button>
        <button id="retryEntry" class="secondary" style="margin-left:0.5rem;">Retry</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.getElementById('confirmEntry').addEventListener('click', async () => {
      // Save entry to DB
      const entry = {
        sessionId: session.id,
        timestamp: new Date().toISOString(),
        component: parsed ? parsed.component : null,
        type: parsed ? parsed.type : 'GA',
        value: parsed ? parsed.value : null,
        unit: parsed ? parsed.unit : null,
        transcript: transcript || null,
        status: (parsed && parsed.component && parsed.value && parsed.unit) ? 'Draft' : 'Needs Review',
        audioMime: audio.mimeType,
        audioData: null, // We'll store separately as blob
      };
      // Read audio blob as ArrayBuffer to store in IndexedDB
      const reader = new FileReader();
      reader.onloadend = async () => {
        entry.audioData = reader.result;
        await db.add('dosePoints', entry);
        document.body.removeChild(overlay);
        await speak('Entry saved.');
        await refreshLog();
        resolve();
      };
      reader.readAsArrayBuffer(audio.blob);
    });
    document.getElementById('retryEntry').addEventListener('click', () => {
      document.body.removeChild(overlay);
      speak('Let us try again.');
      resolve();
    });
  });
}

// Review screen: list sessions and allow export (CSV) for dose points
async function renderReview() {
  homeEl.style.display = 'none';
  sessionViewEl.classList.remove('hidden');
  sessionViewEl.innerHTML = '';
  const container = document.createElement('div');
  container.className = 'session-screen';
  container.innerHTML = `<h2>Review &amp; Export</h2><div id="reviewList"></div><button id="exportCsv" class="primary">Export CSV (Dose)</button><button id="backHome" class="secondary" style="margin-left:0.5rem;">Back</button>`;
  sessionViewEl.appendChild(container);
  document.getElementById('backHome').addEventListener('click', () => {
    showHome();
  });
  const reviewList = document.getElementById('reviewList');
  const entries = await db.getAll('dosePoints');
  if (entries.length === 0) {
    reviewList.textContent = 'No entries recorded yet.';
  } else {
    entries.forEach(e => {
      const div = document.createElement('div');
      div.className = 'entry';
      div.innerHTML = `<strong>${e.component || '(unknown)'}</strong> – ${e.type} ${e.value || '?'} ${e.unit || ''}<br><em>Status:</em> ${e.status}`;
      reviewList.appendChild(div);
    });
  }
  document.getElementById('exportCsv').addEventListener('click', async () => {
    const csv = await generateDoseCSV(entries);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dose_entries.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

// Generate CSV string for dose entries
async function generateDoseCSV(entries) {
  const header = ['sessionId','timestamp','component','type','value','unit','status'].join(',');
  const rows = entries.map(e => [e.sessionId, e.timestamp, e.component || '', e.type || '', e.value || '', e.unit || '', e.status || ''].join(','));
  return [header].concat(rows).join('\n');
}