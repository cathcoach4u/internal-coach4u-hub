# Coach4U Internal Hub

## Architecture

Single-page CRM app hosted on GitHub Pages with a Supabase backend. All CRM functionality lives in one file: `index.html` (~6900+ lines). No build step, no framework — vanilla HTML/CSS/JS with inline `<script>` and `<style>` tags.

### Key files

| File | Purpose |
|------|---------|
| `index.html` | Main CRM app (all screens, all JS) |
| `portal/index.html` | Client-facing portal (SAFEty Pulse check-in, results) |
| `sw.js` | Service worker for PWA caching |
| `manifest.json` | PWA manifest |
| `intake.html`, `couples-intake.html`, `individual-intake.html` | Legacy intake forms |
| `intake/` | Intake subpages (thrivehq, couples, individual) |
| `bot/`, `bot.html` | Bot interface |
| `brain-pulse/index.html` | ThriveHQ Brain Pulse portal |
| `schema.sql` | Original DB schema reference |

### Supabase backend

- **URL**: `https://uoixetfvboevjxlkfyqy.supabase.co`
- **Client init**: Line ~1018 of `index.html`
- **Tables**: contacts, clients, client_members, tasks, prospects, prospect_notes, pulse_results, intake_submissions, trials, renewals, task_logs, referrers, referrer_payments, finance_transactions, bills, contact_reports, agents, agent_versions, agent_issues, agent_stages, agent_templates
- **RLS**: Enabled on all tables via Supabase policies
- **Auth**: Anonymous key (publishable) — no user auth, RLS relies on anon role

### CRM structure (areaConfig)

Areas and their pages (defined at line ~1158):

- **Home**: Dashboard
- **CRM**: Master List
- **Referrers**: Referral Hub, Payments
- **Prospects**: Prospect List
- **Clients**: Dashboard, Client List, Intake Forms, Pulses, Invoices
- **ThriveHQ**: Dashboard, Trials, Members, Renewals, Coaching Calls, SAFEty Pulse
- **Strengths**: Dashboard, Strengths Hub
- **Operations**: Dashboard, Task Management, Playbook, IT Projects, Agents
- **Finance**: Dashboard, Income, Where Money Goes, Bills, Transactions
- **About**: About

### Routing

- `navTo(tab)` switches screens by showing `#screen-{tab}` and hiding others
- Each area has pages defined in `areaConfig`; sidebar nav renders from this
- `pageToArea` maps page IDs back to areas
- Page titles defined in `pageTitles` object (line ~1070)

## Agents (Operations > Agents)

### Overview

Parent agents represent the master system prompts for Copilot Studio. Child agents inherit rules from the parent and customize per use case (e.g. Couples Counselling, ThriveHQ). The app tracks:

- **Agent metadata**: name, status (active/draft/disabled), type (parent/child/standalone), platform, model, description, purpose, owner, health
- **System prompts**: Stored as immutable versions; each save creates a snapshot
- **Stages/Messages**: Templates for agent communication (persona × platform variants)
- **Issues**: Log and resolve agent drift/problems
- **SharePoint integration**: Source of truth URL; export stages/messages as plain text for SharePoint

### Tables

| Table | Purpose |
|-------|---------|
| `agents` | Agent records (name, status, type, platform, system_prompt, etc.) |
| `agent_versions` | Immutable snapshots of agent state at each save |
| `agent_issues` | Issue log per agent (title, description, status, fix_applied) |
| `agent_stages` | Communication stages/flows (e.g. "Initial Enquiry") |
| `agent_templates` | Messages within stages (persona × platform combinations) |

### Key features

#### Parent agents (type='parent')
- **Tabs**: Overview, System Prompt/Instructions, Versions
- **System Prompt/Instructions tab**: Shows CURRENT badge with auto-expanded latest version, full prompt visible, Copy button to clipboard
- **Edit form**: Hides SharePoint URL and Knowledge URLs fields (child agents only)
- **No Stages/Issues tabs**: Message templates live in child agents

#### Child agents (type='child')
- **Tabs**: Overview, Stages, Versions, Issues
- **Stages tab**: Card-based UI with expand/collapse; shows nested message templates (persona × platform)
  - "Copy this stage" button exports single stage to plain text
  - "Copy list for SharePoint" exports all stages with dividers
- **Stages/Messages structure**:
  - Each stage: name, trigger_phrase, default_sender, purpose, platform_rule, stage_order
  - Each message (template): persona (Cath/Other), platform (Text/WhatsApp/Email/Teams), subject, body
- **Issues tab**: Log issues with title, description, status (open/resolved), fix_applied

#### Versioning
- **Auto-snapshot on save**: Every edit creates immutable version in `agent_versions` with full agent state + system_prompt + notes_snapshot
- **Revert**: Click "Revert" on an older version to restore it; creates a new version (append-only, never deletes)
- **Version tab**: Latest version at top with CURRENT badge, auto-expanded, older versions collapsed

#### SharePoint export
- **Single stage**: "Copy this stage" button outputs plain text: stage name, trigger phrase, sender; then all messages with persona/platform tags and dividers
- **All stages**: "Copy list for SharePoint" outputs all stages with `════` title divider and `────` between sections
- **Format**: Plain text, no markdown; designed to paste directly into SharePoint

### Code locations

- **State variables** (line ~5090): `let agents=[], agentVersions=[], agentIssues=[], agentStages=[], agentTemplates=[];`
- **Load functions** (line ~5100): `loadAgents()` with try/catch for each table
- **Render functions** (line ~5175): `renderAgents()` (hierarchical list), `renderAgentDetail()` (tabs), `renderCard()` (parent/child display)
- **Form handlers** (line ~5389): `openAgentForm()`, `saveAgent()` (auto-versioning), `openAgentDetail()`, `openStageForm()`, `openTemplateForm()`, `openIssueForm()`
- **Utilities** (line ~5480): `revertToVersion()`, `copyStagesForSharePoint()`, `copyStageForSharePoint()`, `resolveIssue()`
- **Detail tab render blocks** (line ~5243): `if(agentDetailTab===...)` for overview, stages, versions, issues

## Conventions

### Versioning

- CRM version displayed in sidebar: `v{major}.{minor}.{patch}` (currently v3.14.5, line 218)
- Service worker cache: `coach4u-crm-v{N}` in `sw.js` (currently v158)
- **Both must be bumped on every release**

### Code patterns

- All functions exposed to inline `onclick` handlers must be assigned to `window.funcName`
- Toast notifications via `toast(message, type)` — types: 'success', 'error', 'info'
- Supabase queries follow pattern: `const {data, error} = await supabase.from('table').select('*')...`
- State stored in module-level `let` variables (e.g., `let contacts=[]`, `let agents=[]`)
- Load functions: `async function loadX()` fetches from Supabase into state var
- Render functions: `function renderX()` builds HTML string, sets `.innerHTML`
- Init: `loadAll()` at line ~1078 calls all load functions in `Promise.all`

### Print / PDF

- Print CSS uses `print-color-adjust: exact !important` to preserve background colours
- SAFEty Pulse report: 2-page A4 layout with `page-break-before` on page 2
- Portal and CRM must produce identical printed reports

### SAFEty Pulse

- Four pillars: Self Awareness (#5c8a7a), Aim (#0891b2), Foundation (#b87a90), Emotion (#8c6e9f)
- Score ranges: 1-2 amber (#d97706), 3 teal (#0d9488), 4-5 green (#16a34a)
- Client-facing copy uses second person ("your patterns", "your energy")
- Portal (`portal/index.html`) and CRM (`index.html`) must stay in sync for report output

## Completed work (this session)

### Agents page (Operations > Agents) ✅

- Scaffold: HTML modal, routing, page entry
- CRUD: Add, edit, delete agents
- Hierarchy: Parent agents with indented child agents, tree connectors
- Versioning: Auto-snapshot on save, revert to older versions, CURRENT badge on latest
- System Prompt/Instructions tab: Live prompt auto-expanded, Copy button
- Stages/Messages: Card UI with expand/collapse, nested templates
- Issues: Log, resolve, track agent drift
- SharePoint export: Plain-text format with dividers
- Parent agent simplification: Removed Stages/Issues/Links tabs, System Prompt tab renamed

## Git workflow

- Main branch: All work merged and pushed
- No active feature branches
- Commit messages: Concise, imperative mood
- Version bumping: Always bump both `index.html` version (v3.14.x) and `sw.js` cache (v{N}) on release
