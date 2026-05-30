// Payroll sheet columns (0-based):
// payrollId(0), staffId(1), staffName(2), period(3), baseSalary(4), payableDays(5),
// eligibleOffs(6), totalDaysOff(7), excessLeaves(8), leaveDeduction(9),
// adjustedBaseSalary(10), allowances(11), otHours(12), otPay(13),
// serviceIncentive(14), productIncentive(15), makeupIncentive(16), targetIncentive(17),
// totalIncentive(18), advanceDeducted(19), netPay(20), status(21), notes(22), createdAt(23)

const Payroll = {

  calculate(data) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // ── 1. Load staff row ─────────────────────────────────────────────────
    const staffSheet = ss.getSheetByName('Staff');
    if (!staffSheet) return Utils.createResponse('error', 'Staff sheet not found');

    const staffRows = staffSheet.getDataRange().getValues();
    let staffRow = null;
    for (let i = 1; i < staffRows.length; i++) {
      if (staffRows[i][0] === data.staffId) { staffRow = staffRows[i]; break; }
    }
    if (!staffRow) return Utils.createResponse('error', 'Staff member not found');

    const staffName   = staffRow[2];
    const salary      = Number(staffRow[9])  || 0;
    const allowances  = Number(staffRow[10]) || 0;
    const profileId   = staffRow[15] || '';
    const targetPeriod = staffRow[16] || 'monthly';

    // ── 2. Load incentive profile ─────────────────────────────────────────
    let profile = { otHourlyRate: 0, l1Type: 'fixed', l1Value: 0, l2Type: 'fixed', l2Value: 0, xPct: 0, yPct: 0, zPct: 0, revenueBase: 'individual' };
    if (profileId) {
      const profSheet = ss.getSheetByName('IncentiveProfiles');
      if (profSheet) {
        const profRows = profSheet.getDataRange().getValues();
        for (let i = 1; i < profRows.length; i++) {
          if (profRows[i][0] === profileId) {
            profile = {
              revenueBase:  profRows[i][3],
              otHourlyRate: Number(profRows[i][4])  || 0,
              l1Type:       profRows[i][5],
              l1Value:      Number(profRows[i][6])  || 0,
              l2Type:       profRows[i][7],
              l2Value:      Number(profRows[i][8])  || 0,
              xPct:         Number(profRows[i][9])  || 0,
              yPct:         Number(profRows[i][10]) || 0,
              zPct:         Number(profRows[i][11]) || 0
            };
            break;
          }
        }
      }
    }

    // ── 3. Compute L1, L2 ─────────────────────────────────────────────────
    const L1 = profile.l1Type === 'salary_pct' ? salary * profile.l1Value / 100 : profile.l1Value;
    const L2 = profile.l2Type === 'salary_pct' ? salary * profile.l2Value / 100 : profile.l2Value;

    // ── 4. Period date range ──────────────────────────────────────────────
    const period  = data.period; // 'YYYY-MM'
    const [yr, mo] = period.split('-').map(Number);
    const fromStr = period + '-01';
    const lastDay = new Date(yr, mo, 0).getDate(); // day 0 of next month = last day of this month
    const toStr   = period + '-' + String(lastDay).padStart(2, '0');

    // ── 5. Read attendance ────────────────────────────────────────────────
    const attSheet = ss.getSheetByName('StaffAttendance');
    let totalDaysOff = 0;
    let otHours      = 0;
    const peakDays   = new Set([5, 6, 0]); // Fri, Sat, Sun (JS getDay())

    if (attSheet) {
      const attRows = attSheet.getDataRange().getValues();
      for (let i = 1; i < attRows.length; i++) {
        if (!attRows[i][0]) continue;
        if (attRows[i][1] !== data.staffId) continue;
        const d = attRows[i][2];
        const dateStr = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
        if (dateStr < fromStr || dateStr > toStr) continue;

        const dayStatus = String(attRows[i][8] || '').toLowerCase();
        const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
        const isPeak    = peakDays.has(dayOfWeek);

        if (dayStatus === 'absent') {
          totalDaysOff += isPeak ? 2 : 1;
        } else if (dayStatus === 'half-day') {
          totalDaysOff += isPeak ? 1 : 0.5;
        }

        if (dayStatus === 'present' || dayStatus === 'half-day') {
          otHours += Number(attRows[i][7]) || 0;
        }
      }
    }

    // ── 6. Deductions & adjustments ───────────────────────────────────────
    const eligibleOffs       = Number(data.eligibleOffs) || 4;
    const payableDays        = Number(data.payableDays)  || 26;
    const excessLeaves       = Math.max(0, totalDaysOff - eligibleOffs);
    const leaveDeduction     = excessLeaves * (salary / payableDays);
    const adjustedBaseSalary = salary - leaveDeduction;
    const otPay              = otHours * profile.otHourlyRate;
    const advanceDeducted    = Number(data.advanceDeducted) || 0;

    // ── 7. Incentives ─────────────────────────────────────────────────────
    let targetIncentive  = 0;
    let directIncentive  = 0;
    let productIncentive = 0;
    let serviceIncentive = 0;
    let makeupIncentive  = 0;

    if (targetPeriod === 'weekly') {
      // Sum approved WeeklyIncentive rows for this staff within the period
      const wkiSheet = ss.getSheetByName('WeeklyIncentive');
      if (wkiSheet) {
        const wkiRows = wkiSheet.getDataRange().getValues();
        for (let i = 1; i < wkiRows.length; i++) {
          if (!wkiRows[i][0]) continue;
          if (wkiRows[i][1] !== data.staffId) continue;
          const ws = wkiRows[i][2] instanceof Date ? wkiRows[i][2].toISOString().slice(0, 10) : String(wkiRows[i][2]).slice(0, 10);
          if (ws < fromStr || ws > toStr) continue;
          targetIncentive  += Number(wkiRows[i][5]) || 0;
          directIncentive  += Number(wkiRows[i][6]) || 0;
          productIncentive += Number(wkiRows[i][7]) || 0;
        }
      }
    } else {
      const result = this._computeMonthlyIncentives(data.staffId, period, profile, L1, L2, salary);
      serviceIncentive = result.serviceIncentive;
      productIncentive = result.productIncentive;
      makeupIncentive  = result.makeupIncentive;
      targetIncentive  = result.targetIncentive;
      directIncentive  = makeupIncentive; // alias for summary
    }

    const totalIncentive = targetIncentive + directIncentive + productIncentive;
    const netPay         = adjustedBaseSalary + allowances + otPay + totalIncentive - advanceDeducted;

    const breakdown = {
      staffId:           data.staffId,
      staffName,
      period,
      baseSalary:        salary,
      payableDays,
      eligibleOffs,
      totalDaysOff,
      excessLeaves,
      leaveDeduction,
      adjustedBaseSalary,
      allowances,
      otHours,
      otPay,
      serviceIncentive,
      productIncentive,
      makeupIncentive,
      targetIncentive,
      totalIncentive,
      advanceDeducted,
      netPay,
      status:  'draft',
      notes:   data.notes || '',
      createdAt: new Date().toISOString()
    };

    return Utils.createResponse('success', 'Payroll calculated', breakdown);
  },

  _computeMonthlyIncentives(staffId, period, profile, L1, L2, baseSalary) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const [yr, mo] = period.split('-').map(Number);
    const fromStr  = period + '-01';
    const lastDay  = new Date(yr, mo, 0).getDate();
    const toStr    = period + '-' + String(lastDay).padStart(2, '0');

    // ── Build periodBillIds ───────────────────────────────────────────────
    const billsSheet = ss.getSheetByName('Bills');
    const periodBillIds = new Set();
    if (billsSheet) {
      const billRows = billsSheet.getDataRange().getValues();
      for (let i = 1; i < billRows.length; i++) {
        if (!billRows[i][0]) continue;
        if (String(billRows[i][/* status */5] || '').toLowerCase() === 'void') continue;
        const d = billRows[i][1]; // date col — adjust if schema differs
        const dateStr = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
        if (dateStr >= fromStr && dateStr <= toStr) periodBillIds.add(billRows[i][0]);
      }
    }

    // ── Load ServiceGroups map ────────────────────────────────────────────
    const sgSheet = ss.getSheetByName('ServiceGroups');
    const sgMap = {};
    if (sgSheet) {
      const sgRows = sgSheet.getDataRange().getValues();
      for (let i = 1; i < sgRows.length; i++) {
        if (!sgRows[i][0]) continue;
        sgMap[sgRows[i][0]] = {
          countForTarget:     sgRows[i][5] === true || sgRows[i][5] === 'TRUE',
          directIncentivePct: Number(sgRows[i][6]) || 0
        };
      }
    }

    // ── Load ProductGroups map ────────────────────────────────────────────
    const pgSheet = ss.getSheetByName('ProductGroups');
    const pgMap = {};
    if (pgSheet) {
      const pgRows = pgSheet.getDataRange().getValues();
      for (let i = 1; i < pgRows.length; i++) {
        if (!pgRows[i][0]) continue;
        pgMap[pgRows[i][0]] = { unitIncentive: Number(pgRows[i][4]) || 0 };
      }
    }

    // ── Load Services: serviceId → groupId (col 4) ────────────────────────
    const svcSheet = ss.getSheetByName('Services');
    const svcMap = {};
    if (svcSheet) {
      const svcRows = svcSheet.getDataRange().getValues();
      for (let i = 1; i < svcRows.length; i++) {
        if (!svcRows[i][0]) continue;
        svcMap[svcRows[i][0]] = svcRows[i][4]; // serviceGroupId at col 4
      }
    }

    // ── Load Products: productId → groupId (col 14) ───────────────────────
    const prodSheet = ss.getSheetByName('Products');
    const prodMap = {};
    if (prodSheet) {
      const prodRows = prodSheet.getDataRange().getValues();
      for (let i = 1; i < prodRows.length; i++) {
        if (!prodRows[i][0]) continue;
        prodMap[prodRows[i][0]] = prodRows[i][14]; // groupId at col 14
      }
    }

    // ── Read BillItems ────────────────────────────────────────────────────
    // BillItems expected cols: itemId(0), billId(1), type(2), refId(3),
    //   staffId(4? or 5?), name(5?), ...
    // Per spec: type='service' staffId at col 5, type='product' staffId at col 5,
    // lineSubtotal at col 10, qty at col 7, refId at col 3
    const biSheet = ss.getSheetByName('BillItems');
    let serviceRevenue = 0;
    let orgServiceRevenue = 0;
    let makeupIncentive  = 0;
    let productIncentive = 0;

    if (biSheet) {
      const biRows = biSheet.getDataRange().getValues();
      for (let i = 1; i < biRows.length; i++) {
        if (!biRows[i][0]) continue;
        const billId = biRows[i][1];
        if (!periodBillIds.has(billId)) continue;

        const type          = String(biRows[i][2] || '').toLowerCase();
        const refId         = biRows[i][3];
        const rowStaffId    = biRows[i][5];
        const qty           = Number(biRows[i][7])  || 0;
        const lineSubtotal  = Number(biRows[i][10]) || 0;

        if (type === 'service') {
          const groupId = svcMap[refId];
          const sg = sgMap[groupId];
          if (sg) {
            if (sg.countForTarget) {
              orgServiceRevenue += lineSubtotal; // always accumulate for org total
              if (rowStaffId === staffId) serviceRevenue += lineSubtotal;
            }
            if (rowStaffId === staffId && sg.directIncentivePct > 0) {
              makeupIncentive += lineSubtotal * sg.directIncentivePct / 100;
            }
          }
        } else if (type === 'product' && rowStaffId === staffId) {
          const groupId = prodMap[refId];
          const pg = pgMap[groupId];
          productIncentive += (pg ? pg.unitIncentive : 0) * qty;
        }
      }
    }

    // ── Compute target incentive ──────────────────────────────────────────
    const revenue = profile.revenueBase === 'org' ? orgServiceRevenue : serviceRevenue;
    let targetIncentive = 0;
    if (revenue >= L1) {
      if (revenue < L2) {
        targetIncentive = L1 * profile.xPct / 100 + (revenue - L1) * profile.yPct / 100;
      } else {
        targetIncentive = L1 * profile.xPct / 100 + (L2 - L1) * profile.yPct / 100 + (revenue - L2) * profile.zPct / 100;
      }
    }

    return {
      serviceIncentive: serviceRevenue,
      productIncentive,
      makeupIncentive,
      targetIncentive
    };
  },

  save(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payroll');
    if (!sheet) return Utils.createResponse('error', 'Payroll sheet not found');

    const payrollId = 'PAY' + Date.now();
    const now = new Date().toISOString();

    sheet.appendRow([
      payrollId,
      data.staffId,
      data.staffName           || '',
      data.period              || '',
      Number(data.baseSalary)        || 0,
      Number(data.payableDays)       || 0,
      Number(data.eligibleOffs)      || 0,
      Number(data.totalDaysOff)      || 0,
      Number(data.excessLeaves)      || 0,
      Number(data.leaveDeduction)    || 0,
      Number(data.adjustedBaseSalary)|| 0,
      Number(data.allowances)        || 0,
      Number(data.otHours)           || 0,
      Number(data.otPay)             || 0,
      Number(data.serviceIncentive)  || 0,
      Number(data.productIncentive)  || 0,
      Number(data.makeupIncentive)   || 0,
      Number(data.targetIncentive)   || 0,
      Number(data.totalIncentive)    || 0,
      Number(data.advanceDeducted)   || 0,
      Number(data.netPay)            || 0,
      data.status                    || 'draft',
      data.notes                     || '',
      data.createdAt                 || now
    ]);

    return Utils.createResponse('success', 'Payroll saved successfully', { payrollId });
  },

  getAll(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payroll');
    if (!sheet) return Utils.createResponse('success', 'Payroll retrieved', { payroll: [] });

    const rows = sheet.getDataRange().getValues();
    const filterPeriod  = (data && data.period)  ? data.period  : null;
    const filterStaffId = (data && data.staffId) ? data.staffId : null;
    const payroll = [];

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (filterStaffId && rows[i][1] !== filterStaffId) continue;
      if (filterPeriod  && rows[i][3] !== filterPeriod)  continue;

      const createdAt = rows[i][23];
      payroll.push({
        payrollId:           rows[i][0],
        staffId:             rows[i][1],
        staffName:           rows[i][2],
        period:              rows[i][3],
        baseSalary:          Number(rows[i][4])  || 0,
        payableDays:         Number(rows[i][5])  || 0,
        eligibleOffs:        Number(rows[i][6])  || 0,
        totalDaysOff:        Number(rows[i][7])  || 0,
        excessLeaves:        Number(rows[i][8])  || 0,
        leaveDeduction:      Number(rows[i][9])  || 0,
        adjustedBaseSalary:  Number(rows[i][10]) || 0,
        allowances:          Number(rows[i][11]) || 0,
        otHours:             Number(rows[i][12]) || 0,
        otPay:               Number(rows[i][13]) || 0,
        serviceIncentive:    Number(rows[i][14]) || 0,
        productIncentive:    Number(rows[i][15]) || 0,
        makeupIncentive:     Number(rows[i][16]) || 0,
        targetIncentive:     Number(rows[i][17]) || 0,
        totalIncentive:      Number(rows[i][18]) || 0,
        advanceDeducted:     Number(rows[i][19]) || 0,
        netPay:              Number(rows[i][20]) || 0,
        status:              rows[i][21],
        notes:               rows[i][22],
        createdAt:           createdAt instanceof Date ? createdAt.toISOString() : String(createdAt)
      });
    }

    return Utils.createResponse('success', 'Payroll retrieved', { payroll });
  },

  updateStatus(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payroll');
    if (!sheet) return Utils.createResponse('error', 'Payroll sheet not found');

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === data.payrollId) {
        sheet.getRange(i + 1, 22).setValue(data.status || rows[i][21]);
        sheet.getRange(i + 1, 23).setValue(data.notes  || rows[i][22]);
        return Utils.createResponse('success', 'Payroll status updated successfully');
      }
    }
    return Utils.createResponse('error', 'Payroll record not found');
  }
};
