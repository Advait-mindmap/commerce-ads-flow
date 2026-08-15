# CommerceAds OS — Migration off Base44 to Railway

## What this is
Ad revenue platform for e-commerce marketplaces. Finds sellers likely to start
advertising, runs an AI voice SDR (Bolna) to qualify and book meetings, manages
campaign retention. Six-stage funnel: demand gen → MQL → scoring → SQL → close → retain.

Built in Base44, being extracted to run standalone on Railway.

## Current state
- 16 routed pages, 15 entities, ~90 panel components, working Vite/React/Tailwind frontend
- 5 backend functions (Deno) with a complete, correct Bolna integration:
  bolnaCall, bolnaWebhook, bolnaFetchTranscript, extractQualification, checkSuppression
- Design system: white enterprise. Canvas #F8FAFC, cards white with 1px #E2E8F0,
  Inter only, single accent #1E40AF, tabular-nums on all figures.
  No gradients, no glassmorphism, no emoji, no shadows on cards.

## Known open bug
The frontend does not reliably invoke bolnaCall. Verify these five:
1. src/lib/dialer.js exports dialOne / dialSequentially / summarize;
   dialOne calls functions.invoke('bolnaCall', {lead_id}) and classifies
   dialled / blocked (data.blocked) / failed
2. BatchDialModal accepts onDial (SdrConsole passes onDial, not onConfirm)
3. SignalExplorer bulk "Queue for AI SDR" actually dials
4. "Call now" buttons on Seller 360 header and RepWorkspace lead panel
5. CallDetail polls AgentRun every 5s while queued/in_progress

## Migration plan
Do NOT rewrite the 29 files that call the Base44 SDK. Write a shim instead.

Replace src/api/base44Client.js with a client exposing the identical shape:
  base44.entities.<Name>.{list, get, filter, create, update, bulkUpdate}
  base44.auth.{me, logout, isAuthenticated}
  base44.functions.invoke(name, body)
Backed by our own Express API. Pages stay untouched.

Storage: single Postgres table with JSONB, not 15 typed tables.
  records(id uuid pk, entity text, data jsonb, created_date, updated_date)
  GIN index on data. filter() → WHERE entity=$1 AND data->>'key'=$2
  Entities have deep nesting (traffic_series, transcript, qualification,
  objections, roas_series) so JSONB avoids all migration work.

API routes:
  GET  /api/entities/:entity            list
  GET  /api/entities/:entity/:id        get
  POST /api/entities/:entity/query      filter
  POST /api/entities/:entity            create
  PATCH /api/entities/:entity/:id       update
  POST /api/entities/:entity/bulk       bulkUpdate
  POST /api/functions/:name             function invoke

Auth: strip to email+password with one seeded admin, JWT in httpOnly cookie.
Delete or stub the OTP/reset/OAuth pages — not needed for a client demo.

Functions port: Deno.serve → Express handler, secrets.get('X') → process.env.X,
base44.asServiceRole.entities.X → the DB layer. Bolna logic itself unchanged.

Remove @base44/vite-plugin from vite.config.js and package.json.

Railway: one project, two services (Postgres + app). App serves /api and the
built Vite bundle. Env: DATABASE_URL, JWT_SECRET, BOLNA_API_KEY,
BOLNA_AGENT_ID, BOLNA_WEBHOOK_SECRET.
Bolna webhook URL → https://<app>.railway.app/api/functions/bolnaWebhook

## Seed data — the highest-risk item
Do NOT migrate data out of Base44. Generate it with a script that enforces
correlation in code. The demo dies if a chart contradicts a number elsewhere.

Hard rules:
- traffic_series must be DERIVED from organic_impr_decline, not generated
  separately. If decline is 0.34, the last 4 weeks sit ~34% below the prior 4.
- pta_reasons must be built from the seller's actual numbers, e.g.
  "Organic visibility down 34% in 30 days"
- Band A: decline > 0.25 OR sku_added_30d > 30 OR setup_abandons_30d >= 2, score 78-96
  Band D: flat traffic, low engagement, tenure < 90d, score 8-34
- budget_target between 2% and 12% of gmv_30d; low = 0.6x, stretch = 1.7x
- Won Opportunity → Lead stage won → AgentRun with qualification.qualified true
- Lead with a meeting → AgentRun with outcome meeting_booked
- Campaign churn_band RED → negative roas_trend_slope, budget_utilization < 0.6,
  days_since_rep_contact > 20, declining roas_series, churn_drivers naming those reasons
- Rep.current_load = count of Leads assigned to that rep

Volumes: 400 Seller, 520 Contact, 8 Rep, 260 Lead, 320 AgentRun (40 with full
transcripts), 95 Opportunity, 140 Campaign, 7 AdPackage, 580 Interaction,
180 Sequence, 8 Experiment, 6 ModelVersion, 60 Suppression, 350 AuditLog.

Transcripts: 14-22 turns, Hinglish where preferred_language is Hindi. Agent is
"Meera". Opens by citing that seller's actual decline percentage. 10 must have
the seller asking about pricing where the agent deflects and a guardrail_event
is logged. 6 end in escalation. 8 have negative sentiment. 14 book a meeting.

## Style
Direct, no hype. Don't add features that weren't asked for.