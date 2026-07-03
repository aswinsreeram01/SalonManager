# Salon Manager — Codebase Reference

## Project overview

A multi-tenant salon management SPA. Backend is Google Apps Script (GAS) running as a web app; frontend is a static GitHub Pages site.

- **Frontend**: `https://aswinsreeram01.github.io/SalonManager/`
- **Backend deploy ID**: `AKfycbzHHdrH1v0ls4MZptDSDWKKuKbGSCZVj-wLKPbbdo9JASyhZCutcWmtaPRdU6ik2dIKUw` (version @48)
- **GAS project**: `10BKxCLeGeCfNpkvFqtLGkY0d4tSMQMAaBmSTSOMc_KMEih8OsK5exlVo`
- **Deploy**: `npx clasp push && npx clasp deploy --description "..."` from repo root

---

## File map

```
index.html          Shell only (~350 lines): head, login form, header, sidebar, empty page
                    placeholders, global modals (bill confirm, new customer, invoice,
                    appointments booking), script tags. NOT the page content.

pages/              Page HTML loaded at runtime by _loadPageHTML() in app.js
  billing.html      New Bill form + bill line items table
  history.html      Bill history list
  appointments.html Appointments calendar/list
  expenses.html     Expenses form + list
  services.html     3-tab: Service Groups | Service Catalog | Price Books
  products.html     6-tab: Product Groups | Products | POs | Receive | Register | Audit
  vendors.html      Vendors list + form
  staff.html        5-tab: Staff | Incentive Profiles | Shifts | Attendance | Payroll
                    Also contains the HR attendance modal (#hrAttModal)
  hrapprovals.html  2-tab: Attendance approvals | Advance approvals
  customers.html    Customer list
  dashboard.html    Stat cards + quick links
  organizations.html  Org tree + form
  users.html        User list + form
  roles.html        Roles list + form
  permissions.html  Permission matrix
  settings.html     Sheet setup/verification UI

css/
  base.css          Reset, body, login screen, app shell, header, sidebar,
                    main-content layout, page-header, cards, dashboard stats
  components.css    Forms, buttons, tables, messages, loading overlay, modals,
                    warning banner, toggle switch
  billing.css       Billing table (mobile card layout), invoice styles, payment
                    modes, confirmation modal, print CSS
  pages.css         Appointments timeline, expense filters, section card tabs
                    (.prod-tabs), status badges, action buttons, HR attendance modal
  setup.css         Setup/diff drill-down, utility classes, badge variants, home
                    tile grid, HR approvals shared styles, sidebar layout overrides,
                    responsive media queries

js/
  app.js            Navigation, tile grid, sidebar toggle, page HTML loader,
                    DOMContentLoaded init orchestration
  api.js            All GAS API calls. One method per action. Add new actions here.
  auth.js           Login / logout / password reset
  billing.js        New bill flow, line items, staff confirmation
  history.js        Bill history + void
  appointments.js   Calendar + booking modal
  expenses.js       Expense CRUD + filters
  services.js       Service catalog CRUD
  servicegroups.js  Service group CRUD
  pricebooks.js     Price book + item management
  products.js       Product CRUD, stock movements, POs, receive stock, audit
  productgroups.js  Product group CRUD
  vendors.js        Vendor CRUD
  staff.js          Staff CRUD, incentive profiles, shifts, attendance grid,
                    week plan, payroll — the largest module
  hrapprovals.js    Manager approval flows for attendance + advances
  customers.js      Customer list + add
  organizations.js  Org management
  users.js          User management
  roles.js          Role management
  permissions.js    Permission matrix
  settings.js       Sheet setup verification + run + summary sheet button
  dashboard.js      Dashboard stats
  config.js         GAS endpoint URL

GAS backend (*.js at repo root, pushed via clasp):
  Main.js           doPost() router — all actions go through here
  Auth.js           Login, session, password reset
  Staff.js          Staff CRUD
  Attendance.js     Shifts, attendance, advances, weekly incentives, payroll data
  HRApprovals.js    Pending attendance/advance approval flows
  StaffPortal.js    Staff-facing portal actions (separate session type)
  StaffAdvance.js   (if present) advance-specific logic
  IncentiveProfiles.js  Incentive profile CRUD
  Payroll.js        Payroll calculation + save
  WeeklySchedule.js Week-level shift + off-day assignments
  Bills.js / Billing.js  Bill save, void, fetch
  Appointments.js   Appointment CRUD
  Expenses.js       Expense CRUD
  Products.js       Product + stock management
  ProductGroups.js  Product group CRUD
  Services.js       Service CRUD
  ServiceGroups.js  Service group CRUD
  PriceBooks.js     Price book + items
  Vendors.js        Vendor CRUD
  PurchaseOrders.js PO management
  Customers.js      Customer management
  Organizations.js  Org management
  Users.js          User management
  Roles.js          Role management
  Permissions.js    Permission management
  OrgSettings.js    Key-value org config
  Setup.js          Sheet scaffolding + 📋 Index summary sheet
  Utils.js          createResponse(), validateSession(), cache helpers
```

---

## Architecture

```
Browser                        Google Apps Script
  index.html (shell)           doPost(e)
  pages/*.html  ──fetch──▶     Main.js routes by action name
  js/app.js                    *.js modules handle CRUD
  js/api.js  ───POST──────▶    Sheets API (SpreadsheetApp)
                 JSON           Session stored in CacheService
```

**Single-page app pattern:**
- All pages are `<div class="content-section" id="PAGE">` inside `#mainContent`
- `Navigation.switchPage(page)` shows the matching section, hides others
- Page HTML is fetched from `pages/PAGE.html` and injected at startup (parallel fetch, `_loadPageHTML()`)
- Module data loaded lazily on first navigation via `Navigation._callLoad(page)`

**Session:**
- Login stores `sessionToken` + `currentUser` in `localStorage`
- Every API call sends `sessionToken`; GAS validates it in `CacheService`
- Staff portal has a separate session type with `staffSessionToken`

---

## Key patterns

### Adding a new GAS action

1. Add the handler function to the relevant `*.js` GAS file
2. Add `case 'my_action': return Module.myAction(data);` to the `switch` in `Main.js`
3. Add `myAction(params) { return this.call('my_action', params); }` to `js/api.js`
4. Call `API.myAction(...)` from the relevant frontend module

### Sub-section tabs (prod-tabs)

All multi-section pages use `.prod-tabs` / `.prod-tab` / `.prod-tab-panel`:

```html
<div class="prod-tabs">
  <button class="prod-tab active" data-tab="foo">
    <span class="ptab-icon">🗂️</span>
    <span class="ptab-label">Foo</span>
  </button>
</div>
<div id="prod-tab-foo" class="prod-tab-panel active">...</div>
```

Tab switching is wired in each module's `init()` (e.g. `Staff._switchTab()`).
Services tab switching is wired in `app.js` DOMContentLoaded.

### API response format (GAS)

```js
Utils.createResponse('success', 'Message', { data: ... })
// → { status: 'success', message: '...', ...data }

Utils.createResponse('error', 'Something went wrong')
// → { status: 'error', message: '...' }
```

Always check `res.status === 'success'` before using response data.

### Date/time from Google Sheets

Sheets returns time cells as `Date` objects anchored to `1899-12-30`. Use:

```js
// GAS side (Attendance.js, HRApprovals.js):
function _fmtTime(val) {
  if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), 'HH:mm');
  const m = String(val).match(/^(\d{1,2}:\d{2})/);
  return m ? m[1] : String(val);
}
```

Never serialize Sheets time cells directly to JSON.

---

## HR / Attendance domain rules

- **Weekend days**: Friday (dow=5), Saturday (dow=6), Sunday (dow=0) — all highlighted
- **Weekend absence counting**: absent on weekend = 2 days off; half-day on weekend = 1 day off
- **OT formula**: `OT = max(0, hoursWorked − 9)` — no shift hours or break deduction
- **Attendance status**: `present` | `absent` | `half-day` (no `leave` option)
- **Week plan**: shift + planned off days per staff per week; editable only for current/future weeks
  - Stored in `WeeklySchedule` sheet: `scheduleId, staffId, weekStart (YYYY-MM-DD Monday), shiftId, offDays (comma-sep abbrevs), orgId`
- **Incentive tiers**: Target1 (l1Value/l1Type) and Target2 (l2Value/l2Type); brackets X%/Y%/Z%

---

## Sheets / data model

All sheets are in one Google Spreadsheet. Run Setup → "📋 Index" sheet has descriptions + links.

Key sheets and their primary key:
| Sheet | PK | Notes |
|---|---|---|
| Users | id | orgId scoped |
| Staff | id | staffPin for portal login |
| StaffAttendance | attendanceId | status: pending/approved/rejected |
| StaffAdvance | advanceId | status: pending/approved/disbursed/rejected |
| WeeklySchedule | scheduleId | weekStart = Monday ISO date |
| IncentiveProfiles | profileId | l1/l2 = Target1/Target2 |
| Payroll | payrollId | period = YYYY-MM |
| Bills | billId | |
| BillItems | billItemId | staffConfirmed bool |

`orgId` is on almost every row. API calls include `data.orgId` extracted from the validated session.

---

## Deployment workflow

```bash
# Backend changes (GAS files at repo root):
npx clasp push
npx clasp deploy --description "what changed"

# Frontend changes (index.html, pages/*, js/*, css/*):
git add ...
git commit -m "..."
git push   # GitHub Actions deploys to Pages automatically
```

**Both steps needed** when a feature touches frontend + backend. Frontend-only changes need only `git push`. Backend-only changes need only `clasp push && clasp deploy`.

---

## Common gotchas

- `pages/*.html` inner content only — no `<div class="content-section">` wrapper (that stays in `index.html`)
- `styles.css` still exists but is **not linked** — the split files (`base.css` etc.) are used instead
- Staff portal uses `STAFF_ACTIONS` list in `Main.js` and a separate `staffSession` — don't mix with admin actions
- `IncentiveProfiles` GAS field is `profileName` (not `name`) and `otHourlyRate` (not `otRate`) — mismatch caused display bugs; see commit `dce4b31`
- When GAS `update()` needs the record ID, send `profileId` / `staffId` etc. — not a generic `id`
- The `#menuToggle` hamburger is always in the DOM; on mobile it opens a drawer, on desktop it collapses the sidebar
- **Sessions are stateless (since @48)**: `Utils.createSession`/`createStaffSession` return HMAC-signed tokens (24h, no server-side storage, no revoke). The signing secret lazy-inits into Script Properties (`SESSION_SECRET`) on first use — nothing to configure manually.
- **Permissions schema changed (since @48)**: `Permissions` sheet is now `id, roleId, menuItem, canRead, canUpdate` (was `canAccess`). Existing roles' old `canAccess` column carries over as `canRead`; `canUpdate` starts blank/false for everyone. Run Settings → Sheet Setup → Add Columns to append the new column, then revisit Roles & Permissions to grant Update access where needed. Server-side enforcement is fail-closed: an action with no matching row for a role is denied.
- **Customer phone identity**: `Utils.normalizePhone()` is the canonical form (E.164, `+91` default) used for Customers, Bills.customerId, and the loyalty ledger. Bill history now matches by phone, not customer name.
