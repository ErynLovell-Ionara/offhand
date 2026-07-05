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
  "not-allowed": "Microphone permission is blocked for this site. Allow it in your browser's site settings, or type the note below.",
  "service-not-allowed": "Microphone permission is blocked for this site. Allow it in your browser's site settings, or type the note below.",
  "no-speech": "No speech detected. Try again closer to the mic, or type the note below.",
  "audio-capture": "No microphone found on this device. Type the note below instead.",
  "network": "This browser's speech service needs an internet connection. Type the note below instead.",
  "aborted": null,
};

const nowStamp = () => new Date().toISOString();
const fmtDate = (iso) => new Date(iso).toLocaleString("en-NZ", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const money = (n) => "$" + Number(n).toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function computeTotals(items, gst) {
  const priced = (items || []).filter((li) => li && li.rate != null);
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
  const [supported] = useState(() => "webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [micError, setMicError] = useState(supported ? null : "This browser doesn't support voice capture. Type the note below — everything else works the same.");
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState(null);
  const recRef = useRef(null);

  const start = () => {
    setMicError(null);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-NZ";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let fin = "", tmp = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += t + " ";
        else tmp += t;
      }
      if (fin) setTranscript((p) => (p + " " + fin).trim());
      setInterim(tmp);
    };
    rec.onerror = (e) => {
      const msg = MIC_ERRORS[e.error];
      if (msg !== null) setMicError(msg || `Microphone error (${e.error}). Type the note below instead.`);
      setListening(false);
    };
    rec.onend = () => { setListening(false); setInterim(""); };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch (err) {
      setMicError("Couldn't start the microphone: " + err.message + ". Type the note below instead.");
    }
  };

  const stop = () => { recRef.current?.stop(); setListening(false); };

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
          <button className={"mic" + (listening ? " mic-live" : "")} onClick={listening ? stop : start}>
            {listening ? "Stop" : "Speak"}
          </button>
          {listening && <p className="mic-state">Listening…</p>}
        </div>
      )}

      {micError && <div className="warn">{micError}</div>}

      <textarea
        className="transcript"
        placeholder="Your note appears here — or type it."
        value={transcript + (interim ? " " + interim : "")}
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
function Review({ record, settings, update, switchTemplate, onFinalise, onBack }) {
  const template = getTemplate(record.templateId);
  const setField = (key, value) => update({ fields: { ...record.fields, [key]: value } });
  const clearFollowUp = (key) => update({ followUps: record.followUps.filter((f) => f.field !== key), fields: record.fields });

  const missing = template.fields.filter((f) => f.required && isEmpty(record.fields[f.key]));
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

      {(record.followUps || []).filter((f) => isEmpty(record.fields[f.field])).map((f) => (
        <div className="gap" key={f.field}>
          <label className="gap-q">{f.question}</label>
          <input className="input" placeholder={template.fields.find((x) => x.key === f.field)?.label || f.field}
            onBlur={(e) => { if (e.target.value.trim()) { setField(f.field, e.target.value.trim()); clearFollowUp(f.field); } }}
            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
        </div>
      ))}

      {discrepancy && (
        <div className="warn">
          You said the total was <strong>{money(stated)}</strong> but the line items compute to{" "}
          <strong>{money(totals.total)}</strong>{settings.gst === "exclusive" ? " incl. GST" : ""}. Fix the line items
          or the spoken total — the document will only ever show the computed figure.
        </div>
      )}

      <div className="fields">
        {template.fields.map((f) => (
          <FieldEditor key={f.key} field={f} value={record.fields[f.key]} onChange={(v) => setField(f.key, v)} required={f.required} />
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

function FieldEditor({ field, value, onChange, required }) {
  const missing = required && isEmpty(value);
  if (field.type === "list") {
    const items = value || [];
    return (
      <div className={"field" + (missing ? " field-gap" : "")}>
        <label>{field.label}{required && " *"}</label>
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
