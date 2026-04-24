// Suggest monthly discretionary budgets per category, grounded in the user's
// past 90 days of spend. Uses Lovable AI Gateway with a structured tool call.
import { corsHeaders } from "@supabase/supabase-js/cors";

type CategoryStats = {
  category: string;
  monthlyAverage: number;
  monthlyMedian: number;
  trend: "up" | "down" | "flat";
  currentBudget: number;
  recentMerchants: string[];
};

type SuggestRequest = {
  monthlyIncome: number;
  monthlyEssentialBills: number;
  goal?: "balanced" | "aggressive_save" | "comfort";
  categories: CategoryStats[];
};

type Suggestion = {
  category: string;
  suggested: number;
  rationale: string;
  confidence: number; // 0-1
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as SuggestRequest;
    if (!body?.categories?.length) {
      return new Response(JSON.stringify({ error: "categories required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const goal = body.goal ?? "balanced";
    const safeToSpend = Math.max(
      0,
      body.monthlyIncome - body.monthlyEssentialBills
    );

    const systemPrompt = `You are a personal finance coach. Recommend a realistic monthly spending ceiling per discretionary category.

Rules:
- Ground every suggestion in the user's recent behavior (median is more reliable than average).
- The SUM of all suggested budgets MUST be <= the user's safe-to-spend amount.
- Goal "aggressive_save": cut totals to ~70% of recent median, prioritize trimming high-discretion categories (Dining, Shopping, Entertainment, Travel) first; protect Groceries and Health.
- Goal "balanced": land near the recent median, with a small buffer (~5-10% above) on volatile categories.
- Goal "comfort": match or slightly exceed median to avoid friction; only trim if cash is tight.
- Round suggestions to the nearest $25.
- Keep rationales to one short sentence — concrete, not generic.
- Confidence reflects how stable the spend pattern looks (trend "flat" = higher confidence).`;

    const userPrompt = JSON.stringify({
      monthlyIncome: body.monthlyIncome,
      monthlyEssentialBills: body.monthlyEssentialBills,
      safeToSpend,
      goal,
      categories: body.categories,
    });

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "propose_budgets",
              description: "Return one budget suggestion per input category.",
              parameters: {
                type: "object",
                properties: {
                  suggestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: { type: "string" },
                        suggested: { type: "number", description: "Monthly ceiling in dollars, rounded to $25." },
                        rationale: { type: "string", description: "One short sentence grounded in the user's data." },
                        confidence: { type: "number", description: "0 to 1." },
                      },
                      required: ["category", "suggested", "rationale", "confidence"],
                      additionalProperties: false,
                    },
                  },
                  summary: { type: "string", description: "One-line takeaway about the overall plan." },
                },
                required: ["suggestions", "summary"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "propose_budgets" } },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit reached. Please retry in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds to your Lovable workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiResp.json();
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      console.error("No tool call in response", JSON.stringify(json));
      return new Response(JSON.stringify({ error: "No suggestion produced" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments) as {
      suggestions: Suggestion[];
      summary: string;
    };

    return new Response(JSON.stringify({ ...parsed, safeToSpend, goal }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("suggest-budgets error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
