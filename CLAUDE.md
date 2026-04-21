# Coach4U Internal Hub

## Architecture

Single-page CRM app hosted on GitHub Pages with a Supabase backend. All CRM functionality lives in one file: `index.html` (~6200+ lines). No build step, no framework — vanilla HTML/CSS/JS with inline `<script>` and `<style>` tags.

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
| `schema.sql` | Original DB schema reference |

### Supabase backend

- **URL**: `https://uoixetfvboevjxlkfyqy.supabase.co`
- **Client init**: Line ~1018 of `index.html`
- **Tables**: contacts, clients, client_members, tasks, prospects, prospect_notes, pulse_results, intake_submissions, trials, renewals, task_logs, referrers, referrer_payments, finance_transactions, bills, contact_reports, agents, agent_versions, agent_issues
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

## Conventions

### Versioning

- CRM version displayed in sidebar: `v{major}.{minor}.{patch}` (currently v3.7.6, line 218)
- Service worker cache: `coach4u-crm-v{N}` in `sw.js` (currently v141)
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

## In-progress work (other sessions)

### Agents page (Operations > Agents)

- **Status**: HTML scaffold + menu entry + routing done. JS handlers NOT yet written.
- **Insertion point**: Line ~4947 of `index.html`, just before `// -- FINANCE --`
- **Supabase tables**: `agents`, `agent_versions`, `agent_issues` (created with RLS)
- **Key design**:
  - Every save creates an immutable version snapshot in `agent_versions`
  - Versions tab shows history with change_note; clicking shows full snapshot + "Restore this version"
  - Restore copies version fields back to agent and creates a new version (append-only)
  - Issues tab for tracking drift/problems per agent
  - Agent fields: name, status (active/draft/disabled), type (parent/child/standalone), platform (copilot_studio/claude/chatgpt/custom), description, purpose, used_by, used_for, not_used_for, trigger_type, model, parent_agent_id, owner, source_of_truth_url, knowledge_urls, system_prompt, last_reviewed_at, review_frequency_days, health (ok/needs_attention/failing), notes
- **JS functions needed**: loadAgents, loadAgentVersions, loadAgentIssues, renderAgents, renderAgentDetail, saveAgentForm, restoreAgentVersion, openAgentForm, openAgentDetail, openAddIssueForm, saveIssue, resolveIssue + badge helpers + window exposures

### Pulse enhancements (separate session)

Being worked on in a separate chat — do not duplicate effort.

## Git workflow

- Feature branch: `claude/crm-dashboard-tabs-ESRoq`
- Always push feature branch, then merge to `main` for GitHub Pages deployment
- Commit messages: concise, imperative mood
- Branch is always kept up to date with remote
