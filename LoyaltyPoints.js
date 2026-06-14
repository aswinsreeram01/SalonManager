// LoyaltyPoints.js — Loyalty programme engine
//
// PointsLedger sheet columns (0-based):
// ledgerId(0), customerPhone(1), customerName(2), billId(3),
// earnedDate(4), expiryDate(5), type(6: earn|redeem), points(7),
// balanceAfter(8), note(9), orgId(10)
//
// Customers sheet additions (0-based):
// pointsBalance(5), statusPoints(6), tier(7)

const LoyaltyPoints = {

  // ── Config ───────────────────────────────────────────────────────────────────

  _defaultConfig() {
    return {
      enabled: false,
      pointsName: 'Points',
      baseEarnRate: 10,
      tiers: [
        { name: 'Tier 1', threshold: 0,    multiplier: 1.00 },
        { name: 'Tier 2', threshold: 500,  multiplier: 1.25 },
        { name: 'Tier 3', threshold: 2000, multiplier: 1.50 },
        { name: 'Tier 4', threshold: 5000, multiplier: 1.75 }
      ],
      happyHourMultiplier: 2.0,
      happyHourActive: false,
      happyHourSchedules: [],
      redemptionRate: 100,
      redemptionValue: 10,
      minRedemption: 100,
      expiryMonths: 12
    };
  },

  _loadConfig() {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('OrgSettings');
    if (!sheet) return this._defaultConfig();
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === 'loyalty') {
        try {
          const parsed = JSON.parse(rows[i][1]);
          return Object.assign({}, this._defaultConfig(), parsed);
        } catch(e) { break; }
      }
    }
    return this._defaultConfig();
  },

  getConfig() {
    return Utils.createResponse('success', 'Loyalty config retrieved', {
      loyalty: this._loadConfig()
    });
  },

  updateConfig(data) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('OrgSettings');
    if (!sheet) return Utils.createResponse('error', 'OrgSettings sheet not found');

    const cfg = Object.assign({}, this._defaultConfig(), data.loyalty || {});
    const configStr = JSON.stringify(cfg);
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === 'loyalty') {
        sheet.getRange(i + 1, 2).setValue(configStr);
        return Utils.createResponse('success', 'Loyalty config saved');
      }
    }
    sheet.appendRow(['loyalty', configStr]);
    return Utils.createResponse('success', 'Loyalty config saved');
  },

  toggleHappyHour(data) {
    const cfg = this._loadConfig();
    cfg.happyHourActive = !!data.active;
    return this.updateConfig({ loyalty: cfg });
  },

  // ── Happy Hour ────────────────────────────────────────────────────────────────

  _isHappyHour(cfg) {
    if (cfg.happyHourActive) return true;
    const schedules = cfg.happyHourSchedules || [];
    const now = new Date();
    const dayMap = ['sun','mon','tue','wed','thu','fri','sat'];
    const todayDay = dayMap[now.getDay()];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    for (const sch of schedules) {
      if (!sch.days || !sch.days.includes(todayDay)) continue;
      if (sch.effectiveFrom && new Date(sch.effectiveFrom + 'T00:00:00') > now) continue;
      if (sch.effectiveUntil && new Date(sch.effectiveUntil + 'T23:59:59') < now) continue;
      const [sh, sm] = String(sch.startTime || '00:00').split(':').map(Number);
      const [eh, em] = String(sch.endTime   || '23:59').split(':').map(Number);
      if (nowMinutes >= (sh * 60 + sm) && nowMinutes <= (eh * 60 + em)) return true;
    }
    return false;
  },

  // ── Tier helpers ──────────────────────────────────────────────────────────────

  _qualifiedTierIndex(statusPoints, tiers) {
    const sorted = tiers.slice().sort((a, b) => a.threshold - b.threshold);
    let idx = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (statusPoints >= sorted[i].threshold) idx = i;
    }
    return idx;
  },

  // ── Customer lookup helpers ───────────────────────────────────────────────────

  _findCustomerRow(custRows, phone) {
    const normPhone = String(phone || '').replace(/\D/g, '');
    for (let i = 1; i < custRows.length; i++) {
      if (String(custRows[i][2] || '').replace(/\D/g, '') === normPhone) return i;
    }
    return -1;
  },

  // ── Public: get loyalty info for a customer ───────────────────────────────────

  getCustomerLoyalty(data) {
    const phone = String(data.phone || '').replace(/\D/g, '');
    if (!phone) return Utils.createResponse('error', 'Phone required');

    const cfg = this._loadConfig();
    if (!cfg.enabled) return Utils.createResponse('success', 'Loyalty data retrieved', { loyalty: null });

    const custSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    if (!custSheet) return Utils.createResponse('success', 'Loyalty data retrieved', { loyalty: null });

    const custRows = custSheet.getDataRange().getValues();
    const idx = this._findCustomerRow(custRows, phone);
    if (idx < 0) return Utils.createResponse('success', 'Loyalty data retrieved', { loyalty: null });

    const tiers        = (cfg.tiers || []).slice().sort((a, b) => a.threshold - b.threshold);
    const pointsBal    = Number(custRows[idx][5]) || 0;
    const statusPoints = Number(custRows[idx][6]) || 0;
    const tierName     = custRows[idx][7] || (tiers[0] ? tiers[0].name : 'Tier 1');
    const tierIdx      = tiers.findIndex(t => t.name === tierName);
    const nextTier     = tierIdx >= 0 && tierIdx < tiers.length - 1 ? tiers[tierIdx + 1] : null;
    const tierMult     = tierIdx >= 0 ? (Number(tiers[tierIdx].multiplier) || 1) : 1;

    const currentTier = tiers[tierIdx] || tiers[0] || {};
    return Utils.createResponse('success', 'Loyalty data retrieved', {
      loyalty: {
        pointsName:       cfg.pointsName || 'Points',
        tier:             tierName,
        tierIndex:        tierIdx,
        tierColor:        currentTier.color || '',
        tierMult,
        tiers:            tiers,
        pointsBalance:    pointsBal,
        statusPoints,
        currentThreshold: currentTier.threshold || 0,
        nextTier:         nextTier ? nextTier.name : null,
        nextThreshold:    nextTier ? nextTier.threshold : null,
        nextTierColor:    nextTier ? (nextTier.color || '') : null,
        isHappyHour:      this._isHappyHour(cfg),
        hhMultiplier:     cfg.happyHourMultiplier || 2,
        baseEarnRate:     cfg.baseEarnRate || 10,
        redemptionRate:   cfg.redemptionRate || 100,
        redemptionValue:  cfg.redemptionValue || 10,
        minRedemption:    cfg.minRedemption || 100
      }
    });
  },

  // ── Public: get ledger for a customer ─────────────────────────────────────────

  getLedger(data) {
    const phone = String(data.phone || '').replace(/\D/g, '');
    const ledgerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PointsLedger');
    if (!ledgerSheet) return Utils.createResponse('success', 'Ledger retrieved', { entries: [] });

    const rows = ledgerSheet.getDataRange().getValues();
    const entries = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (String(rows[i][1] || '').replace(/\D/g, '') !== phone) continue;
      entries.push({
        ledgerId:   rows[i][0],
        billId:     rows[i][3] || '',
        earnedDate: String(rows[i][4]),
        expiryDate: String(rows[i][5]),
        type:       rows[i][6],
        points:     Number(rows[i][7]),
        balance:    Number(rows[i][8]),
        note:       rows[i][9] || ''
      });
    }
    entries.sort((a, b) => new Date(b.earnedDate) - new Date(a.earnedDate));
    return Utils.createResponse('success', 'Ledger retrieved', { entries });
  },

  // ── Called from Bills.save() after bill is persisted ─────────────────────────

  processAfterBill(billId, customerPhone, customerName, pointsToEarn, redeemPoints, orgId) {
    const cfg = this._loadConfig();
    if (!cfg.enabled) return;

    const custSheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    const ledgerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PointsLedger');
    if (!custSheet || !ledgerSheet) return;

    const custRows  = custSheet.getDataRange().getValues();
    const custIdx   = this._findCustomerRow(custRows, customerPhone);
    if (custIdx < 0) return;

    let balance = Number(custRows[custIdx][5]) || 0;
    const now   = new Date();

    // 1. Redemption first (deduct before earning so balance can't go negative from timing)
    const redeem = Number(redeemPoints) || 0;
    if (redeem > 0 && balance >= redeem) {
      balance -= redeem;
      ledgerSheet.appendRow([
        'LPR' + now.getTime() + Math.random().toString(36).substr(2, 4),
        customerPhone, customerName || '', billId,
        now.toISOString(), '', 'redeem',
        -redeem, balance,
        'Redeemed on bill ' + billId, orgId || ''
      ]);
      custSheet.getRange(custIdx + 1, 6).setValue(balance);
    }

    // 2. Earn points
    const earn = Math.floor(Number(pointsToEarn) || 0);
    if (earn > 0) {
      const expiryDate = new Date(now);
      expiryDate.setMonth(expiryDate.getMonth() + (Number(cfg.expiryMonths) || 12));
      balance += earn;
      ledgerSheet.appendRow([
        'LPE' + now.getTime() + Math.random().toString(36).substr(2, 4),
        customerPhone, customerName || '', billId,
        now.toISOString(), expiryDate.toISOString(), 'earn',
        earn, balance,
        'Earned on bill ' + billId, orgId || ''
      ]);
      custSheet.getRange(custIdx + 1, 6).setValue(balance);
    }

    // 3. Recalculate statusPoints and tier
    if (earn > 0 || redeem > 0) {
      this._recalcStatus(custIdx, custSheet, custRows[custIdx], cfg, ledgerSheet);
    }
  },

  _recalcStatus(custIdx, custSheet, custRow, cfg, ledgerSheet) {
    const phone           = String(custRow[2] || '').replace(/\D/g, '');
    const now             = new Date();
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - (Number(cfg.expiryMonths) || 12));

    const ledgerRows  = ledgerSheet.getDataRange().getValues();
    let statusPoints = 0;
    for (let i = 1; i < ledgerRows.length; i++) {
      if (ledgerRows[i][6] !== 'earn') continue;
      if (String(ledgerRows[i][1] || '').replace(/\D/g, '') !== phone) continue;
      const earnedDate = new Date(ledgerRows[i][4]);
      const expiryDate = new Date(ledgerRows[i][5]);
      if (earnedDate < twelveMonthsAgo) continue;
      if (expiryDate < now) continue;
      statusPoints += Number(ledgerRows[i][7]) || 0;
    }

    const tiers  = (cfg.tiers || []).slice().sort((a, b) => a.threshold - b.threshold);
    const qualifiedIdx = this._qualifiedTierIndex(statusPoints, tiers);

    const currentTierName = custRow[7] || (tiers[0] ? tiers[0].name : '');
    const currentTierIdx  = tiers.findIndex(t => t.name === currentTierName);
    const minAllowedIdx   = Math.max(0, currentTierIdx - 1);
    const newTierIdx      = Math.max(qualifiedIdx, minAllowedIdx);
    const newTier         = tiers[newTierIdx] ? tiers[newTierIdx].name : (tiers[0] ? tiers[0].name : '');

    custSheet.getRange(custIdx + 1, 7).setValue(statusPoints);
    custSheet.getRange(custIdx + 1, 8).setValue(newTier);
  }
};
