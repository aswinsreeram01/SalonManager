# Salon Manager — Complete Reference

A single-file, all-in-one reference combining the technical design, functional design, and usage notes for the Salon Manager platform. For nicely formatted versions, see the HTML docs in this folder (linked from **Settings → Documentation** in the app):

- [`technical-design.html`](technical-design.html) — Technical Design Document
- [`functional-design.html`](functional-design.html) — Functional Design Document
- [`user-manual.html`](user-manual.html) — User Manual

---

## 1. What it is

Salon Manager is a **multi-tenant** business platform for salon and retail outlets. One deployment currently serves **two Naturals salons and one FirstCry store** under a single company, sharing one billing system and one loyalty programme ("**Gems**").

It is **serverless**: a Google Apps Script (GAS) Web App backend stores everything in one Google Spreadsheet; a static single-page app (SPA) on GitHub Pages is the frontend. Two extra standalone pages — a customer loyalty portal and a staff self-service portal — reuse the same backend.

**Modules:** billing & invoicing, service/product catalogues, price books, inventory (POs, receipts, register, audits), vendors, loyalty (Gems), appointments, expenses, staff/HR (shifts, weekly schedule, attendance, advances, incentive profiles, payroll), and admin (organisations, users, roles, permissions, settings).

---

## 2. Technology & Architecture

| Layer | Technology |
|---|---|
| Backend runtime | Google Apps Script (V8), single `doPost(e)` router |
| Data store | Google Sheets — one spreadsheet, 31 tabs, read by **column index** |
| Sessions / cache | `CacheService.getScriptCache()` |
| Email | `MailApp` (password reset only) |
| Frontend | Vanilla HTML/CSS/JS, no framework, no build |
| Hosting | GitHub Pages (frontend) + GAS Web App (backend) |
| Deploy | `clasp` (backend), `git push` (frontend) |

**Request pattern:** every call is an HTTP `POST` with JSON `{ action, ...data, sessionToken }`. `Main.js` switches on `action` and dispatches to a module. Responses are flat JSON: `{ status, message, ...payload }` via `Utils.createResponse`. No CORS headers, no custom request headers (avoids GAS pre-flight), no `doGet`.

```
Browser (GitHub Pages)                    GAS Web App
 index.html + pages/*.html                doPost(e) → Main.js router
 js/app.js (nav) js/api.js (transport)    ├─ staff switch (sp_ token)
 customer.html / staff.html (portals)     ├─ public actions (no auth)
        │  POST {action,...,sessionToken} └─ admin switch (validate)
        └──────────────────────────────►  *.js modules → SpreadsheetApp
        ◄──────────  {status,message,...} CacheService (sessions + data)
```

---

## 3. Multi-tenancy

- `Organizations` sheet has a self-referencing `parentId` → a **company → outlet tree**.
- `Organizations.getOrgAndChildren` returns an org + all descendants; parent-org users see their whole branch, leaf-org users see only their outlet.
- Every business sheet has an `orgId`. Row filter: include when `!orgId || !rowOrg || rowOrg === orgId`.
- `orgId`/`userId` are injected **server-side** from the validated session; the client cannot spoof them. `orgId` is set at create time and never rewritten on update.

---

## 4. Authentication & Sessions

- **Passwords:** SHA-256, unsalted (`Utils.hashPassword`). Stored in `Users` col 2, never returned by reads.
- **Admin login** (`Auth.login`): match email + hashed password in `Users`, require `status==='active'`, return `{ sessionToken, userId, email, fullName, phone, whatsapp, orgId, roleId, permissions }`.

| | Admin | Staff |
|---|---|---|
| Token | plain UUID | `sp_` + UUID |
| Store | script cache | script cache |
| TTL requested | 8 h | 12 h (GAS caps at 6 h; `expiry` field is authoritative) |
| Validator | `validateSession` → `{userId, orgId}` | `validateStaffSession` → `{staffId, orgId}` |

- **Password reset:** UUID token, 1-hour expiry, stored in `PasswordResetTokens`, emailed via `MailApp`. ⚠️ **Known bug:** `Auth.resetPassword` checks `.status` on a `TextOutput` (which has none), so the success path is effectively unreachable — needs a fix.
- **Frontend session:** SPA uses `localStorage.sessionToken` + `currentUser`; staff portal uses `localStorage.staffSessionToken`; customer portal uses `sessionStorage.cp_phone`/`cp_name` (no token).

---

## 5. Routing & access levels

`Main.js` runs two switches: **staff** (checked first) then **admin**.

- **STAFF_ACTIONS:** `staff_login, staff_logout, get_staff_dashboard, get_pending_items, confirm_bill_items, change_staff_pin, log_attendance, get_my_attendance, request_advance, get_my_advances`
- **publicActions (no session):** `login, request_password_reset, validate_reset_token, reset_password, customer_login, get_customer_history, get_customer_loyalty, get_loyalty_ledger`
- Everything else requires an admin session.

Full action catalogue is in the [Technical Design](technical-design.html#actions). Highlights by domain: Auth, Customers, Loyalty, Bills, Services/ServiceGroups, PriceBooks (+items), Products (+stock/receive/audit), ProductGroups, Vendors, PurchaseOrders, Appointments, Expenses, Staff, IncentiveProfiles, Shifts/Schedule/Allocations, Advances, HRApprovals, Payroll, Organizations/Users/Roles/Permissions, OrgSettings, Setup, and the Staff Portal set.

---

## 6. Data model — all 31 sheets

Columns are 0-based and **order matters** (GAS reads by position). Source of truth: `SHEET_SCHEMA` in `Setup.js`.

**Auth/Admin**
- **Users** (9): id, email, password, fullName, phone, whatsapp, orgId, roleId, status
- **Organizations** (5): id, name, parentId, type, status
- **Roles** (4): id, name, description, status
- **Permissions** (4): id, roleId, menuItem, canAccess

**Customers & Loyalty**
- **Customers** (8): timestamp, name, phone, addedBy, orgId, pointsBalance, statusPoints, tier
- **PointsLedger** (11): ledgerId, customerPhone, customerName, billId, earnedDate, expiryDate, type, points, balanceAfter, note, orgId

**Service catalogue**
- **ServiceGroups** (11): id, name, description, gstPct, sacCode, countForTarget, directIncentivePct, sortOrder, status, orgId, pointsEligible
- **Services** (8): id, name, description, duration, serviceGroupId, defaultPrice, status, orgId
- **PriceBooks** (5): id, name, description, status, orgId
- **PriceBookItems** (5): itemId, priceBookId, serviceId, price, orgId

**Product catalogue & inventory**
- **Products** (16): id, name, category, uom, unitCost, retailPrice, gst, currentStock, baseStock, manufacturer, vendorName, vendorContact, status, vendorId, groupId, orgId
- **ProductGroups** (9): id, name, gstPct, hsnCode, unitIncentive, sortOrder, status, orgId, pointsEligible
- **StockMovements** (14): movementId, date, productId, productName, type, refId, qty, unitCost, notes, createdAt, vendorId, vendorName, createdBy, orgId
- **StockAudits** (6): auditId, auditDate, notes, createdAt, createdBy, orgId
- **AuditItems** (10): itemId, auditId, productId, productName, systemQty, physicalQty, variance, unitCost, notes, orgId

**Vendors & purchasing**
- **Vendors** (9): vendorId, name, contactPerson, phone, email, address, notes, status, orgId
- **PurchaseOrders** (10): poId, vendorId, vendorName, poDate, expectedDate, status, notes, createdAt, createdBy, orgId
- **POItems** (9): itemId, poId, productId, productName, uom, qtyOrdered, qtyReceived, unitCost, orgId

**Billing**
- **Bills** (20): billId, customerId, customerName, priceBookId, createdAt, servicesSubtotal, servicesGst, retailSubtotal, retailGst, discount, tip, grandTotal, paymentMode, cashAmt, cardAmt, upiAmt, status, discountType, createdBy, orgId
- **BillItems** (19): billItemId, billId, type, refId, itemName, staffId, staffName, qty, unitPrice, gstPct, lineSubtotal, lineGst, lineTotal, profProductId, profProductName, profQty, profUom, orgId, staffConfirmed

**Appointments & expenses**
- **Appointments** (16): appointmentId, customerId, customerName, customerPhone, staffId, staffName, serviceId, serviceName, startTime, durationMins, status, notes, billId, createdAt, createdBy, orgId
- **Expenses** (13): expenseId, date, category, vendor, description, amount, paymentMode, referenceNo, notes, createdAt, createdBy, status, orgId

**HR & payroll**
- **Staff** (19): id, userId, name, phone, email, aadharNumber, upiId, startDate, role, salary, allowance, incentiveStructure, specialization, status, staffType, profileId, targetPeriod, orgId, staffPin
- **IncentiveProfiles** (14): profileId, profileName, profileType, revenueBase, otHourlyRate, l1Type, l1Value, l2Type, l2Value, xPct, yPct, zPct, status, orgId
- **Shifts** (7): shiftId, name, startTime, endTime, breakMins, status, orgId
- **StaffShiftAllocation** (7, legacy): allocationId, staffId, shiftId, fromDate, toDate, createdAt, orgId
- **WeeklySchedule** (6): scheduleId, staffId, weekStart, shiftId, offDays, orgId
- **StaffAttendance** (13): attendanceId, staffId, date, shiftId, clockIn, clockOut, hoursWorked, otHours, dayStatus, notes, createdAt, orgId, status
- **StaffAdvance** (12): advanceId, staffId, date, type, amount, notes, runningBalance, createdAt, orgId, status, approvedAmount, paymentMode
- **Payroll** (25): payrollId, staffId, staffName, period, baseSalary, payableDays, eligibleOffs, totalDaysOff, excessLeaves, leaveDeduction, adjustedBaseSalary, allowances, otHours, otPay, serviceIncentive, productIncentive, makeupIncentive, targetIncentive, totalIncentive, advanceDeducted, netPay, status, notes, createdAt, orgId

**Settings**
- **OrgSettings** (2): key, value — key/value store. Loyalty config lives under key `loyalty` (JSON string). Defaults: currencySymbol=₹, defaultTargetPeriod=weekly, salaryPayDay=10, defaultEligibleOffs=4.

**ID prefixes:** ORG, USR, ROLE, PERM, PRD, MOV, RCP, AUD, AI, PGP, PO, POI, VEN, SRV, SGP, PB, PBI, BILL, BI, STF, PROF, SHF, ALC, SCH, ATT, ADV, WKI, PAY, LPE (earn), LPR (redeem).

---

## 7. Billing engine

`Bills.save`:
1. IDs: `BILL+timestamp`, lines `BI+timestamp+rand`.
2. Sum service/retail subtotals & GST from line items (per-line `lineGst` trusted, not recomputed).
3. **Grand total** = servicesSubtotal + servicesGst + retailSubtotal + retailGst − discount + tip. `discount` is *combined* (manual + Gem redemption value).
4. Write Bills (status `active`) + one BillItems row per item.
5. `_deductStock` — retail products written as negative `billing` movements; stock may go negative to stay in sync. Professional-product consumption deducts at cost 0.
6. `LoyaltyPoints.processAfterBill(...)` if a phone resolves.

`voidBill` → status `void` (does **not** reverse stock or Gems). `getAll` defaults to last 90 days. **Trust boundary:** server trusts client `lineGst`, `discount`, `pointsToEarn`, `redeemPoints`.

---

## 8. Loyalty ("Gems")

**Two balances:**
- **pointsBalance** — spendable wallet (earn ↑, redeem ↓).
- **statusPoints** — tier score = sum of non-expired `earn` entries in the rolling window; **never reduced by redemption**.

**Earning (computed client-side, trusted by server):**
```
eligibleSpend = Σ lineSubtotal of rows whose group is pointsEligible
pointsToEarn  = floor(eligibleSpend / 100) × baseEarnRate × tierMultiplier × happyHourMultiplier
```

**Config** (in `OrgSettings['loyalty']`, merged over defaults): `enabled, pointsName, baseEarnRate, tiers[{name,threshold,multiplier,color}], happyHourMultiplier, happyHourActive, happyHourSchedules[], redemptionRate, redemptionValue, minRedemption, expiryMonths`.

**Happy hour:** manual toggle OR recurring schedules (day + time window + optional effective dates).

**processAfterBill order:** redeem first (only if balance sufficient; `LPR` ledger row, negative points) → earn (`LPE` row, expiry = now + expiryMonths) → recalc status.

**Tier recalc & downgrade protection:**
```
qualifiedIdx  = highest tier whose threshold ≤ statusPoints
newTierIdx    = max(qualifiedIdx, currentIdx − 1)   // drop at most one tier per recalc
```

---

## 9. Inventory & purchasing

- Stock movement types: `receipt` (+), `billing` (−), `audit` (±).
- Receive stock increments `currentStock` + writes receipt; against a PO it also bumps `qtyReceived` and rolls PO status: **draft → partial → received**.
- Stock audit: `variance = physical − system`; logs an `audit` movement and overwrites stock to the physical count.
- Price resolution: price-book override if set, else service default price.
- ⚠️ PO "smart suggest" / auto-reorder is **not implemented** server-side (only the `baseStock` reorder field exists).

---

## 10. HR, attendance & payroll

- **Time cells** anchored to 1899-12-30; `_fmtTime` extracts `HH:mm`.
- **Overtime:** `OT = max(0, hoursWorked − 9)` (no break deduction).
- **Attendance:** dayStatus `present|absent|half-day`; row status `pending|approved|rejected`. Staff self-log → pending → manager approves.
- **Advances:** two paths — admin direct (`disbursed`), or staff request (`pending → approved → disbursed`). Only `disbursed` rows count toward balance.
- **Incentive profile:** OT rate + two targets (T1/T2, fixed or salary-%) + three brackets X/Y/Z. Progressive: `<T1 → 0`; `T1..T2 → T1·X% + (R−T1)·Y%`; `≥T2 → T1·X% + (T2−T1)·Y% + (R−T2)·Z%`.
- **Payroll:** weekend (Fri/Sat/Sun) absence counts double, weekend half-day = full day. `leaveDeduction = excessLeaves × (salary/payableDays)` (defaults: 4 eligible offs, 26 payable days). `otPay = otHours × otRate`. Incentives weekly (sum snapshots) or monthly (from bills). `netPay = adjustedBase + allowances + otPay + totalIncentive − advanceDeducted`.

---

## 11. Frontend & portals

- `index.html` = shell; `app.js` fetches 16 `pages/*.html` fragments and injects them, then runs each module `init()`. `Navigation.switchPage` lazy-loads data per page; a background preloader warms heavy pages after login. Permissions hide disallowed tiles/menus.
- `api.js` = one `call(action,data)` transport (attaches token, handles expired-session) + typed wrappers per action.
- Pages: dashboard, billing, history, appointments, expenses, services (3 tabs), products (6 tabs), vendors, staff (5 tabs), hrapprovals (2 tabs), customers, organizations, users, roles, permissions, settings.
- **Customer portal** (`customer.html`): phone-only, gamified "My Gems" — tier, balance, progress, visit history.
- **Staff portal** (`staff.html` + `js/staff-portal.js`): phone+PIN (default = last 4 of phone); confirm bill items, log attendance, request advances, change PIN.

---

## 12. Setup & deployment

**Sheet setup** (Settings): `get_setup_status` checks each sheet by **column count** (missing / missing_columns / ok); `run_setup` creates or appends the missing column tail and rebuilds the `📋 Index` summary sheet. Creating `IncentiveProfiles` seeds three default profiles.

**Deploy:**
```bash
# Backend (capitalised *.js at repo root):
npx clasp push
npx clasp deploy --description "what changed"
# Copy the NEW web-app URL into: js/config.js, js/staff-portal.js, customer.html
# Frontend:
git add … && git commit -m "…" && git push   # GitHub Pages auto-deploys
```
Each `clasp deploy` mints a new URL, referenced in **three** files. Current deployment id is recorded in `CLAUDE.md`.

---

## 13. Known issues & caveats

- 🐞 `Auth.resetPassword` mis-branches on a `TextOutput` `.status` — password update path effectively unreachable; fix required.
- Customer bill history matches by **name**, not phone (rename/collision risk).
- Voiding a bill does **not** reverse stock or Gems.
- `update` handlers never rewrite `orgId` (no org reassignment).
- `minRedemption` configured but not enforced in billing.
- Gem redemption is double-represented on save (rupees in `discount` + points in `redeemPoints`).
- WeeklySchedule "current/future only" rule is UI-enforced, not backend.
- Passwords are unsalted SHA-256 — acceptable for an internal tool, not best practice.

---

*Generated from a complete read of the codebase. Regenerate the docs after significant changes so they stay authoritative.*
