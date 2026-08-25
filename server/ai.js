// Optional Claude-powered budget suggestions. Enabled when ANTHROPIC_API_KEY is
// set in server/.env; otherwise the caller falls back to the local heuristic.
// Uses the official Anthropic SDK. Model defaults to Claude Opus 5; override with
// FG_AI_MODEL (e.g. claude-sonnet-5 or claude-haiku-4-5 to lower cost).
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.FG_AI_MODEL || "claude-opus-5";

export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let _client = null;
function client() {
  if (!_client) _client = new Anthropic(); // reads ANTHROPIC_API_KEY
  return _client;
}

const GOAL_TEXT = {
  balanced: "a balanced plan — trim comfortably without feeling deprived",
  aggressive_save: "save aggressively — cut hard where possible",
  comfort: "comfort first — only trim obvious excess, keep lifestyle intact",
};

// stats: [{ category, budget, monthlySpend, topMerchants[] }]
// returns: [{ category, current, suggested, monthlySaving, rationale }]
export async function suggestBudgetCuts(stats, goal = "balanced") {
  const system =
    "You are a personal-finance budgeting assistant. Given the user's recent " +
    "per-category monthly spending and current budget ceilings, suggest realistic " +
    "monthly budget cuts that match their goal. Respond with ONLY a JSON array — no " +
    "prose, no code fences. Each element: {\"category\": string (exactly one of the " +
    "input categories), \"suggested\": number (new monthly ceiling in whole dollars, a " +
    "multiple of 25), \"monthlySaving\": number (>= 0), \"rationale\": string (one " +
    "specific sentence, reference the amount)}. Only include categories where a cut is " +
    "realistic; return 3–6 items, highest-impact first. Never invent categories or exceed " +
    "the current budget with 'suggested'.";

  const payload = {
    goal: GOAL_TEXT[goal] || GOAL_TEXT.balanced,
    categories: stats.map((s) => ({
      category: s.category,
      currentBudget: s.budget,
      recentMonthlySpend: s.monthlySpend,
      topMerchants: s.topMerchants,
    })),
  };

  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  });

  if (resp.stop_reason === "refusal") throw new Error("model declined the request");

  const text = (resp.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const parsed = parseJsonArray(text);
  const valid = new Set(stats.map((s) => s.category));
  const byCat = new Map(stats.map((s) => [s.category, s]));
  return parsed
    .filter((r) => r && valid.has(r.category) && typeof r.suggested === "number")
    .map((r) => {
      const cur = byCat.get(r.category).budget;
      const suggested = Math.max(0, Math.round(r.suggested));
      return {
        category: r.category,
        current: cur,
        suggested,
        monthlySaving: typeof r.monthlySaving === "number" ? Math.max(0, Math.round(r.monthlySaving)) : Math.max(0, cur - suggested),
        rationale: String(r.rationale || "").slice(0, 240),
      };
    })
    .filter((r) => r.suggested < r.current)
    .slice(0, 6);
}

// Tolerant extraction of the first JSON array in the model's text.
function parseJsonArray(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch { /* fall through */ }
    }
    return [];
  }
}
