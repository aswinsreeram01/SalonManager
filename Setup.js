// Setup.js – Sheet scaffolding for fresh deployments
//
// Usage from the web app:   action = 'get_setup_status'    → returns per-sheet audit
//                           action = 'run_setup'            → creates / fixes selected sheets
//                           action = 'refresh_summary_sheet'→ rebuilds the 📋 Index sheet
// Usage from GAS editor:    run setupSheets() manually via the Apps Script IDE

// ── Canonical column headers for every sheet ─────────────────────────────────
const SHEET_SCHEMA = {
  // ── Auth / Admin ────────────────────────────────────────────────────────────
  Users:               ['id','email','password','fullName','phone','whatsapp','orgId','roleId','status'],
  Organizations:       ['id','name','parentId','type','status'],
  Roles:               ['id','name','description','status'],
  Permissions:         ['id','roleId','menuItem','canRead','canUpdate'],

  // ── Customers ───────────────────────────────────────────────────────────────
  Customers:           ['timestamp','name','phone','addedBy','orgId','pointsBalance','statusPoints','tier'],

  // ── Service catalogue ───────────────────────────────────────────────────────
  ServiceGroups:       ['id','name','description','gstPct','sacCode','countForTarget',
                        'directIncentivePct','sortOrder','status','orgId','pointsEligible'],
  Services:            ['id','name','description','duration','serviceGroupId','defaultPrice','status','orgId'],
  PriceBooks:          ['id','name','description','status','orgId'],
  PriceBookItems:      ['itemId','priceBookId','serviceId','price','orgId'],

  // ── Product catalogue ───────────────────────────────────────────────────────
  Products:            ['id','name','category','uom','unitCost','retailPrice','gst',
                        'currentStock','baseStock','manufacturer','vendorName','vendorContact',
                        'status','vendorId','groupId','orgId'],
  ProductGroups:       ['id','name','gstPct','hsnCode','unitIncentive','sortOrder','status','orgId','pointsEligible'],
  PointsLedger:        ['ledgerId','customerPhone','customerName','billId','earnedDate','expiryDate',
                        'type','points','balanceAfter','note','orgId'],
  StockMovements:      ['movementId','date','productId','productName','type','refId','qty',
                        'unitCost','notes','createdAt','vendorId','vendorName','createdBy','orgId'],
  StockAudits:         ['auditId','auditDate','notes','createdAt','createdBy','orgId'],
  AuditItems:          ['itemId','auditId','productId','productName','systemQty',
                        'physicalQty','variance','unitCost','notes','orgId'],

  // ── Vendors & Purchasing ─────────────────────────────────────────────────────
  Vendors:             ['vendorId','name','contactPerson','phone','email','address','notes','status','orgId'],
  PurchaseOrders:      ['poId','vendorId','vendorName','poDate','expectedDate','status','notes','createdAt','createdBy','orgId'],
  POItems:             ['itemId','poId','productId','productName','uom','qtyOrdered','qtyReceived','unitCost','orgId'],

  // ── Billing ──────────────────────────────────────────────────────────────────
  Bills:               ['billId','customerId','customerName','priceBookId','createdAt',
                        'servicesSubtotal','servicesGst','retailSubtotal','retailGst',
                        'discount','tip','grandTotal','paymentMode',
                        'cashAmt','cardAmt','upiAmt','status','discountType','createdBy','orgId'],
  BillItems:           ['billItemId','billId','type','refId','itemName','staffId','staffName',
                        'qty','unitPrice','gstPct','lineSubtotal','lineGst','lineTotal',
                        'profProductId','profProductName','profQty','profUom','orgId','staffConfirmed'],

  // ── Appointments ─────────────────────────────────────────────────────────────
  Appointments:        ['appointmentId','customerId','customerName','customerPhone',
                        'staffId','staffName','serviceId','serviceName',
                        'startTime','durationMins','status','notes','billId','createdAt','createdBy','orgId'],

  // ── Expenses ─────────────────────────────────────────────────────────────────
  Expenses:            ['expenseId','date','category','vendor','description','amount',
                        'paymentMode','referenceNo','notes','createdAt','createdBy','status','orgId'],

  // ── HR ───────────────────────────────────────────────────────────────────────
  Staff:               ['id','userId','name','phone','email','aadharNumber','upiId',
                        'startDate','role','salary','allowance','incentiveStructure',
                        'specialization','status','staffType','profileId','targetPeriod','orgId','staffPin'],
  IncentiveProfiles:   ['profileId','profileName','profileType','revenueBase','otHourlyRate',
                        'l1Type','l1Value','l2Type','l2Value','xPct','yPct','zPct','status','orgId'],
  Shifts:              ['shiftId','name','startTime','endTime','breakMins','status','orgId'],
  StaffShiftAllocation:['allocationId','staffId','shiftId','fromDate','toDate','createdAt','orgId'],
  WeeklySchedule:      ['scheduleId','staffId','weekStart','shiftId','offDays','orgId'],
  StaffAttendance:     ['attendanceId','staffId','date','shiftId','clockIn','clockOut',
                        'hoursWorked','otHours','dayStatus','notes','createdAt','orgId','status'],
  StaffAdvance:        ['advanceId','staffId','date','type','amount','notes','runningBalance','createdAt','orgId',
                        'status','approvedAmount','paymentMode'],
  WeeklyIncentive:     ['snapshotId','staffId','weekStart','weekEnd','revenueBase',
                        'targetIncentive','directIncentive','productIncentive',
                        'totalIncentive','status','calculatedAt','orgId'],
  Payroll:             ['payrollId','staffId','staffName','period','baseSalary',
                        'payableDays','eligibleOffs','totalDaysOff','excessLeaves',
                        'leaveDeduction','adjustedBaseSalary','allowances','otHours','otPay',
                        'serviceIncentive','productIncentive','makeupIncentive',
                        'targetIncentive','totalIncentive','advanceDeducted',
                        'netPay','status','notes','createdAt','orgId'],

  // ── Settings ─────────────────────────────────────────────────────────────────
  OrgSettings:           ['key','value']
};

// ── Group labels for the UI ───────────────────────────────────────────────────
const SHEET_GROUPS = {
  'Auth / Admin':        ['Users','Organizations','Roles','Permissions'],
  'Customers':           ['Customers'],
  'Service Catalogue':   ['ServiceGroups','Services','PriceBooks','PriceBookItems'],
  'Product Catalogue':   ['Products','ProductGroups','StockMovements','StockAudits','AuditItems'],
  'Vendors & Purchasing':['Vendors','PurchaseOrders','POItems'],
  'Billing':             ['Bills','BillItems'],
  'Loyalty':             ['PointsLedger'],
  'Appointments':        ['Appointments'],
  'Expenses':            ['Expenses'],
  'HR':                  ['Staff','IncentiveProfiles','Shifts','StaffShiftAllocation','WeeklySchedule',
                          'StaffAttendance','StaffAdvance','WeeklyIncentive','Payroll'],
  'Settings':            ['OrgSettings']
};

// ── Human-readable descriptions for every sheet ──────────────────────────────
const SHEET_DESCRIPTIONS = {
  // Auth / Admin
  Users:               'Admin and staff user accounts — login credentials, role assignments, and contact details for everyone who can access the system.',
  Organizations:       'Salon branches or business units. Supports multi-location setups with a parent → child org hierarchy.',
  Roles:               'Access-control roles (e.g. Owner, Manager, Receptionist) that determine what each user can see and do.',
  Permissions:         'Granular per-role access rights mapped to each menu item or feature in the app.',

  // Customers
  Customers:           'Customer master list — name, phone number, and the timestamp they were first added.',

  // Service catalogue
  ServiceGroups:       'Service categories (e.g. Hair, Skin, Nails). Controls GST rate, whether services count toward staff targets, and display order.',
  Services:            'Individual services offered — name, duration, default price, and which service group they belong to.',
  PriceBooks:          'Named price lists (e.g. Standard, Premium, Membership) for different customer tiers or promotional periods.',
  PriceBookItems:      'Per-service price overrides within a price book, allowing custom rates without changing the base service price.',

  // Product catalogue
  Products:            'Retail and professional product catalogue — stock levels, unit cost, retail price, GST, and vendor details.',
  ProductGroups:       'Product categories controlling GST rate, HSN code, and per-unit staff incentive amounts.',
  StockMovements:      'Audit ledger of every stock change — sales, purchases, manual adjustments, and stock-audit write-offs.',
  StockAudits:         'Physical stock-count audit sessions, storing date, auditor, and overall session notes.',
  AuditItems:          'Line-item detail for each audit: expected vs. physical quantity, variance, and unit cost per product.',

  // Vendors & Purchasing
  Vendors:             'Supplier master — contact person, phone, email, address, and account status.',
  PurchaseOrders:      'Purchase orders raised to vendors, tracked through draft → approved → received.',
  POItems:             'Individual product lines within each purchase order — quantity ordered vs. received and unit cost.',

  // Billing
  Bills:               'Customer invoices — service and retail totals, taxes, discount, tip, payment mode, and split-payment breakdown.',
  BillItems:           'Line items on each bill — services and retail products with staff attribution, quantity, unit price, and GST.',
  PointsLedger:        'Loyalty points audit trail — every earn and redeem event per customer, with expiry dates and running balance.',

  // Appointments
  Appointments:        'Scheduled service bookings — customer, assigned staff, service, time slot, status, and linked bill.',

  // Expenses
  Expenses:            'Operational expense records — petty cash, rent, utilities, and other ad-hoc business outgoings.',

  // HR
  Staff:               'Employee master — personal details, salary, allowance, incentive profile, specialisation, and staff portal PIN.',
  IncentiveProfiles:   'Incentive calculation templates defining two revenue targets (T1 & T2), commission rate brackets (X% / Y% / Z%), and the OT hourly rate.',
  Shifts:              'Named work shifts with start and end times, used for scheduling and attendance tracking.',
  StaffShiftAllocation:'Legacy shift assignment — maps which shift a staff member is assigned to over a date range. Superseded by WeeklySchedule.',
  WeeklySchedule:      'Week-level shift assignments and planned off days per staff member, used to drive attendance tracking and HR approvals.',
  StaffAttendance:     'Daily attendance log — clock-in/out times, hours worked, overtime, day status (present / absent / half-day), and manager approval.',
  StaffAdvance:        'Salary advance requests with approval status, disbursement mode, and a running balance per staff member.',
  WeeklyIncentive:     'Calculated weekly incentive snapshots per staff — revenue achieved, and the breakdown of target, direct, and product incentives.',
  Payroll:             'Monthly payroll runs with a full pay-slip breakdown: base salary, days worked, deductions, OT pay, incentives, advance recovery, and net pay.',

  // Settings
  OrgSettings:         'Key-value store for organisation-level configuration — GST numbers, UPI IDs, branding details, and feature flags.',
};

// ─────────────────────────────────────────────────────────────────────────────

const Setup = {

  // Returns the audit result for every sheet in SCHEMA.
  // Each entry: { sheet, group, status, expected, existing, missingCols, canFix }
  // status: 'ok' | 'missing_columns' | 'missing'
  //
  // NOTE: GAS reads all sheets by column INDEX, not by header name.
  // Therefore verification is purely count-based:
  //   - existing.length >= expected.length → ok  (we trust column order)
  //   - existing.length <  expected.length → missing_columns (safe to append tail)
  //   - sheet absent                        → missing
  // Header names in the schema are used only when CREATING new sheets.
  // Sheets that were set up with human-readable headers ("User ID" vs "id")
  // are correctly treated as ok — no false order_mismatch flags.
  getStatus() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const results = [];

    // Build group map for quick lookup
    const groupOf = {};
    Object.entries(SHEET_GROUPS).forEach(([g, names]) =>
      names.forEach(n => { groupOf[n] = g; }));

    Object.entries(SHEET_SCHEMA).forEach(([name, expected]) => {
      const sheet = ss.getSheetByName(name);
      if (!sheet) {
        results.push({
          sheet: name, group: groupOf[name] || 'Other',
          status: 'missing', expected, existing: [], missingCols: expected, canFix: true
        });
        return;
      }

      // Read header row; guard against a completely empty sheet
      const lastCol = sheet.getLastColumn();
      let existing = [];
      if (lastCol > 0) {
        existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
          .map(h => String(h).trim())
          .filter(h => h !== '');
      }

      const sheetId = sheet.getSheetId();
      if (existing.length >= expected.length) {
        results.push({
          sheet: name, group: groupOf[name] || 'Other',
          status: 'ok', expected, existing, missingCols: [], canFix: true, sheetId
        });
      } else {
        const missingCols = expected.slice(existing.length);
        results.push({
          sheet: name, group: groupOf[name] || 'Other',
          status: 'missing_columns', expected, existing, missingCols, canFix: true, sheetId
        });
      }
    });

    const spreadsheetUrl = ss.getUrl();
    return Utils.createResponse('success', 'Setup status retrieved', {
      results, groups: Object.keys(SHEET_GROUPS), spreadsheetUrl
    });
  },

  // Executes the requested repairs.
  // data.actions = [{ sheet: 'ProductGroups', action: 'create' | 'add_columns' }]
  run(data) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const actions = data.actions || [];
    if (!actions.length) return Utils.createResponse('error', 'No actions specified');

    const done = [];
    const errors = [];

    actions.forEach(({ sheet: name, action }) => {
      const expected = SHEET_SCHEMA[name];
      if (!expected) { errors.push(`Unknown sheet: ${name}`); return; }

      try {
        if (action === 'create') {
          if (ss.getSheetByName(name)) {
            errors.push(`${name} already exists — skipped`);
            return;
          }
          const sheet = ss.insertSheet(name);
          sheet.appendRow(expected);
          // Bold header row
          sheet.getRange(1, 1, 1, expected.length).setFontWeight('bold');
          sheet.setFrozenRows(1);
          done.push(`Created ${name} (${expected.length} columns)`);

          // Seed defaults for IncentiveProfiles
          if (name === 'IncentiveProfiles') {
            IncentiveProfiles.seedDefaults();
            done.push('Seeded default IncentiveProfiles');
          }

        } else if (action === 'add_columns') {
          const sheet = ss.getSheetByName(name);
          if (!sheet) { errors.push(`${name} not found — use 'create' instead`); return; }

          const lastCol = sheet.getLastColumn();
          const existingHeaders = lastCol > 0
            ? sheet.getRange(1, 1, 1, lastCol).getValues()[0]
                .map(h => String(h).trim()).filter(h => h !== '')
            : [];

          const toAdd = expected.slice(existingHeaders.length);
          if (!toAdd.length) { done.push(`${name} already complete — skipped`); return; }

          const startCol = existingHeaders.length + 1;
          sheet.getRange(1, startCol, 1, toAdd.length).setValues([toAdd]).setFontWeight('bold');
          done.push(`${name}: added ${toAdd.length} column(s) — ${toAdd.join(', ')}`);

        } else {
          errors.push(`Unknown action '${action}' for ${name}`);
        }
      } catch (err) {
        errors.push(`${name}: ${err.message}`);
      }
    });

    // Always rebuild the summary sheet after any setup changes
    try {
      this.createSummarySheet();
      done.push('Refreshed 📋 Index summary sheet');
    } catch(e) {
      errors.push('Summary sheet: ' + e.message);
    }

    return Utils.createResponse('success', 'Setup complete', { done, errors });
  },

  // ── Summary sheet ─────────────────────────────────────────────────────────────

  // Builds (or rebuilds) the "📋 Index" sheet — a human-readable table of all
  // sheets with hyperlinks, group labels, purpose descriptions, and column counts.
  createSummarySheet() {
    const ss  = SpreadsheetApp.getActiveSpreadsheet();
    const url = ss.getUrl();
    const tz  = Session.getScriptTimeZone();

    // Map each existing sheet name → its gid for direct deep-links
    const gidMap = {};
    ss.getSheets().forEach(s => { gidMap[s.getName()] = s.getSheetId(); });

    // Collect rows in group order
    const rowData = [];
    Object.entries(SHEET_GROUPS).forEach(([group, names]) => {
      names.forEach(name => {
        rowData.push({
          name,
          group,
          desc:   SHEET_DESCRIPTIONS[name] || '',
          cols:   (SHEET_SCHEMA[name] || []).length,
          exists: gidMap[name] != null,
          gid:    gidMap[name]
        });
      });
    });

    // Create or clear the summary sheet
    const SUMMARY_NAME = '📋 Index';
    let sheet = ss.getSheetByName(SUMMARY_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SUMMARY_NAME);
    } else {
      sheet.clearContents();
      sheet.clearFormats();
    }

    // Move to front
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(1);

    // ── Header ────────────────────────────────────────────────────────────────
    sheet.appendRow(['Sheet', 'Group / Category', 'Purpose & Description', 'Cols']);

    // ── Data rows ─────────────────────────────────────────────────────────────
    rowData.forEach(r => {
      const rowNum = sheet.getLastRow() + 1;
      // Write group, description, col-count first (plain values)
      sheet.getRange(rowNum, 2, 1, 3).setValues([[r.group, r.desc, r.cols]]);
      // Sheet name cell — hyperlink if sheet exists, plain text if not yet created
      if (r.exists) {
        const safeGid = Number(r.gid);
        sheet.getRange(rowNum, 1)
          .setFormula(`=HYPERLINK("${url}#gid=${safeGid}","${r.name.replace(/"/g, '""')}")`);
      } else {
        sheet.getRange(rowNum, 1).setValue(r.name);
      }
    });

    // ── Formatting ────────────────────────────────────────────────────────────
    const totalRows = rowData.length + 1;  // header + data

    // Column widths
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 180);
    sheet.setColumnWidth(3, 530);
    sheet.setColumnWidth(4,  65);

    // Header row style
    sheet.setRowHeight(1, 36);
    sheet.getRange(1, 1, 1, 4)
      .setBackground('#2d3748')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setFontSize(11)
      .setVerticalAlignment('middle');

    // Freeze header
    sheet.setFrozenRows(1);

    // Alternating row background
    for (let i = 2; i <= totalRows; i++) {
      sheet.getRange(i, 1, 1, 4)
        .setBackground(i % 2 === 0 ? '#f7fafc' : '#edf2f7');
    }

    // Sheet-name column styling
    rowData.forEach((r, idx) => {
      const cell = sheet.getRange(idx + 2, 1);
      cell.setFontWeight('bold')
          .setFontColor(r.exists ? '#2b6cb0' : '#e53e3e')
          .setFontStyle(r.exists ? 'normal' : 'italic');
    });

    // Description column: wrap, top-align
    sheet.getRange(2, 3, rowData.length, 1)
      .setWrap(true)
      .setVerticalAlignment('top');

    // Other columns: middle-align
    sheet.getRange(2, 1, rowData.length, 2).setVerticalAlignment('middle');
    sheet.getRange(2, 4, rowData.length, 1)
      .setVerticalAlignment('middle')
      .setHorizontalAlignment('center');

    // Header: left-align all; center the Cols header
    sheet.getRange(1, 1, 1, 3).setHorizontalAlignment('left');
    sheet.getRange(1, 4, 1, 1).setHorizontalAlignment('center');

    // Full grid border
    sheet.getRange(1, 1, totalRows, 4)
      .setBorder(true, true, true, true, true, true,
                 '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);

    // "Last updated" note below table
    const updatedAt = Utilities.formatDate(new Date(), tz, 'dd MMM yyyy, HH:mm');
    sheet.getRange(totalRows + 2, 1)
      .setValue('Last updated: ' + updatedAt)
      .setFontColor('#a0aec0')
      .setFontStyle('italic')
      .setFontSize(10);

    return SUMMARY_NAME;
  },

  // Exposes createSummarySheet as a web-app action.
  refreshSummary() {
    try {
      const name = this.createSummarySheet();
      return Utils.createResponse('success', '"' + name + '" sheet created / updated successfully');
    } catch(e) {
      return Utils.createResponse('error', 'Could not update summary sheet: ' + e.message);
    }
  }
};

// ── Entry point callable from the GAS IDE (Run menu) ─────────────────────────
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  // Build summary of what needs doing
  const statusResult = Setup.getStatus();
  // getStatus() returns a ContentService TextOutput; parse it back
  const parsed = JSON.parse(statusResult.getContent());
  const results = parsed.results || [];

  const missing        = results.filter(r => r.status === 'missing');
  const missingCols    = results.filter(r => r.status === 'missing_columns');
  const orderMismatch  = results.filter(r => r.status === 'order_mismatch');
  const ok             = results.filter(r => r.status === 'ok');

  let summary = `Sheet Audit Summary\n${'─'.repeat(40)}\n`;
  summary += `✅ OK:              ${ok.length} sheets\n`;
  summary += `➕ Missing sheets:  ${missing.length} (${missing.map(r => r.sheet).join(', ') || 'none'})\n`;
  summary += `⚠️  Missing columns: ${missingCols.length} (${missingCols.map(r => r.sheet).join(', ') || 'none'})\n`;
  summary += `🔴 Order mismatch:  ${orderMismatch.length} (${orderMismatch.map(r => r.sheet).join(', ') || 'none'})\n\n`;

  if (missing.length === 0 && missingCols.length === 0) {
    ui.alert('Salon Manager – Sheet Setup', summary + 'Nothing to do. All sheets are up to date.', ui.ButtonSet.OK);
    return;
  }

  if (orderMismatch.length) {
    summary += `⚠️  Order-mismatch sheets require manual column reordering (no auto-fix available):\n`;
    orderMismatch.forEach(r => {
      summary += `  • ${r.sheet}\n    Expected: ${r.expected.join(', ')}\n    Actual:   ${r.existing.join(', ')}\n`;
    });
    summary += '\n';
  }

  const fixable = [...missing, ...missingCols];
  if (!fixable.length) {
    ui.alert('Salon Manager – Sheet Setup', summary, ui.ButtonSet.OK);
    return;
  }

  summary += `The following fixable issues will be resolved:\n`;
  missing.forEach(r => summary += `  • CREATE ${r.sheet}\n`);
  missingCols.forEach(r => summary += `  • ADD COLUMNS to ${r.sheet}: ${r.missingCols.join(', ')}\n`);
  summary += '\nProceed?';

  const response = ui.alert('Salon Manager – Sheet Setup', summary, ui.ButtonSet.YES_NO);
  if (response !== ui.Button.YES) {
    ui.alert('Setup cancelled.');
    return;
  }

  const actions = [
    ...missing.map(r => ({ sheet: r.sheet, action: 'create' })),
    ...missingCols.map(r => ({ sheet: r.sheet, action: 'add_columns' }))
  ];

  const runResult = Setup.run({ actions });
  const runParsed = JSON.parse(runResult.getContent());
  const done   = (runParsed.done   || []).map(m => `✅ ${m}`).join('\n');
  const errors = (runParsed.errors || []).map(m => `❌ ${m}`).join('\n');

  let finalMsg = `Setup complete!\n\n${done}${errors ? '\n\nErrors:\n' + errors : ''}`;

  // Rebuild the summary index sheet
  try {
    Setup.createSummarySheet();
    finalMsg += '\n\n✅ 📋 Index summary sheet refreshed.';
  } catch(e) {
    finalMsg += '\n\n⚠️ Could not refresh summary sheet: ' + e.message;
  }

  ui.alert('Salon Manager – Sheet Setup', finalMsg, ui.ButtonSet.OK);
}

// ── Spreadsheet open trigger — adds a menu item ───────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Salon Manager')
    .addItem('⚙️ Setup / Verify Sheets', 'setupSheets')
    .addToUi();
}
