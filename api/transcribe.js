// /api/transcribe — sends recorded audio to Deepgram with NZ rural vocabulary.
// Needs DEEPGRAM_API_KEY in Vercel environment variables.

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

const KEYWORDS = [
  "Growsafe:2", "glyphosate:2", "metsulfuron:2", "triclopyr:2", "clopyralid:2",
  "haloxyfop:1", "adjuvant:1", "penetrant:1", "surfactant:1", "knapsack:2",
  "hectare:2", "hectares:2", "paddock:2", "gorse:2", "ragwort:2", "thistles:2",
  "docks:2", "kikuyu:1", "buttercup:1", "boom:1", "boomless:1", "nozzle:1",
  "withholding:2", "spray:1", "drift:1", "buffer:1",
  "drench:2", "mastitis:2", "intramammary:2", "ivermectin:2", "moxidectin:1",
  "anthelmintic:1", "vaccination:1", "clostridial:1", "lepto:1", "BVD:1",
  "metabolics:1", "ketosis:1", "penicillin:1", "oxytetracycline:1", "mob:1",
  "heifers:1", "weaners:1", "lameness:1", "pour-on:1", "subcutaneous:1",
];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: "Server is missing DEEPGRAM_API_KEY. Add it in Vercel: Settings → Environments → Production, then push any commit to rebuild.",
    });
  }

  const { audio, mimeType } = req.body || {};
  if (!audio) return res.status(400).json({ error: "No audio received." });

  try {
    const buf = Buffer.from(audio, "base64");
    const params = new URLSearchParams({
      model: "nova-2",
      language: "en-NZ",
      smart_format: "true",
      punctuate: "true",
    });
    KEYWORDS.forEach((k) => params.append("keywords", k));

    const r = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": mimeType || "audio/webm",
      },
      body: buf,
    });

    const data = await r.json();
    if (!r.ok) {
      return res.status(502).json({ error: data?.err_msg || data?.error || `Deepgram returned ${r.status}` });
    }
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    if (!transcript.trim()) {
      return res.status(200).json({ transcript: "", warning: "No speech detected in the recording." });
    }
    return res.status(200).json({ transcript });
  } catch (err) {
    return res.status(502).json({ error: `Transcription failed: ${err.message}` });
  }
}
