// Setup.js – Sheet scaffolding for fresh deployments
//
// Usage from the web app:   action = 'get_setup_status'  → returns per-sheet audit
//                           action = 'run_setup'          → creates / fixes selected sheets
// Usage from GAS editor:    run setupSheets() manually via the Apps Script IDE

// ── Canonical column headers for every sheet ─────────────────────────────────
const SHEET_SCHEMA = {
  // ── Auth / Admin ────────────────────────────────────────────────────────────
  Users:               ['id','email','password','fullName','phone','whatsapp','orgId','roleId','status'],
  Organizations:       ['id','name','parentId','type','status'],
  Roles:               ['id','name','description','status'],
  Permissions:         ['id','roleId','menuItem','canAccess'],

  // ── Customers ───────────────────────────────────────────────────────────────
  Customers:           ['timestamp','name','phone','addedBy'],

  // ── Service catalogue ───────────────────────────────────────────────────────
  ServiceGroups:       ['id','name','description','gstPct','sacCode','countForTarget',
                        'directIncentivePct','sortOrder','status'],
  Services:            ['id','name','description','duration','serviceGroupId','defaultPrice','status'],
  PriceBooks:          ['id','name','description','status'],
  PriceBookItems:      ['itemId','priceBookId','serviceId','price'],

  // ── Product catalogue ───────────────────────────────────────────────────────
  Products:            ['id','name','category','uom','unitCost','retailPrice','gst',
                        'currentStock','baseStock','manufacturer','vendorName','vendorContact',
                        'status','vendorId','groupId'],
  ProductGroups:       ['id','name','gstPct','hsnCode','unitIncentive','sortOrder','status'],
  StockMovements:      ['movementId','date','productId','productName','type','refId','qty',
                        'unitCost','notes','createdAt','vendorId','vendorName'],
  StockAudits:         ['auditId','auditDate','notes','createdAt'],
  AuditItems:          ['itemId','auditId','productId','productName','systemQty',
                        'physicalQty','variance','unitCost','notes'],

  // ── Vendors & Purchasing ─────────────────────────────────────────────────────
  Vendors:             ['vendorId','name','contactPerson','phone','email','address','notes','status'],
  PurchaseOrders:      ['poId','vendorId','vendorName','poDate','expectedDate','status','notes','createdAt'],
  POItems:             ['itemId','poId','productId','productName','uom','qtyOrdered','qtyReceived','unitCost'],

  // ── Billing ──────────────────────────────────────────────────────────────────
  Bills:               ['billId','customerId','customerName','priceBookId','createdAt',
                        'servicesSubtotal','servicesGst','retailSubtotal','retailGst',
                        'discount','tip','grandTotal','paymentMode',
                        'cashAmt','cardAmt','upiAmt','status','discountType'],
  BillItems:           ['billItemId','billId','type','refId','itemName','staffId','staffName',
                        'qty','unitPrice','gstPct','lineSubtotal','lineGst','lineTotal',
                        'profProductId','profProductName','profQty','profUom'],

  // ── Appointments ─────────────────────────────────────────────────────────────
  Appointments:        ['appointmentId','customerId','customerName','customerPhone',
                        'staffId','staffName','serviceId','serviceName',
                        'startTime','durationMins','status','notes','billId','createdAt','createdBy'],

  // ── Expenses ─────────────────────────────────────────────────────────────────
  Expenses:            ['expenseId','date','category','vendor','description','amount',
                        'paymentMode','referenceNo','notes','createdAt','createdBy','status'],

  // ── HR ───────────────────────────────────────────────────────────────────────
  Staff:               ['id','userId','name','phone','email','aadharNumber','upiId',
                        'startDate','role','salary','allowance','incentiveStructure',
                        'specialization','status','staffType','profileId','targetPeriod'],
  IncentiveProfiles:   ['profileId','profileName','profileType','revenueBase','otHourlyRate',
                        'l1Type','l1Value','l2Type','l2Value','xPct','yPct','zPct','status'],
  Shifts:              ['shiftId','name','startTime','endTime','breakMins','status'],
  StaffShiftAllocation:['allocationId','staffId','shiftId','fromDate','toDate','createdAt'],
  StaffAttendance:     ['attendanceId','staffId','date','shiftId','clockIn','clockOut',
                        'hoursWorked','otHours','dayStatus','notes','createdAt'],
  StaffAdvance:        ['advanceId','staffId','date','type','amount','notes','runningBalance','createdAt'],
  WeeklyIncentive:     ['snapshotId','staffId','weekStart','weekEnd','revenueBase',
                        'targetIncentive','directIncentive','productIncentive',
                        'totalIncentive','status','calculatedAt'],
  Payroll:             ['payrollId','staffId','staffName','period','baseSalary',
                        'payableDays','eligibleOffs','totalDaysOff','excessLeaves',
                        'leaveDeduction','adjustedBaseSalary','allowances','otHours','otPay',
                        'serviceIncentive','productIncentive','makeupIncentive',
                        'targetIncentive','totalIncentive','advanceDeducted',
                        'netPay','status','notes','createdAt'],

  // ── Settings ─────────────────────────────────────────────────────────────────
  OrgSettings:         ['key','value']
};

// ── Group labels for the UI ───────────────────────────────────────────────────
const SHEET_GROUPS = {
  'Auth / Admin':        ['Users','Organizations','Roles','Permissions'],
  'Customers':           ['Customers'],
  'Service Catalogue':   ['ServiceGroups','Services','PriceBooks','PriceBookItems'],
  'Product Catalogue':   ['Products','ProductGroups','StockMovements','StockAudits','AuditItems'],
  'Vendors & Purchasing':['Vendors','PurchaseOrders','POItems'],
  'Billing':             ['Bills','BillItems'],
  'Appointments':        ['Appointments'],
  'Expenses':            ['Expenses'],
  'HR':                  ['Staff','IncentiveProfiles','Shifts','StaffShiftAllocation',
                          'StaffAttendance','StaffAdvance','WeeklyIncentive','Payroll'],
  'Settings':            ['OrgSettings']
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

      if (existing.length >= expected.length) {
        // Sheet has at least as many columns as the schema requires — OK.
        // (May have extra user-added cols at the end; that's fine.)
        results.push({
          sheet: name, group: groupOf[name] || 'Other',
          status: 'ok', expected, existing, missingCols: [], canFix: true
        });
      } else {
        // Fewer columns than schema — append the missing tail columns.
        const missingCols = expected.slice(existing.length);
        results.push({
          sheet: name, group: groupOf[name] || 'Other',
          status: 'missing_columns', expected, existing, missingCols, canFix: true
        });
      }
    });

    return Utils.createResponse('success', 'Setup status retrieved', { results, groups: Object.keys(SHEET_GROUPS) });
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

    return Utils.createResponse('success', 'Setup complete', { done, errors });
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

  ui.alert('Salon Manager – Sheet Setup', `Setup complete!\n\n${done}${errors ? '\n\nErrors:\n' + errors : ''}`, ui.ButtonSet.OK);
}

// ── Spreadsheet open trigger — adds a menu item ───────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Salon Manager')
    .addItem('⚙️ Setup / Verify Sheets', 'setupSheets')
    .addToUi();
}
