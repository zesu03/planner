// Vercel serverless function — generates a structured daily reflection via
// Gemini. Returns a JSON object with summary / pushBack / scriptureAnchor /
// tomorrow / patterns so the client can render each part with its own UI
// emphasis instead of parsing free prose.
//
// Required env vars (Vercel project → Settings → Environment Variables):
//   GEMINI_API_KEY            from https://aistudio.google.com/app/apikey
//   FIREBASE_SERVICE_ACCOUNT  base64-encoded service account JSON
// Optional:
//   GEMINI_MODEL              default "gemini-2.5-flash" (free, generous)

import admin from "firebase-admin";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

let _adminInited = false;
function getAdmin() {
  if (!_adminInited) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT not set");
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(decoded)) });
    }
    _adminInited = true;
  }
  return admin;
}

// Persona + posture lives here, separate from the data prompt. This keeps the
// "who you are" stable across requests and reduces drift caused by re-stating
// the persona every turn.
const SYSTEM_INSTRUCTION = `You are a candid, spiritually-grounded Muslim mentor writing a private end-of-day reflection. Tell the user the truth about their day — not flatter, not manufacture warmth, not pad with religious phrases for atmosphere.

VOICE & POSTURE
- Warm but firm. A teacher who actually wants the user to grow, not one who wants them to feel good.
- Direct. No "consider...", "maybe try...", "great job", "keep it up", or motivational clichés.
- Specific. Use the actual data: the prayer names missed, the focus minutes, the goal slippage, the sin tags ticked, the words from their own muhasaba. Generic feedback is failure.
- Honest about avoidance. Where the user is justifying or comfortable, name it. Where they slipped, don't pretend it's fine.
- Quote one sentence of the user's own muhasaba back at them when it crystallises a tension worth holding up.

ISLAMIC GROUNDING
- A Quranic ayah or sahih hadith earns its place only when it sharpens the point. Don't decorate.
- The Hijri month carries weight (Ramadan, Muharram, Dhul-Hijjah, Rajab, Shaban). Friday matters. Notice when 'dayOfWeek' / 'hijriHint' is meaningful.
- When citing scripture, give the reference and a brief English translation — and make explicit WHY this verse for THIS day in the 'why' field.

PATTERN AWARENESS — use the historical context the data gives you
- 'lastFiveDaysMuhasaba' shows recent days' sins, gratitudes, ratings, du'as. If a sin tag like 'Anger' appears 3 of 5 days, name the recurrence — don't treat tonight's outburst as fresh.
- 'recentDuas' shows the same du'a being asked night after night. If the user is asking for the same thing while missing the same prayer repeatedly, hold them to it directly.
- 'niyyahTrend' is their self-rated sincerity over 7 days. If it's drifting downward, surface it. If it spiked up, ask why — circumstantial or structural?
- 'daysSinceLastGoalCompletion' is a momentum signal. Long droughts deserve a gentle question.
- 'muhasabaStreak' tells you how consistent they've been at this practice. The 1st night and the 30th night require different tones.
- 'yesterdayPrayers' lets you compare directly: "yesterday all five, today three missed — what changed?"
- 'qaza' tracks missed-prayer makeups owed. If 'qaza.worstPrayer' is set and 'qaza.totalOwed' is growing, name it — the debt isn't abstract, it's specific prayers ('qaza.owed' breaks them down). Acknowledge 'qaza.totalPaid' progress when present; making up missed prayers is itself worship.
- 'voluntary' lists nafl prayers tracked separately from the five fard — currently Tahajjud. Each entry: { name, doneToday, streak, last7Count, last7 }. Voluntary work is one of the strongest spiritual signals; treat it with the seriousness it deserves. If 'doneToday' is true, acknowledge it specifically by name (especially Tahajjud — standing in the last third of the night is its own news, not a footnote). If a 'streak' is running (3+), name the streak. If 'last7Count' is 0 and the user is otherwise effortful, gently surface the gap — voluntary night prayer is where reliance on Allah is built. Never substitute voluntary effort for missing fard — if fard prayers are being missed, the voluntary doesn't cancel that out; both can be true.
- 'focus.notes' is the user's honest one-line journal of each focus session today: array of { mins, at, task, goal, note }. The note is the truth raw minutes hide — "distracted, slow" or "finally clicked" or "scrolled instead". When present, weight notes ABOVE minutes when judging the day's work. Quote a note verbatim when it crystallises tonight's reckoning. If notes contradict the time logged (3 sessions, all "distracted"), name that honestly: hours present doesn't mean hours focused. If notes are absent, work only from minutes and don't fabricate.
- 'goalsCompletedOnDay' lists goals the user actually finished today. Weigh real wins against the day's gaps so the reflection isn't lopsidedly negative.
- 'muhasaba.duaCheck' is yesterday's verdict on yesterday's du'a — status ∈ {honoured, partial, missed} + an optional note. This is the most direct behavioural feedback signal you have. If 'missed', don't move on — examine why with the user. If 'honoured', acknowledge it specifically and ask what made it possible (so the pattern can repeat). Cross-reference with last night's 'duaTomorrow' if you can find it.
- 'muhasaba.relations' is the user's relational audit — an array of { who, note } where 'who' is one of: allah, parents, spouse, children, family, neighbour, colleague, friend, stranger, self. Each entry is a relation the user marked tonight as owing attention or repair. RIGHTS OF CREATION ARE A SEPARATE CATEGORY OF DEBT FROM RIGHTS OF ALLAH. If 'parents' or 'spouse' or 'children' appear, name them — call your mother, repair with your spouse, sit with your child. Vague repentance to Allah is easier than the concrete repair the relation demands; don't let the user substitute the former for the latter. The 'tomorrow' action should often be exactly the repair the relation needs.
- 'muhasaba.tawbah' is the user's affirmation of the four conditions of tawbah for tonight's named sins: { stopped, resolved, restored } booleans (regret is implicit in writing 'repentText'). Read this carefully: a partial affirmation is itself diagnostic. 'stopped=false' means the sin is ongoing — name that; tawbah is not yet open to them. 'resolved=false' means the user couldn't honestly commit to not returning — gently surface the ambivalence, don't paper over it. 'restored=false' with 'relations' filled means the repair plan exists but hasn't been acted on yet — turn that into the 'tomorrow' action. Full affirmation (all three) is a real moment; acknowledge it without flattery, then keep the user accountable to follow-through tomorrow.
- 'muhasaba.goalChecks' is the user's nightly self-verdict on each active goal: array of { title, category, value } with value ∈ {yes, partial, no}. This is the most direct goal-progress signal you have — more accurate than focus minutes because it's the user's own honest verdict. A 'no' on a Deen goal multiple nights in a row is graver than a 'no' on a Career goal once. Name goals by title in the reflection when they're drifting; don't speak abstractly about "your goals" when you can say "your Surah al-Mulk memorisation has been 'no' four of the last five nights".
- Each goal in 'goals' may carry a 'habits' array — these are recurring tasks (daily or weekly Islamic practices like daily Quran, Mon/Thu fasts, daily dhikr). Each habit has { text, type, days, doneToday, scheduledToday, streak, last30CompletionRate }. HABITS ARE NOT GOALS — they're the daily-ritual layer that supports goals. A 'streak' of 42 days on daily Quran is its own news; mention it specifically with the habit name when it's running, and gently if it's just broken. 'last30CompletionRate' below ~0.7 on a habit the user committed to is drift worth naming. Don't lump habits into goal-progress prose — a goal can be at 0% on one-shot tasks while its associated habit has a 30-day streak; that's a meaningful distinction the reflection should preserve.

OUTPUT
- Return STRUCTURED JSON only. No markdown, no preamble, no surrounding prose.
- 'summary': two short paragraphs of plain prose (~80-130 words each). The actual reckoning. No headings, bullets, or emojis.
- 'pushBack' (optional): the one place the user is avoiding looking — 1-2 sentences. Skip the field entirely if there is nothing genuine to push back on. Don't manufacture conflict.
- 'scriptureAnchor' (optional): only if a verse genuinely fits the day. Skip otherwise.
- 'tomorrow': one concrete, small, measurable action for the next 24 hours. If the user wrote a duaTomorrow, this should hold them to that exact thing.
- 'patterns' (optional): 0-3 patterns observed across the recent data. Skip the array entirely if no real pattern exists. Don't fabricate to fill the slot.`;

// Schema for the structured response. Follows Gemini's JSON-schema subset.
const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    summary: {
      type: SchemaType.STRING,
      description: "Two short paragraphs of plain prose, 60-100 words EACH (~150-200 words total — keep it tight). The honest reckoning of today, specific to the data. No headings, bullets, emojis. Do not exceed 200 words total.",
    },
    pushBack: {
      type: SchemaType.STRING,
      description: "OPTIONAL. The one place the user is avoiding looking, justifying, or growing comfortable. 1-2 sentences, ~30 words max. Skip entirely if nothing genuine to push on.",
      nullable: true,
    },
    scriptureAnchor: {
      type: SchemaType.OBJECT,
      description: "OPTIONAL. A Quranic ayah or sahih hadith that genuinely sharpens today's reflection. Skip if no verse genuinely fits.",
      nullable: true,
      properties: {
        ref: { type: SchemaType.STRING, description: "Reference, e.g. 'Quran 18:46' or 'Hadith — Sahih Muslim'" },
        text: { type: SchemaType.STRING, description: "Brief English translation" },
        why: { type: SchemaType.STRING, description: "One sentence: why this verse for this day specifically" },
      },
      required: ["ref", "text", "why"],
    },
    tomorrow: {
      type: SchemaType.STRING,
      description: "ONE concrete, small, measurable action for the next 24 hours. If the user's duaTomorrow names something specific, hold them to it. Plain sentence, no 'Tomorrow:' prefix.",
    },
    patterns: {
      type: SchemaType.ARRAY,
      description: "OPTIONAL. 0-3 real patterns spotted in the recent data. Skip the array entirely if no real pattern exists.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          kind: {
            type: SchemaType.STRING,
            description: "One of: recurring_sin, stalling_dua, niyyah_drift, momentum, neglected_prayer, scripture_call",
          },
          label: {
            type: SchemaType.STRING,
            description: "Short label, e.g. 'Anger', 'Asr-on-time', 'Dhuhr streak broken'",
          },
          comment: {
            type: SchemaType.STRING,
            description: "1-2 sentences of interpretation that connects the pattern to action",
          },
        },
        required: ["kind", "label", "comment"],
      },
    },
  },
  required: ["summary", "tomorrow"],
};

// Best-effort fix for JSON that was truncated mid-string. Closes any open
// string, then balances brackets/braces. Better to show a partial structured
// reflection than nothing at all; the client warns the user to regenerate.
function tryRepairJson(raw) {
  if (!raw) return null;
  let s = raw.trim();
  // Strip markdown fences if the model wrapped it
  s = s.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  // If string is currently open (odd number of unescaped quotes), close it
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"' && s[i - 1] !== "\\") inString = !inString;
  }
  if (inString) s += '"';
  // Count unbalanced brackets and append closers
  let braces = 0, brackets = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{") braces++;
    else if (c === "}") braces--;
    else if (c === "[") brackets++;
    else if (c === "]") brackets--;
  }
  while (brackets > 0) { s += "]"; brackets--; }
  while (braces > 0) { s += "}"; braces--; }
  // Strip trailing commas before close (common cause of parse failure)
  s = s.replace(/,(\s*[}\]])/g, "$1");
  try { return JSON.parse(s); } catch { return null; }
}

function buildUserPrompt(payload) {
  return [
    {
      role: "user",
      parts: [{
        text: `Today's data:
\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\`

Now write the reflection. Be honest, specific, rooted in the data. Return the structured JSON only.`,
      }],
    },
  ];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Verify Firebase ID token so random traffic can't drain the quota
  const authHeader = req.headers.authorization || "";
  const m = authHeader.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: "Missing bearer token" });
  let uid;
  try {
    const decoded = await getAdmin().auth().verifyIdToken(m[1]);
    uid = decoded.uid;
  } catch (e) {
    // Log the detail server-side; don't return firebase-admin internals
    // (token expiry reasons, project mismatch, etc.) to the caller.
    console.error("verifyIdToken failed:", e?.code, e?.message);
    return res.status(401).json({ error: "Invalid token" });
  }

  const { day, payload } = req.body || {};
  if (!day || !payload) {
    return res.status(400).json({ error: "Missing day or payload" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not set" });
  // Default keeps us on the always-free Flash tier. User can override via env
  // var if they want to try Pro / Flash-Lite.
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_INSTRUCTION,
      generationConfig: {
        // 0.65 keeps the prose human without inviting flowery embellishment.
        // Accountability has to feel grounded — earlier 0.85 occasionally
        // produced poetic asides that softened the reckoning.
        temperature: 0.65,
        topP: 0.9,
        // Generous ceiling — Flash 2.5 supports up to 65k. Structured JSON
        // adds syntax overhead on top of the prose, and when the model
        // populates all optional fields (scriptureAnchor, patterns) the
        // total can exceed 2k. 8k means we never truncate mid-field; we're
        // billed only on actual output, not on this max.
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    const result = await model.generateContent({ contents: buildUserPrompt(payload) });
    const text = result?.response?.text?.() || "";
    const finishReason = result?.response?.candidates?.[0]?.finishReason || null;

    if (!text.trim()) {
      return res.status(502).json({
        error: "Empty response from Gemini",
        finishReason,
      });
    }

    // Try to parse the structured response. With maxOutputTokens at 8k this
    // should virtually never truncate, but if something does go wrong we
    // surface a clean error rather than dumping malformed JSON to the client.
    let data = null;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse structured response:", e?.message, "finishReason:", finishReason);
      // Last-ditch attempt: try to close trailing braces if the model
      // produced *almost* valid JSON. Common when the model hits a content
      // filter mid-write.
      const repaired = tryRepairJson(text);
      if (repaired) {
        return res.status(200).json({
          data: repaired,
          day,
          model: modelName,
          generatedAt: new Date().toISOString(),
          uid,
          warning: "Response was repaired from truncated JSON; consider regenerating.",
        });
      }
      return res.status(502).json({
        error: finishReason === "MAX_TOKENS"
          ? "Response truncated (token limit). Try regenerating."
          : "Couldn't parse the model's response. Try regenerating.",
        finishReason,
        detail: e?.message,
      });
    }

    return res.status(200).json({
      data,
      day,
      model: modelName,
      generatedAt: new Date().toISOString(),
      uid,
      finishReason,
    });
  } catch (e) {
    console.error("gemini-report failed:", e);
    return res.status(500).json({ error: e?.message || "Gemini call failed" });
  }
}
