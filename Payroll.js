// Payroll sheet columns (0-based):
// payrollId(0), staffId(1), staffName(2), period(3), baseSalary(4), payableDays(5),
// eligibleOffs(6), totalDaysOff(7), excessLeaves(8), leaveDeduction(9),
// adjustedBaseSalary(10), allowances(11), otHours(12), otPay(13),
// serviceIncentive(14) — actually holds REVENUE (manual serviceValue or bill-scanned),
// productIncentive(15) — productCount x the staff's Comp Plan defaultProductIncentive
//   rate (no specific Product Group to pull a per-unit override from, same reasoning
//   as makeupIncentive using flatIncentivePct),
// makeupIncentive(16) — final $ (manual makeupValue or bill-scanned),
// targetIncentive(17) — $ computed from serviceIncentive/revenue via the L1/L2/X/Y/Z slabs,
// totalIncentive(18), advanceDeducted(19), netPay(20), status(21), notes(22), createdAt(23),
// orgId(24),
// weekdayAbsentDates(25) — comma-separated ISO dates, Mon-Thu absences,
// weekendAbsentDates(26) — comma-separated ISO dates, Fri/Sat/Sun absences,
// longAbsenceExcludedDays(27) — auto-detected run of >=8 consecutive absent
//   calendar days touching the start or end of the month; excluded from both
//   totalDaysOff and payableDays. Editable on the Payroll page.
// serviceValue(28) — manual REVENUE override (Quick Entry), blank by default;
//   runs through the Comp Plan's L1/L2/X/Y/Z slabs same as bill-scanned revenue,
// productCount(29) — manual count, record-keeping only, no $ effect, blank by default,
// tipsOverride(30) — manual flat $ addition to net pay, blank by default,
// makeupValue(31) — manual REVENUE override for the makeup incentive (parallels
//   serviceValue, not a final $ amount) — multiplied by the applicable flat/direct
//   incentive % (the staff's Comp Plan flatIncentivePct, since a manual entry has
//   no specific Service Group to pull an override from) to get makeupIncentive(16),
// weekdayHalfDayDates(32) — comma-separated ISO dates, Mon-Thu half-days,
// weekendHalfDayDates(33) — comma-separated ISO dates, Fri/Sat/Sun half-days,
// payUnusedLeaves(34) — manager attestation checkbox: pay for eligible offs
//   NOT taken (skipped on instruction). FALSE/blank by default,
// unusedLeavesReason(35) — free-text reason recorded alongside the checkbox,
// unusedLeavePay(36) — computed: max(0, eligibleOffs − totalDaysOff) ×
//   (baseSalary ÷ calendar days in the month) when payUnusedLeaves is set,
//   else 0. Stored so history stays stable if the formula ever changes.
//
// Attendance-derived columns (5,7,8,9,10,12,13,25,26,27,32,33) are fully
// recomputed every time Quick Entry saves attendance for that staff+period
// via upsertFromAttendance — they always reflect the latest attendance data.
// Everything else (serviceValue, productCount, tipsOverride, makeupValue,
// advanceDeducted, status, notes, and the derived incentive/net-pay figures)
// is owned by the Payroll page's reconcile screen and is preserved across
// Quick Entry saves.
//
// Date-list columns (25, 26, 32, 33) are read through _normalizeDateListCell
// — Sheets can silently coerce a single bare date string into a real Date
// cell, which then serializes as a full ISO timestamp rather than a plain
// date. Always normalize on read, never trust the raw cell type.

const Payroll = {

  // Sheets sometimes auto-converts a "YYYY-MM" string (e.g. from appendRow)
  // into an actual Date cell depending on locale/column formatting — reading
  // it back then yields a Date object, not the string, so a strict === / !==
  // comparison against a period string like '2026-07' silently never matches
  // and every row gets filtered out. Always normalize before comparing.
  _normalizePeriod(v) {
    if (v instanceof Date) {
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM');
    }
    return String(v || '').slice(0, 7);
  },

  // Same Sheets auto-date-coercion problem as _normalizePeriod, but for the
  // comma-joined absence/half-day date-list columns: a cell holding exactly
  // ONE date (no comma) looks like a valid date to Sheets and can get
  // silently converted to a real Date cell on write. Reading it back then
  // yields a Date object which, once it crosses JSON.stringify, turns into a
  // full ISO timestamp string (e.g. "2026-06-12T05:00:00.000Z") instead of
  // the plain "2026-06-12" — always normalize before returning to the client.
  _normalizeDateListCell(v) {
    if (v instanceof Date) {
      return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    return String(v || '');
  },

  // ── Attendance-derived numbers ────────────────────────────────────────────

  // Builds weekday/weekend absence date lists, total days off (weekend
  // absence still weighted 2x, matching pre-existing behavior), OT hours,
  // and auto-detects a long-absence block. Unless a day is explicitly
  // marked 'absent' in StaffAttendance, it's assumed present with 9 hours
  // worked (no OT) — a day with no attendance record at all is NOT treated
  // as an absence anywhere in this calculation, only an explicit 'absent'
  // status is.
  _computeAttendanceDerived(staffId, period) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const [yr, mo] = period.split('-').map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const fromStr = period + '-01';
    const toStr   = period + '-' + String(daysInMonth).padStart(2, '0');

    const attSheet = ss.getSheetByName('StaffAttendance');
    const byDate = {}; // dateStr -> dayStatus ('present'|'absent'|'half-day')
    let otHours = 0;

    if (attSheet) {
      const attRows = attSheet.getDataRange().getValues();
      for (let i = 1; i < attRows.length; i++) {
        if (!attRows[i][0]) continue;
        if (attRows[i][1] !== staffId) continue;
        const d = attRows[i][2];
        const dateStr = d instanceof Date ? Utils.businessDate(d) : String(d).slice(0, 10);
        if (dateStr < fromStr || dateStr > toStr) continue;

        const dayStatus = String(attRows[i][8] || '').toLowerCase();
        byDate[dateStr] = dayStatus;
        if (dayStatus === 'present' || dayStatus === 'half-day') {
          otHours += Number(attRows[i][7]) || 0;
        }
      }
    }

    const peakDays = new Set([5, 6, 0]); // Fri, Sat, Sun (JS getDay())
    const weekdayAbsentDates  = [];
    const weekendAbsentDates  = [];
    const weekdayHalfDayDates = [];
    const weekendHalfDayDates = [];
    let totalDaysOff = 0;
    const dayOffAmountByDate = {}; // for long-absence-block subtraction below

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = fromStr.slice(0, 8) + String(day).padStart(2, '0');
      const dayStatus = byDate[dateStr];
      const dow = new Date(dateStr + 'T00:00:00').getDay();
      const isPeak = peakDays.has(dow);

      let amount = 0;
      if (dayStatus === 'absent') {
        amount = isPeak ? 2 : 1;
        (isPeak ? weekendAbsentDates : weekdayAbsentDates).push(dateStr);
      } else if (dayStatus === 'half-day') {
        amount = isPeak ? 1 : 0.5;
        (isPeak ? weekendHalfDayDates : weekdayHalfDayDates).push(dateStr);
      }
      dayOffAmountByDate[dateStr] = amount;
      totalDaysOff += amount;
    }

    // Long-absence block: a run of >=8 consecutive calendar days explicitly
    // marked 'absent', touching day 1 or the last day of the month. A day
    // with NO attendance record at all is assumed present (9 hours worked,
    // no OT) rather than absent — only an explicit 'absent' entry counts as
    // an absence anywhere in this calculation.
    const isBlockDay = day => {
      const dateStr = fromStr.slice(0, 8) + String(day).padStart(2, '0');
      return byDate[dateStr] === 'absent';
    };

    let leadingRun = 0;
    for (let day = 1; day <= daysInMonth && isBlockDay(day); day++) leadingRun++;
    let trailingRun = 0;
    for (let day = daysInMonth; day >= 1 && isBlockDay(day); day--) trailingRun++;
    // A short month could have the same days counted in both runs — cap at daysInMonth.
    if (leadingRun + trailingRun > daysInMonth) trailingRun = daysInMonth - leadingRun;

    let longAbsenceExcludedDays = 0;
    if (leadingRun >= 8) longAbsenceExcludedDays += leadingRun;
    if (trailingRun >= 8) longAbsenceExcludedDays += trailingRun;

    // Exclude the block's days from totalDaysOff (they're "not employed that
    // stretch", not excess leave) — only subtract the portion of totalDaysOff
    // that block actually contributed.
    if (leadingRun >= 8) {
      for (let day = 1; day <= leadingRun; day++) {
        const dateStr = fromStr.slice(0, 8) + String(day).padStart(2, '0');
        totalDaysOff -= dayOffAmountByDate[dateStr] || 0;
      }
    }
    if (trailingRun >= 8) {
      for (let day = daysInMonth - trailingRun + 1; day <= daysInMonth; day++) {
        const dateStr = fromStr.slice(0, 8) + String(day).padStart(2, '0');
        totalDaysOff -= dayOffAmountByDate[dateStr] || 0;
      }
    }

    return {
      daysInMonth,
      totalDaysOff: Math.max(0, totalDaysOff),
      otHours,
      weekdayAbsentDates,
      weekendAbsentDates,
      weekdayHalfDayDates,
      weekendHalfDayDates,
      longAbsenceExcludedDays
    };
  },

  _getStaffAndProfile(staffId) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const staffSheet = ss.getSheetByName('Staff');
    if (!staffSheet) return null;

    const staffRows = staffSheet.getDataRange().getValues();
    let staffRow = null;
    for (let i = 1; i < staffRows.length; i++) {
      if (staffRows[i][0] === staffId) { staffRow = staffRows[i]; break; }
    }
    if (!staffRow) return null;

    const staffName    = staffRow[2];
    const salary       = Number(staffRow[9])  || 0;
    const allowances   = Number(staffRow[10]) || 0;
    const profileId    = staffRow[15] || '';
    const targetPeriod = staffRow[16] || 'monthly';
    const orgId        = staffRow[17] || '';

    let profile = {
      otHourlyRate: 0, l1Type: 'fixed', l1Value: 0, l2Type: 'fixed', l2Value: 0,
      xPct: 0, yPct: 0, zPct: 0, revenueBase: 'individual', eligibleOffs: 4,
      defaultProductIncentive: 0, flatIncentivePct: 0
    };
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
              zPct:         Number(profRows[i][11]) || 0,
              eligibleOffs: Number(profRows[i][15]) || 4,
              defaultProductIncentive: Number(profRows[i][16]) || 0,
              flatIncentivePct: Number(profRows[i][17]) || 0
            };
            break;
          }
        }
      }
    }

    return { staffName, salary, allowances, profileId, targetPeriod, orgId, profile };
  },

  // Revenue for the target-incentive slabs and the makeup incentive $ amount.
  // Each falls back to the existing bill-scan calculation only when its
  // manual override is blank. Product incentive is no longer computed here
  // at all (dropped) — see the schema note at the top of this file.
  _computeRevenueAndMakeup(staffId, period, profile, serviceValueOverride, makeupValueOverride, staffOrgId) {
    const needsBillScan = (serviceValueOverride === '' || serviceValueOverride === null || serviceValueOverride === undefined)
      || (makeupValueOverride === '' || makeupValueOverride === null || makeupValueOverride === undefined);

    let billScannedRevenue = 0;
    let billScannedMakeup  = 0;

    if (needsBillScan) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const [yr, mo] = period.split('-').map(Number);
      const fromStr  = period + '-01';
      const lastDay  = new Date(yr, mo, 0).getDate();
      const toStr    = period + '-' + String(lastDay).padStart(2, '0');

      const billsSheet = ss.getSheetByName('Bills');
      const periodBillIds = new Set();
      if (billsSheet) {
        const billRows = billsSheet.getDataRange().getValues();
        for (let i = 1; i < billRows.length; i++) {
          if (!billRows[i][0]) continue;
          if (String(billRows[i][16] || '').toLowerCase() === 'void') continue;
          // Scope the scan to the staff member's own org — an 'org' revenue
          // base means THEIR salon's total revenue, not every org's combined.
          const billOrg = String(billRows[i][19] || '');
          if (staffOrgId && billOrg && billOrg !== String(staffOrgId)) continue;
          const d = billRows[i][4];
          const dateStr = d instanceof Date ? Utils.businessDate(d) : String(d).slice(0, 10);
          if (dateStr >= fromStr && dateStr <= toStr) periodBillIds.add(billRows[i][0]);
        }
      }

      const sgSheet = ss.getSheetByName('ServiceGroups');
      const sgMap = {};
      if (sgSheet) {
        const sgRows = sgSheet.getDataRange().getValues();
        for (let i = 1; i < sgRows.length; i++) {
          if (!sgRows[i][0]) continue;
          const rawPct = sgRows[i][6];
          sgMap[sgRows[i][0]] = {
            incentiveMode:      sgRows[i][12] || 'tiered',
            // Blank means "fall back to the staff's Comp Plan flatIncentivePct".
            directIncentivePct: rawPct === '' || rawPct === null || rawPct === undefined ? '' : Number(rawPct)
          };
        }
      }

      const svcSheet = ss.getSheetByName('Services');
      const svcMap = {};
      if (svcSheet) {
        const svcRows = svcSheet.getDataRange().getValues();
        for (let i = 1; i < svcRows.length; i++) {
          if (!svcRows[i][0]) continue;
          svcMap[svcRows[i][0]] = svcRows[i][4]; // serviceGroupId at col 4
        }
      }

      const biSheet = ss.getSheetByName('BillItems');
      let serviceRevenue = 0;
      let orgServiceRevenue = 0;

      if (biSheet) {
        const biRows = biSheet.getDataRange().getValues();
        for (let i = 1; i < biRows.length; i++) {
          if (!biRows[i][0]) continue;
          const billId = biRows[i][1];
          if (!periodBillIds.has(billId)) continue;

          const type         = String(biRows[i][2] || '').toLowerCase();
          const refId        = biRows[i][3];
          const rowStaffId   = biRows[i][5];
          const lineSubtotal = Number(biRows[i][10]) || 0;
          if (type !== 'service') continue;

          const groupId = svcMap[refId];
          const sg = sgMap[groupId];
          if (!sg) continue;

          // Mutually exclusive per group: a group's revenue contributes to
          // EITHER the tiered target slabs OR a flat % bonus, never both,
          // and 'none' contributes to neither.
          if (sg.incentiveMode === 'tiered') {
            orgServiceRevenue += lineSubtotal; // always accumulate for org total
            if (rowStaffId === staffId) serviceRevenue += lineSubtotal;
          } else if (sg.incentiveMode === 'flat' && rowStaffId === staffId) {
            const pct = sg.directIncentivePct !== '' ? sg.directIncentivePct : profile.flatIncentivePct;
            if (pct > 0) billScannedMakeup += lineSubtotal * pct / 100;
          }
          // 'none' — no incentive contribution at all.
        }
      }

      billScannedRevenue = profile.revenueBase === 'org' ? orgServiceRevenue : serviceRevenue;
    }

    const revenue = (serviceValueOverride === '' || serviceValueOverride === null || serviceValueOverride === undefined)
      ? billScannedRevenue : Number(serviceValueOverride) || 0;
    // makeupValueOverride is a REVENUE figure, same as serviceValueOverride —
    // not a final dollar amount. It's multiplied by the applicable flat/
    // direct incentive %; a manual entry has no specific Service Group to
    // pull an override from, so it always uses the staff's Comp Plan
    // flatIncentivePct.
    const makeupIncentive = (makeupValueOverride === '' || makeupValueOverride === null || makeupValueOverride === undefined)
      ? billScannedMakeup
      : (Number(makeupValueOverride) || 0) * (profile.flatIncentivePct || 0) / 100;

    return { revenue, makeupIncentive };
  },

  // 3-tier target-incentive slab against the Comp Plan's L1/L2/X/Y/Z.
  _computeTargetIncentive(revenue, profile, baseSalary) {
    const L1 = profile.l1Type === 'salary_pct' ? baseSalary * profile.l1Value / 100 : profile.l1Value;
    const L2 = profile.l2Type === 'salary_pct' ? baseSalary * profile.l2Value / 100 : profile.l2Value;
    if (revenue < L1) return 0;
    if (revenue < L2) return L1 * profile.xPct / 100 + (revenue - L1) * profile.yPct / 100;
    return L1 * profile.xPct / 100 + (L2 - L1) * profile.yPct / 100 + (revenue - L2) * profile.zPct / 100;
  },

  // ── Full breakdown, from attendance-derived numbers + current override fields ──

  _buildBreakdown(inputs) {
    const {
      staffId, staffName, period, orgId, salary, allowances, profile, targetPeriod,
      payableDays, eligibleOffsInput, totalDaysOff, otHours,
      weekdayAbsentDates, weekendAbsentDates, weekdayHalfDayDates, weekendHalfDayDates,
      longAbsenceExcludedDays,
      serviceValue, productCount, tipsOverride, makeupValue, advanceDeducted,
      payUnusedLeaves, unusedLeavesReason,
      status, notes, payrollId, createdAt
    } = inputs;

    const daysInMonthForRatio = inputs.daysInMonth || payableDays || 30;
    const eligibleOffs = eligibleOffsInput !== '' && eligibleOffsInput !== null && eligibleOffsInput !== undefined
      ? Number(eligibleOffsInput) || 0
      : Math.floor((profile.eligibleOffs || 4) * payableDays / daysInMonthForRatio);

    const excessLeaves       = Math.max(0, totalDaysOff - eligibleOffs);
    const leaveDeduction     = payableDays > 0 ? excessLeaves * (salary / payableDays) : 0;
    const adjustedBaseSalary = salary - leaveDeduction;
    const otPay              = otHours * profile.otHourlyRate;

    let targetIncentive = 0;
    let serviceRevenue  = 0;
    let makeupIncentive = 0;

    if (targetPeriod === 'weekly') {
      // Unaffected — sums pre-approved WeeklyIncentive snapshot rows.
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const [yr, mo] = period.split('-').map(Number);
      const fromStr = period + '-01';
      const lastDay = new Date(yr, mo, 0).getDate();
      const toStr   = period + '-' + String(lastDay).padStart(2, '0');
      const wkiSheet = ss.getSheetByName('WeeklyIncentive');
      let directIncentive = 0;
      if (wkiSheet) {
        const wkiRows = wkiSheet.getDataRange().getValues();
        for (let i = 1; i < wkiRows.length; i++) {
          if (!wkiRows[i][0]) continue;
          if (wkiRows[i][1] !== staffId) continue;
          const ws = wkiRows[i][2] instanceof Date ? Utils.businessDate(wkiRows[i][2]) : String(wkiRows[i][2]).slice(0, 10);
          if (ws < fromStr || ws > toStr) continue;
          targetIncentive  += Number(wkiRows[i][5]) || 0;
          directIncentive  += Number(wkiRows[i][6]) || 0;
        }
      }
      makeupIncentive = directIncentive;
    } else {
      const rev = Payroll._computeRevenueAndMakeup(staffId, period, profile, serviceValue, makeupValue, orgId);
      serviceRevenue  = rev.revenue;
      makeupIncentive = rev.makeupIncentive;
      targetIncentive = Payroll._computeTargetIncentive(serviceRevenue, profile, salary);
    }

    // Product Count is a manual entry (Quick Entry) with no specific Product
    // Group to pull a per-unit rate from, so — same pattern as Make Up Value
    // using the Comp Plan's flatIncentivePct — it always uses the Comp
    // Plan's defaultProductIncentive rate.
    const productIncentive = (productCount === '' || productCount === null || productCount === undefined)
      ? 0 : (Number(productCount) || 0) * (profile.defaultProductIncentive || 0);
    const totalIncentive   = targetIncentive + makeupIncentive + productIncentive;
    const tips              = (tipsOverride === '' || tipsOverride === null || tipsOverride === undefined) ? 0 : Number(tipsOverride) || 0;
    const advDeducted       = Number(advanceDeducted) || 0;

    // "Pay for leaves not taken" — a manager attestation that the staff
    // member skipped eligible offs on instruction and should be compensated
    // for them. Each unused off pays one calendar day of base salary
    // (base ÷ calendar days of the month — deliberately NOT payableDays,
    // and deliberately excluding allowances).
    const paysUnused = payUnusedLeaves === true || payUnusedLeaves === 'true' || payUnusedLeaves === 'TRUE';
    const [byr, bmo] = String(period || '').split('-').map(Number);
    const calendarDays = (byr && bmo) ? new Date(byr, bmo, 0).getDate() : 30;
    const unusedOffs = Math.max(0, eligibleOffs - totalDaysOff);
    const unusedLeavePay = paysUnused && calendarDays > 0 ? unusedOffs * (salary / calendarDays) : 0;

    const netPay = adjustedBaseSalary + allowances + otPay + totalIncentive + tips + unusedLeavePay - advDeducted;

    return {
      payrollId: payrollId || '', staffId, staffName, period, orgId,
      baseSalary: salary, payableDays, eligibleOffs,
      totalDaysOff, excessLeaves, leaveDeduction, adjustedBaseSalary, allowances,
      otHours, otPay,
      serviceIncentive: serviceRevenue, productIncentive, makeupIncentive, targetIncentive,
      totalIncentive, advanceDeducted: advDeducted, netPay,
      status: status || 'draft', notes: notes || '', createdAt: createdAt || new Date().toISOString(),
      weekdayAbsentDates: (weekdayAbsentDates || []).join(','),
      weekendAbsentDates: (weekendAbsentDates || []).join(','),
      weekdayHalfDayDates: (weekdayHalfDayDates || []).join(','),
      weekendHalfDayDates: (weekendHalfDayDates || []).join(','),
      longAbsenceExcludedDays,
      serviceValue: serviceValue === '' || serviceValue === null || serviceValue === undefined ? '' : Number(serviceValue),
      productCount: productCount === '' || productCount === null || productCount === undefined ? '' : Number(productCount),
      tipsOverride: tipsOverride === '' || tipsOverride === null || tipsOverride === undefined ? '' : Number(tipsOverride),
      makeupValue:  makeupValue  === '' || makeupValue  === null || makeupValue  === undefined ? '' : Number(makeupValue),
      payUnusedLeaves: paysUnused,
      unusedLeavesReason: String(unusedLeavesReason || ''),
      unusedLeavePay
    };
  },

  _rowToBreakdown(row) {
    return {
      payrollId: row[0], staffId: row[1], staffName: row[2], period: this._normalizePeriod(row[3]),
      baseSalary: Number(row[4]) || 0, payableDays: Number(row[5]) || 0,
      eligibleOffs: Number(row[6]) || 0, totalDaysOff: Number(row[7]) || 0,
      excessLeaves: Number(row[8]) || 0, leaveDeduction: Number(row[9]) || 0,
      adjustedBaseSalary: Number(row[10]) || 0, allowances: Number(row[11]) || 0,
      otHours: Number(row[12]) || 0, otPay: Number(row[13]) || 0,
      serviceIncentive: Number(row[14]) || 0, productIncentive: Number(row[15]) || 0,
      makeupIncentive: Number(row[16]) || 0, targetIncentive: Number(row[17]) || 0,
      totalIncentive: Number(row[18]) || 0, advanceDeducted: Number(row[19]) || 0,
      netPay: Number(row[20]) || 0, status: row[21], notes: row[22],
      createdAt: row[23] instanceof Date ? row[23].toISOString() : String(row[23] || ''),
      orgId: row[24] || '',
      weekdayAbsentDates: this._normalizeDateListCell(row[25]),
      weekendAbsentDates: this._normalizeDateListCell(row[26]),
      longAbsenceExcludedDays: Number(row[27]) || 0,
      serviceValue: row[28] === '' || row[28] == null ? '' : Number(row[28]),
      productCount: row[29] === '' || row[29] == null ? '' : Number(row[29]),
      tipsOverride: row[30] === '' || row[30] == null ? '' : Number(row[30]),
      makeupValue:  row[31] === '' || row[31] == null ? '' : Number(row[31]),
      weekdayHalfDayDates: this._normalizeDateListCell(row[32]),
      weekendHalfDayDates: this._normalizeDateListCell(row[33]),
      payUnusedLeaves: row[34] === true || String(row[34]).toUpperCase() === 'TRUE',
      unusedLeavesReason: String(row[35] || ''),
      unusedLeavePay: Number(row[36]) || 0
    };
  },

  _breakdownToRowValues(b) {
    return [
      b.payrollId, b.staffId, b.staffName, b.period, b.baseSalary, b.payableDays,
      b.eligibleOffs, b.totalDaysOff, b.excessLeaves, b.leaveDeduction,
      b.adjustedBaseSalary, b.allowances, b.otHours, b.otPay,
      b.serviceIncentive, b.productIncentive, b.makeupIncentive, b.targetIncentive,
      b.totalIncentive, b.advanceDeducted, b.netPay, b.status, b.notes, b.createdAt,
      b.orgId, b.weekdayAbsentDates, b.weekendAbsentDates, b.longAbsenceExcludedDays,
      b.serviceValue, b.productCount, b.tipsOverride, b.makeupValue,
      b.weekdayHalfDayDates, b.weekendHalfDayDates,
      b.payUnusedLeaves, b.unusedLeavesReason, b.unusedLeavePay
    ];
  },

  _findRow(sheet, payrollId) {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === payrollId) return { index: i, row: rows[i] };
    }
    return null;
  },

  _findRowByStaffPeriod(sheet, staffId, period) {
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][1] === staffId && this._normalizePeriod(rows[i][3]) === period) return { index: i, row: rows[i] };
    }
    return null;
  },

  // ── Quick Entry integration ───────────────────────────────────────────────
  // Called after Attendance.saveAttendance succeeds for a staff+period.
  // Recomputes the attendance-derived fields fresh from current attendance
  // data. The four override fields (serviceValue, productCount,
  // tipsOverride, makeupValue) are also editable directly on the Quick
  // Entry screen — when present in data (even blank, to clear one), they
  // win; when omitted entirely, the existing row's value is preserved (or
  // blank on a brand-new row). advanceDeducted/status/notes are always
  // preserved here — those are Payroll-page-only fields.
  upsertFromAttendance(data) {
    const staffId = data.staffId;
    const period  = data.period; // 'YYYY-MM'
    if (!staffId || !period) return Utils.createResponse('error', 'staffId and period are required');

    const info = this._getStaffAndProfile(staffId);
    if (!info) return Utils.createResponse('error', 'Staff member not found');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Payroll');
    if (!sheet) return Utils.createResponse('error', 'Payroll sheet not found');

    const attDerived = this._computeAttendanceDerived(staffId, period);
    const existing = this._findRowByStaffPeriod(sheet, staffId, period);
    const existingBreakdown = existing ? this._rowToBreakdown(existing.row) : null;

    const payableDays = existingBreakdown && existingBreakdown.payableDays
      ? existingBreakdown.payableDays
      : (attDerived.daysInMonth - attDerived.longAbsenceExcludedDays);

    const breakdown = this._buildBreakdown({
      staffId, staffName: info.staffName, period, orgId: info.orgId,
      salary: info.salary, allowances: info.allowances, profile: info.profile,
      targetPeriod: info.targetPeriod,
      payableDays,
      eligibleOffsInput: existingBreakdown ? existingBreakdown.eligibleOffs : '',
      totalDaysOff: attDerived.totalDaysOff, otHours: attDerived.otHours,
      daysInMonth: attDerived.daysInMonth,
      weekdayAbsentDates: attDerived.weekdayAbsentDates,
      weekendAbsentDates: attDerived.weekendAbsentDates,
      weekdayHalfDayDates: attDerived.weekdayHalfDayDates,
      weekendHalfDayDates: attDerived.weekendHalfDayDates,
      longAbsenceExcludedDays: attDerived.longAbsenceExcludedDays,
      serviceValue: data.serviceValue !== undefined ? data.serviceValue : (existingBreakdown ? existingBreakdown.serviceValue : ''),
      productCount: data.productCount !== undefined ? data.productCount : (existingBreakdown ? existingBreakdown.productCount : ''),
      tipsOverride: data.tipsOverride !== undefined ? data.tipsOverride : (existingBreakdown ? existingBreakdown.tipsOverride : ''),
      makeupValue:  data.makeupValue  !== undefined ? data.makeupValue  : (existingBreakdown ? existingBreakdown.makeupValue  : ''),
      payUnusedLeaves:    data.payUnusedLeaves    !== undefined ? data.payUnusedLeaves    : (existingBreakdown ? existingBreakdown.payUnusedLeaves    : false),
      unusedLeavesReason: data.unusedLeavesReason !== undefined ? data.unusedLeavesReason : (existingBreakdown ? existingBreakdown.unusedLeavesReason : ''),
      advanceDeducted: existingBreakdown ? existingBreakdown.advanceDeducted : 0,
      status: existingBreakdown ? existingBreakdown.status : 'draft',
      notes:  existingBreakdown ? existingBreakdown.notes  : '',
      payrollId: existingBreakdown ? existingBreakdown.payrollId : ('PAY' + Date.now()),
      createdAt: existingBreakdown ? existingBreakdown.createdAt : new Date().toISOString()
    });

    if (existing) {
      sheet.getRange(existing.index + 1, 1, 1, 37).setValues([this._breakdownToRowValues(breakdown)]);
    } else {
      sheet.appendRow(this._breakdownToRowValues(breakdown));
    }

    // Nested under 'payroll' — the breakdown has its own status field
    // ('draft'/'paid'/…) which would otherwise overwrite the response's
    // status:'success' when spread at the top level, making every save
    // look like a failure to the client.
    return Utils.createResponse('success', 'Payroll updated from attendance', { payroll: breakdown });
  },

  // ── Payroll page reconcile ────────────────────────────────────────────────
  // Updates an EXISTING row's editable fields (never creates a new row —
  // the Payroll page only works on rows Quick Entry already created).
  updateRow(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payroll');
    if (!sheet) return Utils.createResponse('error', 'Payroll sheet not found');
    if (!data.payrollId) return Utils.createResponse('error', 'payrollId is required');

    const existing = this._findRow(sheet, data.payrollId);
    if (!existing) return Utils.createResponse('error', 'Payroll record not found');

    const current = this._rowToBreakdown(existing.row);

    // Same org-scope rule as Staff.update — the page permission alone isn't
    // enough, the target row must belong to the caller's org or a descendant.
    if (!Organizations.isWithinScope(data.orgId, current.orgId)) {
      return Utils.createResponse('error', 'You do not have access to that organization.');
    }

    // A paid record is final — only status (to void it) and notes may still
    // change. Numeric edits and advance-ledger adjustments are rejected so a
    // finalized payslip can't drift after the money has gone out.
    if (current.status === 'paid') {
      const changedKeys = ['payableDays', 'eligibleOffs', 'advanceDeducted', 'remainingBalance',
        'serviceValue', 'productCount', 'tipsOverride', 'makeupValue', 'longAbsenceExcludedDays']
        .filter(k => data[k] !== undefined && data[k] !== '' && Number(data[k]) !== Number(current[k] || 0));
      if (data.payUnusedLeaves !== undefined && !!data.payUnusedLeaves !== !!current.payUnusedLeaves) changedKeys.push('payUnusedLeaves');
      if (data.unusedLeavesReason !== undefined && String(data.unusedLeavesReason) !== String(current.unusedLeavesReason || '')) changedKeys.push('unusedLeavesReason');
      if (changedKeys.length) {
        return Utils.createResponse('error', 'This payroll record is paid and locked — only status and notes can change.');
      }
      if (data.status !== undefined) sheet.getRange(existing.index + 1, 22).setValue(data.status);
      if (data.notes  !== undefined) sheet.getRange(existing.index + 1, 23).setValue(data.notes);
      current.status = data.status !== undefined ? data.status : current.status;
      current.notes  = data.notes  !== undefined ? data.notes  : current.notes;
      return Utils.createResponse('success', 'Payroll record updated successfully', { payroll: current });
    }

    // Status flow is draft → review → approved → paid. Paid triggers the
    // advance-ledger reconciliation below, so it's only reachable from
    // approved — a draft/review record hasn't been signed off yet.
    if (data.status === 'paid' && current.status !== 'approved') {
      return Utils.createResponse('error', 'Only an approved payroll record can be marked paid.');
    }

    const info = this._getStaffAndProfile(current.staffId);
    if (!info) return Utils.createResponse('error', 'Staff member not found');

    const payableDays = data.payableDays !== undefined ? Number(data.payableDays) || 0 : current.payableDays;
    const longAbsenceExcludedDays = data.longAbsenceExcludedDays !== undefined
      ? Number(data.longAbsenceExcludedDays) || 0 : current.longAbsenceExcludedDays;

    const breakdown = this._buildBreakdown({
      staffId: current.staffId, staffName: current.staffName, period: current.period, orgId: current.orgId,
      // Fresh salary/allowances (like the profile) so a Staff Salary edit
      // takes effect on the next Calculate, not only on a Quick Entry re-save.
      salary: info.salary, allowances: info.allowances, profile: info.profile,
      targetPeriod: info.targetPeriod,
      payableDays,
      eligibleOffsInput: data.eligibleOffs !== undefined ? data.eligibleOffs : current.eligibleOffs,
      totalDaysOff: current.totalDaysOff, otHours: current.otHours,
      daysInMonth: payableDays + longAbsenceExcludedDays,
      weekdayAbsentDates: (current.weekdayAbsentDates || '').split(',').filter(Boolean),
      weekendAbsentDates: (current.weekendAbsentDates || '').split(',').filter(Boolean),
      weekdayHalfDayDates: (current.weekdayHalfDayDates || '').split(',').filter(Boolean),
      weekendHalfDayDates: (current.weekendHalfDayDates || '').split(',').filter(Boolean),
      longAbsenceExcludedDays,
      serviceValue: data.serviceValue !== undefined ? data.serviceValue : current.serviceValue,
      productCount: data.productCount !== undefined ? data.productCount : current.productCount,
      tipsOverride: data.tipsOverride !== undefined ? data.tipsOverride : current.tipsOverride,
      makeupValue:  data.makeupValue  !== undefined ? data.makeupValue  : current.makeupValue,
      payUnusedLeaves:    data.payUnusedLeaves    !== undefined ? data.payUnusedLeaves    : current.payUnusedLeaves,
      unusedLeavesReason: data.unusedLeavesReason !== undefined ? data.unusedLeavesReason : current.unusedLeavesReason,
      advanceDeducted: data.advanceDeducted !== undefined ? data.advanceDeducted : current.advanceDeducted,
      status: data.status !== undefined ? data.status : current.status,
      notes:  data.notes  !== undefined ? data.notes  : current.notes,
      payrollId: current.payrollId, createdAt: current.createdAt
    });

    sheet.getRange(existing.index + 1, 1, 1, 37).setValues([this._breakdownToRowValues(breakdown)]);

    // Remaining Balance is a Payroll-Review-only concept — it's never stored
    // on the Payroll row itself, only reflected into the StaffAdvance ledger
    // so it's the single source of truth. The ledger is reconciled ONLY when
    // the record is marked paid (money actually moved) — draft/review/
    // approved saves store advanceDeducted on the row for the Net Payable
    // figure but leave the ledger untouched. Re-fetches the LIVE balance
    // right before diffing so a repeat save is an idempotent no-op.
    if (data.status === 'paid' && data.remainingBalance !== undefined && data.remainingBalance !== '') {
      this._postAdvanceLedgerAdjustment(current.staffId, current.orgId, current.period, Number(data.remainingBalance) || 0);
    }

    // Nested under 'payroll' — see upsertFromAttendance for why.
    return Utils.createResponse('success', 'Payroll record updated successfully', { payroll: breakdown });
  },

  // Adjusts the StaffAdvance ledger so its outstanding balance becomes
  // targetRemainingBalance. Posts nothing if the ledger is already at that
  // value. A decrease is recorded as a 'repayment' (the normal case — some
  // or all of the outstanding advance was deducted this payroll cycle,
  // leaving the rest in the ledger for a future deduction); an increase is
  // recorded as an 'advance' (reversing an earlier over-repayment).
  _postAdvanceLedgerAdjustment(staffId, orgId, period, targetRemainingBalance) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('StaffAdvance');
    if (!sheet) return;

    const currentBalance = Attendance._getOutstandingBalanceRaw(staffId);
    const delta = currentBalance - targetRemainingBalance; // positive = repayment, negative = advance
    if (Math.abs(delta) < 0.005) return; // already matches — idempotent no-op

    const advanceId = 'ADV' + Date.now();
    const now = new Date().toISOString();
    const amount = Math.abs(delta);
    sheet.appendRow([
      // Utils.businessDate, not the raw ISO date — that's UTC, and an evening
      // save here would stamp the entry with tomorrow's/yesterday's date.
      advanceId, staffId, Utils.businessDate(), delta > 0 ? 'repayment' : 'advance',
      amount, 'Payroll deduction for ' + period, targetRemainingBalance, now,
      orgId || '', 'disbursed', amount, 'Payroll Deduction'
    ]);
  },

  // Lightweight lookup for Quick Entry — returns just the four manual
  // override fields (plus whether a row exists at all) for one staff+period,
  // never the full breakdown. Deliberately gated on staff:hr-quickentry
  // alone in Main.js (not staff:hr-payroll), so a Quick-Entry-only role can
  // see and re-enter these values without needing Payroll tab access.
  getOverrides(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payroll');
    if (!sheet) return Utils.createResponse('success', 'No payroll record found', { found: false });
    if (!data || !data.staffId || !data.period) {
      return Utils.createResponse('error', 'staffId and period are required');
    }

    const existing = this._findRowByStaffPeriod(sheet, data.staffId, data.period);
    if (!existing) return Utils.createResponse('success', 'No payroll record found', { found: false });

    const b = this._rowToBreakdown(existing.row);
    return Utils.createResponse('success', 'Payroll overrides retrieved', {
      found: true,
      serviceValue: b.serviceValue,
      makeupValue:  b.makeupValue,
      productCount: b.productCount,
      tipsOverride: b.tipsOverride,
      payUnusedLeaves: b.payUnusedLeaves,
      unusedLeavesReason: b.unusedLeavesReason
    });
  },

  // Bulk per-staff summary for one month, used by the Quick Entry grid.
  // Deliberately gated on staff:hr-quickentry alone (not staff:hr-payroll)
  // in Main.js — same rationale as getOverrides, just with the extra fields
  // (absence tallies, OT) the grid needs. Only returns rows that exist;
  // staff with no payroll record yet for this period simply aren't in the
  // result, and the frontend renders those rows blank.
  getSummaryForMonth(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payroll');
    if (!sheet) return Utils.createResponse('success', 'Payroll summary retrieved', { summary: [] });
    if (!data || !data.period) return Utils.createResponse('error', 'period is required');

    const period = data.period;
    const orgId = data.orgId || '';
    const includeChildren = !!data.includeChildren;
    const allowedOrgIds = orgId ? Organizations.scopeOrgIds(orgId, includeChildren) : null;

    const rows = sheet.getDataRange().getValues();
    const summary = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (this._normalizePeriod(rows[i][3]) !== period) continue;
      const rowOrg = rows[i][24] || '';
      if (allowedOrgIds && rowOrg && !allowedOrgIds.has(rowOrg)) continue;

      const b = this._rowToBreakdown(rows[i]);
      const splitCount = s => (s || '').split(',').filter(Boolean).length;
      // Quick Entry shows the actual day counts, not the 2x-weighted figure
      // used internally for totalDaysOff/payroll deduction purposes.
      const weekdayAbsence = splitCount(b.weekdayAbsentDates) + splitCount(b.weekdayHalfDayDates) * 0.5;
      const weekendAbsence = splitCount(b.weekendAbsentDates) + splitCount(b.weekendHalfDayDates) * 0.5;
      summary.push({
        payrollId: b.payrollId, staffId: b.staffId,
        weekdayAbsence, weekendAbsence, otHours: b.otHours,
        serviceValue: b.serviceValue, makeupValue: b.makeupValue,
        productCount: b.productCount, tipsOverride: b.tipsOverride
      });
    }

    return Utils.createResponse('success', 'Payroll summary retrieved', { summary });
  },

  getAll(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Payroll');
    if (!sheet) return Utils.createResponse('success', 'Payroll retrieved', { payroll: [] });

    const rows = sheet.getDataRange().getValues();
    const filterPeriod  = (data && data.period)  ? data.period  : null;
    const filterStaffId = (data && data.staffId) ? data.staffId : null;
    const orgId         = (data && data.orgId)   ? data.orgId   : '';
    const includeChildren = !!(data && data.includeChildren);
    const allowedOrgIds = orgId ? Organizations.scopeOrgIds(orgId, includeChildren) : null;
    const payroll = [];

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (filterStaffId && rows[i][1] !== filterStaffId) continue;
      if (filterPeriod  && this._normalizePeriod(rows[i][3]) !== filterPeriod) continue;
      const rowOrg = rows[i][24] || '';
      if (allowedOrgIds && rowOrg && !allowedOrgIds.has(rowOrg)) continue;

      payroll.push(this._rowToBreakdown(rows[i]));
    }

    return Utils.createResponse('success', 'Payroll retrieved', { payroll });
  }
};
