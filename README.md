# Finance Guardian

> The **"Check Engine Light" for household finances** — an always-on, AI-powered oversight layer that protects your money without becoming a second job.

Finance Guardian is a personal finance app for **time-poor, high-earning professionals** who want to *know if something is wrong* — without manually categorizing transactions, building budgets, or maintaining spreadsheets. It connects to your banks (via [Plaid](#-plaid-banking-data)), automatically categorizes spending, surfaces only high-confidence anomalies, and answers the question that matters most in a crisis: **"If my income stopped today, how many months could we last?"**

This repository is a **working, self-hosted implementation** of the Finance Guardian product spec — productionized to run **locally on your own machine, for a single user, with your financial data never leaving your computer.**

---

## Table of contents

- [The problem](#the-problem)
- [Who it's for](#who-its-for-maya)
- [What it does](#what-it-does)
- [The three screens](#the-three-screens)
- [How it works](#how-it-works)
- [Integrations](#integrations)
- [Getting started](#getting-started)
- [Roadmap](#roadmap)
- [Project status](#project-status)
- [Tech stack](#tech-stack)

---

## The problem

When **Mint.com shut down in early 2024**, ~3.6M people lost their primary financial monitoring tool. The replacements — YNAB, Monarch, Rocket Money — all demand high intentionality and ongoing manual upkeep, which is exactly what this segment *doesn't* have time for.

Finance Guardian fills that gap with three core jobs:

| Job | What it means |
| --- | --- |
| **Classify automatically** | Every transaction categorized with zero manual input. |
| **Detect anomalies silently** | Low-noise, high-confidence alerts only — no notification fatigue. |
| **Quantify runway on demand** | One tap to know how many months of cushion you have. |

> _"I just want to see if something is wrong — not manage a spreadsheet."_
> — Maya, the target persona

## Who it's for ("Maya")

| Attribute | Detail |
| --- | --- |
| **Archetype** | The "Reluctant CFO" — financially successful, operationally blind |
| **Profile** | Dual-income household, senior professional, parent |
| **Job to be done** | A passive financial guardian that protects without becoming a second job |
| **Top fears** | Fraud, silent lifestyle creep, not knowing their layoff runway |
| **Rejected** | YNAB (too complex), Monarch (too expensive), Rocket Money (too salesy) |

## What it does

| Capability | Status | Notes |
| --- | :---: | --- |
| Bank account aggregation | ✅ | Real connections via Plaid (checking, savings, credit, investments) |
| Automatic transaction categorization | ✅ | From Plaid's enriched data; **2-tap manual override** that persists across syncs |
| **Custom categories** | ✅ | Add your own categories on the fly — saved and reusable everywhere |
| Net worth & balances | ✅ | Live across all connected accounts |
| Recurring income & bill detection | ✅ | Paychecks and recurring charges detected automatically (Plaid) |
| Auto-generated budget baselines | ✅ | Inferred from your trailing-90-day spend — no setup |
| Cash-flow projection | ✅ | Forward-looking "cash on hand" with adjustable horizons |
| **Layoff Runway Calculator** | ✅ | Months of survival at current vs. reduced burn, one toggle |
| Light / dark mode | ✅ | Follows your system, with a manual toggle |
| Anomaly & shadow-subscription detection | ◐ | UI and flags present; statistical detection engine is planned |
| AI budget suggestions | ○ | Migrating to the Claude API (see roadmap) |
| Low-noise alert engine, NL query, inflation tracker | ○ | Planned |

✅ implemented · ◐ partial · ○ planned

## The three screens

- **Dashboard** — Guardian status, net worth, runway, this-week's signals, accounts, and an auto budget baseline. All figures derive from live data.
- **Cash flow** — recurring income streams, scheduled bills, a forward-looking cash-on-hand projection, and a "what if I spent…" budget explorer.
- **Transactions** — every transaction, AI-categorized, searchable and filterable, with one-tap recategorization (including custom categories).

> Tip: run the **demo instance** (sample data, no bank needed — see below) for a fully populated walkthrough.

## How it works

A deliberately simple, self-hosted architecture — single user, no login, data stays on your machine:

```
Browser (React + Tailwind/shadcn)
        │  /finance-guardian/api
        ▼
Node + Express backend ──▶ SQLite file (your data, one file)
        │
        ├─▶ Plaid        (bank connections, encrypted tokens)
        └─▶ Claude API   (AI budget suggestions — planned)
```

- **Frontend** — React + Vite + TypeScript + Tailwind/shadcn (the original design, preserved).
- **Backend** — a small Node/Express service over SQLite (Node's built-in `node:sqlite`, no native build step).
- **Two instances from one build:** a **Demo** (sample data + Plaid Sandbox) and a **Production** (your real data + Plaid Production), each with its own database and port.
- **Privacy:** everything runs on `localhost`; Plaid access tokens are encrypted at rest; nothing is sent to any third party except Plaid (read-only) and, optionally, your own AI provider.

Full setup and operations live in **[LOCAL_SETUP.md](./LOCAL_SETUP.md)**.

## Integrations

### 🏦 Plaid (banking data)

[Plaid](https://plaid.com) is the open-banking provider that connects the app to 12,000+ U.S. financial institutions. Finance Guardian uses Plaid in **read-only** mode — it can see balances and transactions, but never move money.

- **What it pulls:** accounts & balances, transactions (incremental sync), investment holdings, and recurring income/bill streams.
- **Sandbox vs. Production:** build and test against Plaid **Sandbox** (free, fake banks) before connecting real accounts via **Plaid Production**. Plaid's trial plan covers up to 10 connected institutions free, which is plenty for a household.
- **Security:** access tokens are encrypted at rest (AES-256-GCM); your real financial data lives only in your local SQLite database.
- **Setup:** add your Plaid Client ID + secret to `server/.env` — see [LOCAL_SETUP.md](./LOCAL_SETUP.md#plaid-setup-phase-2).

### 🤖 AI (planned)

Budget suggestions will be powered by the **Claude API** (Anthropic) — reading your recent spend to propose realistic per-category ceilings. This is the next milestone (see roadmap).

## Getting started

**Prerequisites:** Node.js (recent LTS or newer).

```bash
git clone https://github.com/abhiyadav-code/finance-guardian.git
cd finance-guardian
npm install

# Run both instances (demo on :8081, production on :8080)
npm run host
```

- **Demo** (sample data, no bank required): http://localhost:8081/finance-guardian/
- **Production** (your real data): http://localhost:8080/finance-guardian/

To connect real banks, add Plaid keys to `server/.env` — full instructions in **[LOCAL_SETUP.md](./LOCAL_SETUP.md)**.

## Roadmap

| Phase | Scope | Status |
| --- | --- | :---: |
| Foundation | Local Node + SQLite backend, persistence, replace mock data | ✅ Done |
| Banking | Real Plaid Link, account/transaction/holdings sync | ✅ Done |
| Cash flow | Recurring income & bill detection, auto budget baselines | ✅ Done |
| Polish | Two-instance demo/prod, theming, custom categories | ✅ Done |
| AI layer | Claude-powered budget suggestions | 🔜 Next |
| Guardian intelligence | Statistical anomaly detection, shadow-subscription alerts, low-noise alert engine | 🔜 Planned |
| Reach | OAuth bank coverage via a secure tunnel; NL query; inflation tracker | 🔜 Planned |

## Project status

This is a **personal, single-user, self-hosted** build — not a hosted multi-tenant product. It's a productionized iteration of a design prototype, intended to run on the owner's own machine. Shared here as a reference implementation for product managers and engineers interested in how an "AI passive finance guardian" comes together end-to-end.

## Tech stack

**Frontend:** React 18 · Vite · TypeScript · Tailwind CSS · shadcn/ui · Zustand · Recharts · next-themes
**Backend:** Node.js · Express · SQLite (`node:sqlite`)
**Integrations:** Plaid (banking) · Claude API (AI, planned)

---

<sub>Built as a productionization of the Finance Guardian product spec. Not affiliated with Mint, Plaid, or Anthropic.</sub>
