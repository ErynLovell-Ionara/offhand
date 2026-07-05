import { useEffect, useMemo, useRef, useState } from "react";
import { TEMPLATES, getTemplate } from "./templates.js";

// ---------- storage ----------
const load = (k, fallback) => {
  try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fallback; } catch { return fallback; }
};
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

// ---------- JSON repair (handles truncation and fences) ----------
function repairJson(raw) {
  if (!raw) throw new Error("Empty response");
  let s = raw.replace(/```json|```/g, "").trim();
  const start = s.indexOf("{");
  if (start === -1) throw new Error("No JSON object in response");
  s = s.slice(start);
  try { return JSON.parse(s); } catch {}
  // Trim to last complete value, then close open strings/brackets.
  let inStr = false, esc = false;
  const stack = [];
  let lastGood = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{" || c === "[") stack.push(c);
    if (c === "}" || c === "]") { stack.pop(); lastGood = i + 1; }
    if (c === ",") lastGood = i;
  }
  let t = s.slice(0, Math.max(lastGood, 1)).replace(/,\s*$/, "");
  // Recount stack for the trimmed string
  inStr = false; esc = false; const st2 = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") st2.push("}");
    else if (c === "[") st2.push("]");
    else if (c === "}" || c === "]") st2.pop();
  }
  if (inStr) t += '"';
  while (st2.length) t += st2.pop();
  return JSON.parse(t);
}

// ---------- speech errors ----------
const MIC_ERRORS = {
  NotAllowedError: "Microphone permission is blocked for this site. Allow it in your browser's site settings (padlock or aA icon in the address bar), then reload.",
  NotFoundError: "No microphone found on this device. Type the note below instead.",
  NotReadableError: "The microphone is being used by another app. Close it and try again, or type below.",
  SecurityError: "Microphone needs a secure (https) connection. Type the note below instead.",
};

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(new Error("Couldn't read the recording"));
    r.readAsDataURL(blob);
  });

const nowStamp = () => new Date().toISOString();
const fmtDate = (iso) => new Date(iso).toLocaleString("en-NZ", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const money = (n) => "$" + Number(n).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function computeTotals(items, gst) {
  const priced = (items || []).filter((li) => li && li.rate != null && !Number.isNaN(Number(li.rate)) && !Number.isNaN(Number(li.quantity ?? 1)));
  const subtotal = priced.reduce((s, li) => s + (li.quantity ?? 1) * li.rate, 0);
  const gstAmt = gst === "exclusive" ? subtotal * 0.15 : 0;
  return { subtotal, gstAmt, total: subtotal + gstAmt, pricedCount: priced.length };
}

const parseMoney = (s) => {
  if (s == null) return null;
  const m = String(s).replace(/[^0-9.]/g, "");
  return m ? parseFloat(m) : null;
};

// ==========================================================
export default function App() {
  const [screen, setScreen] = useState("home");
  const [records, setRecords] = useState(() => load("offhand_records", []));
  const [settings, setSettings] = useState(() => load("offhand_settings", { name: "", business: "", growsafe: "", gst: "exclusive" }));
  const [showSettings, setShowSettings] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [templateId, setTemplateId] = useState(load("offhand_last_template", "spray_record"));

  useEffect(() => save("offhand_records", records), [records]);
  useEffect(() => save("offhand_settings", settings), [settings]);
  useEffect(() => save("offhand_last_template", templateId), [templateId]);

  const active = records.find((r) => r.id === activeId) || null;
  const updateActive = (patch) =>
    setRecords((rs) => rs.map((r) => (r.id === activeId ? { ...r, ...patch } : r)));

  const openRecord = (r) => {
    setActiveId(r.id);
    setScreen(r.status === "final" ? "doc" : "review");
  };

  return (
    <div className="shell">
      <header className="topbar no-print">
        <button className="brand" onClick={() => setScreen("home")}>Offhand</button>
        <button className="ghost" onClick={() => setShowSettings(true)}>Settings</button>
      </header>

      {screen === "home" && (
        <Home
          records={records}
          templateId={templateId}
          setTemplateId={setTemplateId}
          onStart={() => setScreen("capture")}
          onOpen={openRecord}
          onDeleteDraft={(id) => setRecords((rs) => rs.filter((r) => r.id !== id))}
        />
      )}

      {screen === "capture" && (
        <Capture
          template={getTemplate(templateId)}
          onCancel={() => setScreen("home")}
          onExtracted={(rec) => {
            setRecords((rs) => [rec, ...rs]);
            setActiveId(rec.id);
            setScreen("review");
          }}
        />
      )}

      {screen === "review" && active && (
        <Review
          record={active}
          settings={settings}
          update={updateActive}
          switchTemplate={(tid) => updateActive({ templateId: tid, flags: { ...active.flags, template_suggestion: null } })}
          onFinalise={() => {
            updateActive({ status: "final", finalisedAt: nowStamp(), version: (active.version || 0) + 1 });
            setScreen("doc");
          }}
          onBack={() => setScreen("home")}
        />
      )}

      {screen === "doc" && active && (
        <DocumentView record={active} settings={settings} onBack={() => setScreen("home")}
          onAmend={() => { updateActive({ status: "draft" }); setScreen("review"); }} />
      )}

      {showSettings && (
        <SettingsModal settings={settings} setSettings={setSettings} close={() => setShowSettings(false)} />
      )}
    </div>
  );
}

// ---------------- Home ----------------
function Home({ records, templateId, setTemplateId, onStart, onOpen, onDeleteDraft }) {
  return (
    <main className="page">
      <p className="lede">Say it on site. Send it before you leave.</p>

      <div className="tpl-grid">
        {TEMPLATES.map((t) => (
          <button key={t.id}
            className={"tpl" + (t.id === templateId ? " tpl-on" : "")}
            onClick={() => setTemplateId(t.id)}>
            <span className="tpl-name">{t.name}</span>
            <span className="tpl-tag">{t.tagline}</span>
          </button>
        ))}
      </div>

      <button className="record-cta" onClick={onStart}>
        <span className="record-dot" /> New {getTemplate(templateId).name.toLowerCase()}
      </button>

      <h2 className="section-h">Records</h2>
      {records.length === 0 && <p className="empty">Nothing yet. Record your first note above.</p>}
      <ul className="rec-list">
        {records.map((r) => {
          const t = getTemplate(r.templateId);
          return (
            <li key={r.id} className="rec-row">
              <button className="rec-open" onClick={() => onOpen(r)}>
                <span className="rec-title">{t.name}{r.fields?.client ? " — " + r.fields.client : ""}</span>
                <span className="rec-meta mono">{fmtDate(r.createdAt)} · {r.status === "final" ? "Finalised v" + r.version : "Draft"}</span>
              </button>
              {r.status !== "final" && (
                <button className="rec-del" onClick={() => onDeleteDraft(r.id)} aria-label="Delete draft">✕</button>
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}

// ---------------- Capture ----------------
function Capture({ template, onCancel, onExtracted }) {
  const [supported] = useState(() => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder));
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [micError, setMicError] = useState(supported ? null : "This browser doesn't support voice recording. Type the note below — everything else works the same.");
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => () => { clearInterval(timerRef.current); recRef.current?.stream?.getTracks().forEach((t) => t.stop()); }, []);

  const start = async () => {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        setListening(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 1000) { setMicError("The recording was empty. Try again, or type below."); return; }
        setTranscribing(true);
        try {
          const audio = await blobToBase64(blob);
          const r = await fetch("/api/transcribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ audio, mimeType: blob.type }),
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || `Server error ${r.status}`);
          if (data.warning) setMicError(data.warning + " Try again, or type below.");
          if (data.transcript) setTranscript((p) => (p + " " + data.transcript).trim());
        } catch (err) {
          setMicError("Transcription failed: " + err.message);
        } finally {
          setTranscribing(false);
        }
      };
      recRef.current = rec;
      rec.start();
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => {
        if (s + 1 >= 180) { try { rec.stop(); } catch {} }
        return s + 1;
      }), 1000);
      setListening(true);
    } catch (err) {
      setMicError(MIC_ERRORS[err.name] || `Couldn't start the microphone (${err.name || err.message}). Type the note below instead.`);
    }
  };

  const stop = () => { if (recRef.current?.state === "recording") recRef.current.stop(); };

  const sortIt = async () => {
    setBusy(true);
    setApiError(null);
    let gps = null;
    try {
      gps = await new Promise((res) => {
        if (!navigator.geolocation) return res(null);
        navigator.geolocation.getCurrentPosition(
          (p) => res({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }),
          () => res(null), { timeout: 3000 });
      });
    } catch { gps = null; }

    try {
      const r = await fetch("/api/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transcript, template: { id: template.id, name: template.name, promptBlock: template.promptBlock, fields: template.fields } }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Server error ${r.status}`);
      const parsed = repairJson(data.raw);
      onExtracted({
        id: crypto.randomUUID(),
        templateId: template.id,
        createdAt: nowStamp(),
        gps,
        transcript: transcript.trim(),
        fields: parsed.fields || {},
        followUps: parsed.followUps || [],
        flags: parsed.flags || {},
        status: "draft",
        version: 0,
      });
    } catch (err) {
      setApiError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <button className="ghost back" onClick={onCancel}>← Back</button>
      <h1 className="cap-h">{template.name}</h1>
      <p className="cap-sub">Just talk. Client, where, what you did, numbers, conditions — any order.</p>

      {supported && (
        <div className="mic-wrap">
          <button className={"mic" + (listening ? " mic-live" : "")} disabled={transcribing}
            onClick={listening ? stop : start}>
            {listening ? "Done" : transcribing ? "…" : "Speak"}
          </button>
          {listening && <p className="mic-state">Recording {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")} — tap Done when finished</p>}
          {transcribing && <p className="mic-state" style={{ color: "var(--green-deep)" }}>Writing it down…</p>}
        </div>
      )}

      {micError && <div className="warn">{micError}</div>}

      <textarea
        className="transcript"
        placeholder="Your note appears here — or type it."
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        rows={7}
      />

      {apiError && <div className="error">Couldn't sort the note: {apiError}</div>}

      <button className="primary" disabled={!transcript.trim() || busy} onClick={sortIt}>
        {busy ? "Sorting…" : "Sort it"}
      </button>
    </main>
  );
}

// ---------------- Review ----------------
// Guided voice gap-fill: reads each missing field's question aloud, records the
// answer, transcribes it via the same Deepgram pipeline, fills it, moves on.
function GapFiller({ gaps, questionFor, onFill, onDone }) {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | asking | listening | working
  const [heard, setHeard] = useState("");
  const [err, setErr] = useState(null);
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const canTTS = typeof window !== "undefined" && "speechSynthesis" in window;

  const field = gaps[i];
  const q = field ? (questionFor(field.key) || `What's the ${field.label.toLowerCase()}?`) : null;

  const speak = (text) => new Promise((res) => {
    if (!canTTS) return res();
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-NZ"; u.rate = 1; u.onend = res; u.onerror = res;
      window.speechSynthesis.speak(u);
      setTimeout(res, 6000); // safety net
    } catch { res(); }
  });

  const askAndListen = async () => {
    setErr(null); setHeard(""); setPhase("asking");
    await speak(q);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setPhase("working");
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 800) { setErr("Didn't catch that — tap to try again."); setPhase("idle"); return; }
        try {
          const audio = await blobToBase64(blob);
          const r = await fetch("/api/transcribe", {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ audio, mimeType: blob.type }),
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || "transcription error");
          const answer = (data.transcript || "").trim();
          if (!answer) { setErr("Didn't catch that — tap to try again."); setPhase("idle"); return; }
          setHeard(answer);
          onFill(field, answer);
          setPhase("confirm");
        } catch (e) { setErr(e.message); setPhase("idle"); }
      };
      recRef.current = rec;
      rec.start();
      setPhase("listening");
    } catch (e) {
      setErr(MIC_ERRORS[e.name] || "Couldn't reach the microphone. Fill this one by typing below.");
      setPhase("idle");
    }
  };

  const stopListening = () => { if (recRef.current?.state === "recording") recRef.current.stop(); };
  const next = () => { setHeard(""); setPhase("idle"); if (i + 1 < gaps.length) setI(i + 1); else onDone(); };

  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch {} }, []);

  if (!field) return null;

  return (
    <div className="gapfill">
      <div className="gapfill-progress mono">Gap {i + 1} of {gaps.length}</div>
      <div className="gapfill-q">{q}</div>

      {phase === "idle" && (
        <button className="gapfill-mic" onClick={askAndListen}>
          {canTTS ? "Ask me & answer" : "Tap and answer"}
        </button>
      )}
      {phase === "asking" && <div className="gapfill-state">Reading the question…</div>}
      {phase === "listening" && (
        <button className="gapfill-mic gapfill-live" onClick={stopListening}>Listening — tap when done</button>
      )}
      {phase === "working" && <div className="gapfill-state">Writing it down…</div>}
      {phase === "confirm" && (
        <div className="gapfill-confirm">
          <div className="gapfill-heard">“{heard}”</div>
          <div className="gapfill-actions">
            <button className="mini" onClick={next}>{i + 1 < gaps.length ? "Next gap" : "Done"}</button>
            <button className="mini ghost" onClick={() => { onFill(field, null); askAndListen(); }}>Redo</button>
          </div>
        </div>
      )}

      {err && <div className="warn" style={{ marginTop: 10 }}>{err}</div>}
      <button className="gapfill-skip" onClick={next}>Skip — I'll type this one</button>
    </div>
  );
}

function Review({ record, settings, update, switchTemplate, onFinalise, onBack }) {
  const template = getTemplate(record.templateId);
  const [guiding, setGuiding] = useState(false);
  const setField = (key, value) => update({ fields: { ...record.fields, [key]: value } });
  const questionFor = (key) => (record.followUps || []).find((f) => f.field === key)?.question || null;

  const fieldMissing = (f) => {
    const v = record.fields[f.key];
    if (f.type === "lineitems") {
      const items = (v || []).filter((li) => li && (li.description || "").trim());
      if (items.length === 0) return true;
      // Spec: a quote needs at least one line item with a rate, or a stated total.
      if (record.templateId === "quote")
        return !items.some((li) => li.rate != null && !Number.isNaN(Number(li.rate))) && isEmpty(record.fields.stated_total);
      return false;
    }
    return isEmpty(v);
  };
  const missing = template.fields.filter((f) => f.required && fieldMissing(f));
  const totals = template.computedTotals ? computeTotals(record.fields.line_items, settings.gst) : null;
  const stated = template.computedTotals ? parseMoney(record.fields.stated_total) : null;
  const discrepancy = totals && stated != null && Math.abs(stated - totals.total) > 1 && Math.abs(stated - totals.subtotal) > 1;

  return (
    <main className="page">
      <button className="ghost back no-print" onClick={onBack}>← Records</button>
      <h1 className="cap-h">Check the gaps</h1>
      <p className="cap-sub">{template.name} · {fmtDate(record.createdAt)}</p>

      {record.flags?.notifiable && (
        <div className="notify">
          <strong>This may be a notifiable event.</strong> Deaths, serious injuries, and dangerous incidents must be
          reported to WorkSafe NZ as soon as possible, and the site may need to be preserved. This app does not notify
          anyone — call WorkSafe on 0800 030 040.
        </div>
      )}

      {record.flags?.template_suggestion && getTemplate(record.flags.template_suggestion) && (
        <div className="suggest">
          This sounds like a <strong>{getTemplate(record.flags.template_suggestion).name.toLowerCase()}</strong>.
          <button className="mini" onClick={() => switchTemplate(record.flags.template_suggestion)}>Switch template</button>
          <button className="mini ghost" onClick={() => update({ flags: { ...record.flags, template_suggestion: null } })}>Keep as is</button>
        </div>
      )}

      {discrepancy && (
        <div className="warn">
          You said the total was <strong>{money(stated)}</strong> but the line items compute to{" "}
          <strong>{money(totals.total)}</strong>{settings.gst === "exclusive" ? " incl. GST" : ""}. Fix the line items
          or the spoken total — the document will only ever show the computed figure.
        </div>
      )}

      {missing.length > 0 && !guiding && (
        <div className="gap-invite">
          <div>
            <strong>{missing.length} thing{missing.length > 1 ? "s" : ""} still missing.</strong> Want to fill {missing.length > 1 ? "them" : "it"} in by voice?
          </div>
          <button className="mini" onClick={() => setGuiding(true)}>Fill by voice</button>
        </div>
      )}

      {guiding && (
        <GapFiller
          gaps={missing}
          questionFor={questionFor}
          onFill={(f, val) => setField(f.key, val)}
          onDone={() => setGuiding(false)}
        />
      )}

      <div className="fields">
        {template.fields.map((f) => (
          <FieldEditor key={f.key} field={f} value={record.fields[f.key]} onChange={(v) => setField(f.key, v)}
            required={f.required} question={isEmpty(record.fields[f.key]) ? questionFor(f.key) : null} />
        ))}
      </div>

      {totals && totals.pricedCount > 0 && (
        <div className="totals">
          <span>Subtotal {money(totals.subtotal)}</span>
          {settings.gst === "exclusive" && <span>GST {money(totals.gstAmt)}</span>}
          {settings.gst !== "not_registered" && <span className="totals-big">Total {money(totals.total)}</span>}
          {settings.gst === "not_registered" && <span className="totals-big">Total {money(totals.subtotal)} (not GST registered)</span>}
        </div>
      )}

      <button className="primary" disabled={missing.length > 0} onClick={onFinalise}>
        {missing.length > 0 ? `${missing.length} required field${missing.length > 1 ? "s" : ""} to go` : "Finalise & lock"}
      </button>
      <p className="fineprint">Finalising locks this record. Later edits create a new version — nothing is overwritten.</p>
    </main>
  );
}

const isEmpty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

function FieldEditor({ field, value, onChange, required, question }) {
  const missing = required && isEmpty(value);
  const q = question ? <div className="gap-q">{question}</div> : null;
  if (field.type === "list") {
    const items = value || [];
    return (
      <div className={"field" + (missing ? " field-gap" : "")}>
        <label>{field.label}{required && " *"}</label>
        {q}
        {items.map((it, i) => (
          <div className="list-row" key={i}>
            <input className="input" value={it}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <button className="rec-del" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="mini ghost" onClick={() => onChange([...items, ""])}>+ Add</button>
      </div>
    );
  }
  if (field.type === "lineitems") {
    const items = value || [];
    return (
      <div className={"field" + (missing ? " field-gap" : "")}>
        <label>{field.label}{required && " *"}</label>
        {q}
        {items.map((li, i) => (
          <div className="li-row" key={i}>
            <input className="input li-desc" placeholder="Description" value={li.description || ""}
              onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
            <input className="input li-num" placeholder="Qty" inputMode="decimal" value={li.quantity ?? ""}
              onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, quantity: e.target.value === "" ? null : parseFloat(e.target.value) } : x))} />
            <input className="input li-unit" placeholder="Unit" value={li.unit || ""}
              onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} />
            <input className="input li-num" placeholder="Rate" inputMode="decimal" value={li.rate ?? ""}
              onChange={(e) => onChange(items.map((x, j) => j === i ? { ...x, rate: e.target.value === "" ? null : parseFloat(e.target.value) } : x))} />
            <button className="rec-del" onClick={() => onChange(items.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="mini ghost" onClick={() => onChange([...items, { description: "", quantity: null, unit: "", rate: null }])}>+ Add line</button>
      </div>
    );
  }
  const Tag = field.type === "longtext" ? "textarea" : "input";
  return (
    <div className={"field" + (missing ? " field-gap" : "")}>
      <label>{field.label}{required && " *"}{field.hint && <span className="hint"> — {field.hint}</span>}</label>
      {q}
      <Tag className="input" rows={field.type === "longtext" ? 3 : undefined}
        value={value ?? ""} placeholder={missing ? "Missing — tap to fill" : ""}
        onChange={(e) => onChange(e.target.value || null)} />
    </div>
  );
}

// ---------------- Document ----------------
function DocumentView({ record, settings, onBack, onAmend }) {
  const template = getTemplate(record.templateId);
  const totals = template.computedTotals ? computeTotals(record.fields.line_items, settings.gst) : null;
  const sections = useMemo(() => {
    const bySection = {};
    template.fields.forEach((f) => {
      const s = f.section || "";
      (bySection[s] = bySection[s] || []).push(f);
    });
    return bySection;
  }, [template]);
  const showTranscript = record.templateId === "claim" || record.templateId === "incident";

  return (
    <main className="page doc-page">
      <div className="no-print doc-actions">
        <button className="ghost back" onClick={onBack}>← Records</button>
        <div>
          <button className="mini ghost" onClick={onAmend}>Amend (new version)</button>
          <button className="primary slim" onClick={() => window.print()}>Print / Save PDF</button>
        </div>
      </div>

      <article className="doc">
        <header className="doc-head">
          <div>
            <h1>{template.name}</h1>
            <p className="mono doc-id">{record.id.slice(0, 8).toUpperCase()} · v{record.version} · Finalised {fmtDate(record.finalisedAt || record.createdAt)}</p>
          </div>
          <div className="doc-org">
            <strong>{settings.business || settings.name || "—"}</strong>
            {settings.name && <span>{settings.name}</span>}
            {record.templateId === "spray_record" && settings.growsafe && <span>Growsafe {settings.growsafe}</span>}
          </div>
        </header>

        <div className="doc-meta mono">
          Recorded {fmtDate(record.createdAt)}
          {record.gps && <> · GPS {record.gps.lat}, {record.gps.lng}</>}
        </div>

        {Object.entries(sections).map(([sec, fields]) => (
          <section key={sec || "main"}>
            {sec && <h2 className="doc-sec">{sec}</h2>}
            <dl>
              {fields.map((f) => {
                const v = record.fields[f.key];
                if (isEmpty(v)) return null;
                return (
                  <div className="doc-row" key={f.key}>
                    <dt>{f.label}</dt>
                    <dd>{renderValue(f, v)}</dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}

        {totals && totals.pricedCount > 0 && (
          <section className="doc-totals">
            <div className="doc-row"><dt>Subtotal</dt><dd>{money(totals.subtotal)}</dd></div>
            {settings.gst === "exclusive" && <div className="doc-row"><dt>GST 15%</dt><dd>{money(totals.gstAmt)}</dd></div>}
            <div className="doc-row doc-total">
              <dt>Total</dt>
              <dd>{settings.gst === "not_registered" ? money(totals.subtotal) + " (not GST registered)" : money(totals.total)}</dd>
            </div>
            {record.templateId === "quote" && (
              <p className="fineprint">Valid {record.fields.validity || "30 days"}. Reply to accept.</p>
            )}
          </section>
        )}

        {showTranscript && record.transcript && (
          <section>
            <h2 className="doc-sec">Appendix — original spoken note</h2>
            <p className="doc-transcript">"{record.transcript}"</p>
          </section>
        )}

        <footer className="doc-foot mono">
          Locked record · version {record.version} · created with Offhand
        </footer>
      </article>
    </main>
  );
}

function renderValue(field, v) {
  if (field.type === "list") return <ul className="doc-list">{v.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  if (field.type === "lineitems")
    return (
      <table className="doc-li">
        <tbody>
          {v.map((li, i) => (
            <tr key={i}>
              <td>{li.description}</td>
              <td className="num">{li.quantity ?? ""} {li.unit ?? ""}</td>
              <td className="num">{li.rate != null ? money(li.rate) : ""}</td>
              <td className="num">{li.rate != null ? money((li.quantity ?? 1) * li.rate) : "unpriced"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  return String(v);
}

// ---------------- Settings ----------------
function SettingsModal({ settings, setSettings, close }) {
  const [s, setS] = useState(settings);
  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Your details</h2>
        <label>Your name<input className="input" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></label>
        <label>Business name<input className="input" value={s.business} onChange={(e) => setS({ ...s, business: e.target.value })} /></label>
        <label>Growsafe cert number<input className="input" value={s.growsafe} onChange={(e) => setS({ ...s, growsafe: e.target.value })} /></label>
        <label>GST
          <select className="input" value={s.gst} onChange={(e) => setS({ ...s, gst: e.target.value })}>
            <option value="exclusive">Registered — prices exclude GST</option>
            <option value="inclusive">Registered — prices include GST</option>
            <option value="not_registered">Not GST registered</option>
          </select>
        </label>
        <div className="modal-actions">
          <button className="ghost" onClick={close}>Cancel</button>
          <button className="primary slim" onClick={() => { setSettings(s); close(); }}>Save</button>
        </div>
      </div>
    </div>
  );
}
