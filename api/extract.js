// /api/extract — Vercel serverless function.
// Keeps ANTHROPIC_API_KEY server-side. The browser never sees it.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Server is missing ANTHROPIC_API_KEY. Add it in Vercel: Project → Settings → Environment Variables, then redeploy.",
    });
  }

  const { transcript, template } = req.body || {};
  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: "Empty transcript." });
  }
  if (!template || !template.fields) {
    return res.status(400).json({ error: "Missing template definition." });
  }

  const fieldLines = template.fields
    .map((f) => {
      const req_ = f.required ? " (REQUIRED)" : "";
      const type =
        f.type === "list"
          ? "array of strings"
          : f.type === "lineitems"
          ? 'array of {"description": string, "quantity": number|null, "unit": string|null, "rate": number|null}'
          : "string";
      return `- "${f.key}"${req_}: ${type} — ${f.label}`;
    })
    .join("\n");

  const system = `You extract structured field documentation from a spoken transcript for a "${template.name}" document.

Rules that override everything else:
1. Extract ONLY what was actually said. Never invent, infer, or guess values. Every number in your output must be traceable to the transcript.
2. Any field not covered in the transcript is null (or [] for arrays). Missing is correct; guessed is wrong.
3. For every REQUIRED field that is null, add a followUps entry: {"field": key, "question": a short plain question a contractor can answer in a few words}.
4. Normalise spoken numbers ("three litres a hectare" -> "3 L/ha") but never change their value.
5. Respond with ONLY a JSON object, no preamble, no markdown fences.

${template.promptBlock}

Output JSON shape:
{
  "fields": { ${template.fields.map((f) => `"${f.key}": ...`).join(", ")} },
  "followUps": [{"field": "...", "question": "..."}],
  "flags": {"notifiable": boolean (only if clearly indicated), "multi_job": boolean, "template_suggestion": string|null (another template id from [spray_record, job_sheet, quote, site_visit, incident, claim, animal_treatment, vet_consult] ONLY if the transcript clearly matches it better, else null)}
}

Fields for this template:
${fieldLines}`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system,
        messages: [{ role: "user", content: `Transcript:\n"""\n${transcript}\n"""` }],
      }),
    });

    const data = await r.json();
    if (!r.ok) {
      const msg = data?.error?.message || `Anthropic API returned ${r.status}`;
      return res.status(502).json({ error: msg });
    }
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return res.status(200).json({ raw: text });
  } catch (err) {
    return res.status(502).json({ error: `Extraction call failed: ${err.message}` });
  }
}
