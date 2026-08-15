# CommerceAds OS — Functional Specification

## Purpose

E-commerce marketplaces (Flipkart, Meesho, Amazon-style) earn revenue two ways:
commission on transactions, and advertising sold to their own sellers. The second
stream is usually under-exploited — a marketplace may have 400 sellers but only 95
paying for sponsored listings, banners, or search placement.

CommerceAds OS closes that gap. It identifies which sellers are commercially primed
to start advertising, runs an AI-powered inside sales motion to convert them, and
manages campaign performance and retention afterwards.

The user of this platform is the marketplace's ad sales team: reps, their manager,
and the revenue lead. Not the sellers themselves.

## The core insight the product is built on

A seller becomes willing to pay for ads when their free traffic starts dying.
Organic search visibility decays as competition increases. When a seller's organic
impressions drop 34% in a month and their search position falls eight places, they
feel it in revenue — and that is the moment they will listen to an ad pitch.

The platform detects that moment from marketplace data and acts on it. Every pitch
opens with the seller's own numbers, not a generic value proposition.

## The six-stage funnel

1. **Demand generation** — Google/Meta ads plus in-dashboard nudges, targeted at
   sellers with growing catalogs or declining organic traffic
2. **MQL** — a seller who clicks, fills a form, or crosses a behavioural threshold
   in their seller dashboard
3. **Lead scoring** — the PTA (Propensity To Advertise) model separates real intent
   from noise using catalog, GMV, traffic decay, and behavioural signals
4. **SQL** — qualified leads handed to the AI voice SDR or a human rep for first call
5. **Close and onboard** — ad package sold, proposal signed, campaign live
6. **Retention** — performance monitoring, churn prediction, renewal

---

## Feature set by module

### Command Center (`/`)
Executive overview. Six KPI tiles: total sellers, advertising count with penetration
percentage, pipeline value, ad revenue MTD, meetings booked, SLA breaches.
A funnel visualisation showing counts at each of the six stages with conversion
percentages between them — each segment clickable through to that stage's screen.
Pipeline by stage chart, AI SDR activity for today, top signals this week, and an
attention-required panel listing SLA breaches, open escalations, RED churn campaigns,
and expiring contracts.

### Signal Explorer (`/signals`)
The screen that sells the product. A filterable table of all sellers showing, per row,
an inline sparkline of their 24-week organic traffic. Filters: PTA band, category,
organic decline range, GMV band, never-advertised toggle, tenure.

Filtering to "band A + organic decline above 25%" surfaces the sellers worth calling
today. The sparklines make the case visually before anyone reads a number.

Bulk actions: queue selected sellers for the AI SDR, add to a nurture sequence,
assign to a rep.

### Seller 360 (`/sellers/:id`)
Everything known about one seller across six tabs: Overview, Traffic & Catalog,
Ad History, Interactions, Signals, Experiments.

The Overview tab carries the PTA explainability panel — the score, the four reason
codes that produced it, each with a contribution bar, and an expandable view of the
model's top feature importances. This exists so a rep can defend the score and a
client can see it isn't a black box.

### AI SDR Console (`/sdr`)
Operations view for the automated calling. Today's stats: dials, connects, qualified,
booked, escalated, cost per meeting. A live table of agent runs with in-progress calls
showing a pulsing indicator and running duration. Side panels for queue depth by band,
seven-day outcome distribution, top objections, and open escalations.

"Start batch dial" selects a PTA band and a maximum number of dials, then calls
sequentially. Every dial passes the suppression gate first; blocked contacts are
skipped and reported with their reason.

### Call Detail (`/sdr/calls/:id`)
The demo centrepiece. Three columns.

Left: call metadata and "Why we called" — the PTA reasons that triggered the call.

Centre: the transcript, turn by turn, with per-turn sentiment indicators. Guardrail
events render inline as amber strips. A replay control streams the transcript at
1.4-second intervals with speed toggle and skip-to-end, so a viewer watches the call
unfold rather than reading a wall of text.

Right: extracted intelligence that fills in as the replay progresses — the
qualification card (decision maker, current ad platforms, budget band, timeline,
pain confirmed, qualified verdict, confidence), objections raised with verbatim
quotes, call analytics, and the next action (meeting booked, escalation, or nurture).

Fields the extraction wasn't confident about carry an amber "Verify" tag and are
inline-editable.

### Rep Workspace (`/workspace`)
The human rep's queue. Leads sorted by SLA urgency then PTA score, each with a live
countdown. Selecting one shows a pre-call brief with a suggested opening line, the
seller snapshot, the recommended package with projected ROAS, and prior interaction
history. Disposition capture at the bottom advances to the next lead.

### Pipeline (`/pipeline`)
Kanban across Proposed → Negotiating → Verbal → Won → Lost. Cards show package,
budget, close probability, expected close date, and days-in-stage with ageing
indicators. Drawer view carries the ranked package recommendations with fit
reasoning, the projected ROAS range, and the proposal timeline.

### Churn Console (`/churn`)
Live campaigns ranked by 30-day churn probability. Each row expands to show the churn
drivers with contribution weights, the 12-week ROAS trend, and a recommended
intervention. Bands: RED, AMBER, YELLOW, GREEN.

### Campaigns (`/campaigns`)
All campaigns with performance metrics. Rows expand to show optimization
recommendations — bid changes, budget reallocation, keyword pauses — each with a
rationale, projected impact, confidence score, and approve/reject controls.

### Experiments (`/experiments`)
Every script, sequence, model version, and pricing approach runs against a control.
Cards grouped by funnel stage. Detail view shows arm comparison, lift with confidence
interval, both fixed-horizon and always-valid (mSPRT) p-values, sample ratio mismatch
check, CUPED variance reduction, power achieved, and guardrail metrics.

Deliberately includes failures: one experiment concluded not-significant and kept the
control; one was auto-stopped on a guardrail breach. A board where everything wins
reads as decorative.

### Models (`/models`)
Model registry for PTA, budget capacity, churn survival, and elasticity. Per model:
champion version, AUC, calibration error, feature importances, calibration curve,
version history, and drift status.

### MQL Inbox (`/mql`), Sellers (`/sellers`), Compliance (`/compliance`)
MQL Inbox: inbound leads by source with trigger reason and sequence status.
Sellers: the full directory.
Compliance: active suppressions with reasons and expiry, plus the audit log.

---

## The AI SDR — how it works

**Trigger.** A rep or batch job calls `bolnaCall` with a lead ID. The function
assembles the seller's context — display name, category, tenure, their top PTA reason,
the organic decline percentage, SKUs added, GMV trend, budget band, preferred
language — and passes it to Bolna as `user_data`. The voice agent, named Meera, opens
by citing that seller's actual numbers.

**Suppression gate.** Before any dial, `checkSuppression` must pass. It blocks on:
DND flag, missing channel consent, active suppression record, contact within the last
seven days, suspended or churned seller, disqualified within 90 days, four or more
attempts in 30 days, or a call outside 09:00–20:00 IST. Every block is logged.
This gate is mandatory and must never be bypassed.

**The call.** The agent establishes four things: is this person the decision maker,
are they advertising anywhere already, what's their rough budget, and what's their
timeline. Then it books a 20-minute slot with a specialist.

**Hard constraints.** The agent never states a price, never guarantees a return,
never agrees to contract terms. If asked about pricing it deflects to the specialist
call. If the seller is irritated twice it apologises, offers to remove them from
outreach, and ends.

**Post-call.** `bolnaWebhook` receives the transcript and normalises it (Bolna returns
three different shapes, all handled). `extractQualification` runs an LLM pass to
produce the structured qualification, objections, guardrail events, sentiment, and
talk ratio. If a guardrail fired on pricing, ROAS guarantees, or contract terms, an
escalation is raised and assigned to the least-loaded available rep. If a meeting was
booked, the lead advances to SQL.

---

## What "functional" means — test these

**Funnel integrity**
- Command Center counts match the underlying records at every stage
- Funnel segments navigate to the correct screens
- Stage transitions actually persist

**Scoring**
- PTA bands align with the data: band A sellers show real decline or SKU velocity
- `traffic_series` visibly matches `organic_impr_decline` on every seller
- `pta_reasons` cite that seller's actual numbers, not generic text
- Budget range sits between 2% and 12% of GMV

**AI SDR — the critical path**
- "Start batch dial" places real calls, does not just toast
- Suppression blocks are reported with reasons, not swallowed
- Bulk "Queue for AI SDR" from Signal Explorer dials
- "Call now" works from Seller 360 and Rep Workspace
- A queued call polls to in-progress and then to a terminal state
- Webhook lands the transcript and it renders on Call Detail
- Qualification extraction populates the right-hand cards
- A pricing question in the transcript produces a guardrail strip and an escalation
- A booked meeting advances the lead to SQL

**Data coherence**
- Every won Opportunity traces to a won Lead traces to a qualified AgentRun
- Every lead with a meeting has an AgentRun with outcome meeting_booked
- RED churn campaigns have declining ROAS series and matching drivers
- Rep current_load equals their assigned lead count

**Interface**
- No dead buttons anywhere — every control does something or is removed
- Empty states render rather than crashing
- No gradients, glassmorphism, emoji, or non-Inter fonts
- All figures use tabular-nums; currency in lakh/crore grouping

## Known open bug at handover

The frontend does not reliably invoke `bolnaCall`. The backend is complete and
correct. Verify the dialer module exists and invokes the function, that
BatchDialModal accepts the `onDial` prop SdrConsole passes it, that Signal Explorer's
bulk action dials, that "Call now" buttons exist, and that Call Detail polls.