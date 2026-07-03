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
    const normPhone = Utils.normalizePhone(phone);
    for (let i = 1; i < custRows.length; i++) {
      if (Utils.normalizePhone(custRows[i][2]) === normPhone) return i;
    }
    return -1;
  },

  // ── Public: get loyalty info for a customer ───────────────────────────────────

  getCustomerLoyalty(data) {
    const phone = Utils.normalizePhone(data.phone);
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
    const phone = Utils.normalizePhone(data.phone);
    const ledgerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PointsLedger');
    if (!ledgerSheet) return Utils.createResponse('success', 'Ledger retrieved', { entries: [] });

    const rows = ledgerSheet.getDataRange().getValues();
    const entries = [];
    for (let i = 1; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      if (Utils.normalizePhone(rows[i][1]) !== phone) continue;
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

  // ── Server-authoritative earn/redeem calculation for a bill ───────────────────
  // Bills.save() calls this instead of trusting the client's pointsToEarn/
  // redeemPoints values for money math. Mirrors the client-side preview in
  // js/billing.js (_calcPointsToEarn) but is the actual source of truth.
  // `items` must already have server-computed lineSubtotal per line.
  calcForBill(items, customerPhone, requestedRedeemPoints) {
    const out = { enabled: false, pointsToEarn: 0, redeemPointsApplied: 0, redemptionValue: 0 };
    const cfg = this._loadConfig();
    out.enabled = !!cfg.enabled;
    if (!cfg.enabled) return out;

    const phone = Utils.normalizePhone(customerPhone);
    if (!phone) return out;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const custSheet = ss.getSheetByName('Customers');
    if (!custSheet) return out;
    const custRows = custSheet.getDataRange().getValues();
    const custIdx = this._findCustomerRow(custRows, phone);
    if (custIdx < 0) return out;

    const balance = Number(custRows[custIdx][5]) || 0;

    // Redemption — cap at actual balance regardless of what was requested.
    const requested = Math.max(0, Math.floor(Number(requestedRedeemPoints) || 0));
    out.redeemPointsApplied = Math.min(requested, balance);
    const rate = Number(cfg.redemptionRate) || 100;
    const val  = Number(cfg.redemptionValue) || 10;
    out.redemptionValue = Math.floor(out.redeemPointsApplied / rate) * val;

    // Earning
    const tiers    = (cfg.tiers || []).slice().sort((a, b) => a.threshold - b.threshold);
    const tierName = custRows[custIdx][7] || (tiers[0] ? tiers[0].name : '');
    const tierIdx  = tiers.findIndex(t => t.name === tierName);
    const tierMult = tierIdx >= 0 ? (Number(tiers[tierIdx].multiplier) || 1) : 1;
    const hhMult   = this._isHappyHour(cfg) ? (Number(cfg.happyHourMultiplier) || 2) : 1;

    const eligible = this._eligibleSpend(ss, items);
    out.pointsToEarn = Math.floor(eligible / 100) * (Number(cfg.baseEarnRate) || 10) * tierMult * hhMult;

    return out;
  },

  // Sums lineSubtotal for items whose service/product group has pointsEligible set.
  _eligibleSpend(ss, items) {
    const sgSheet   = ss.getSheetByName('ServiceGroups');
    const svcSheet  = ss.getSheetByName('Services');
    const pgSheet   = ss.getSheetByName('ProductGroups');
    const prodSheet = ss.getSheetByName('Products');

    const sgEligible = {}, svcGroupOf = {}, pgEligible = {}, prodGroupOf = {};
    if (sgSheet) {
      const r = sgSheet.getDataRange().getValues();
      for (let i = 1; i < r.length; i++) if (r[i][0]) sgEligible[r[i][0]] = r[i][10] === true || r[i][10] === 'TRUE';
    }
    if (svcSheet) {
      const r = svcSheet.getDataRange().getValues();
      for (let i = 1; i < r.length; i++) if (r[i][0]) svcGroupOf[r[i][0]] = r[i][4];
    }
    if (pgSheet) {
      const r = pgSheet.getDataRange().getValues();
      for (let i = 1; i < r.length; i++) if (r[i][0]) pgEligible[r[i][0]] = r[i][8] === true || r[i][8] === 'TRUE';
    }
    if (prodSheet) {
      const r = prodSheet.getDataRange().getValues();
      for (let i = 1; i < r.length; i++) if (r[i][0]) prodGroupOf[r[i][0]] = r[i][14];
    }

    let eligible = 0;
    items.forEach(item => {
      if (item.type === 'service' && item.itemId && sgEligible[svcGroupOf[item.itemId]]) {
        eligible += Number(item.lineSubtotal) || 0;
      } else if (item.type === 'product' && item.itemId && pgEligible[prodGroupOf[item.itemId]]) {
        eligible += Number(item.lineSubtotal) || 0;
      }
    });
    return eligible;
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
    const phone           = Utils.normalizePhone(custRow[2]);
    const now             = new Date();
    const twelveMonthsAgo = new Date(now);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - (Number(cfg.expiryMonths) || 12));

    const ledgerRows  = ledgerSheet.getDataRange().getValues();
    let statusPoints = 0;
    for (let i = 1; i < ledgerRows.length; i++) {
      if (ledgerRows[i][6] !== 'earn') continue;
      if (Utils.normalizePhone(ledgerRows[i][1]) !== phone) continue;
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
  },

  // ── Called from Bills.voidBill() ──────────────────────────────────────────────
  // Reverses any earn/redeem ledger entries tied to this bill: negates the
  // earn and refunds the redeem. Allows the balance to go temporarily
  // negative — the customer may have already spent points earned on this
  // bill elsewhere, and that's an accepted trade-off of voiding after the
  // fact rather than blocking the void.
  //
  // The earn reversal is backdated to the ORIGINAL entry's earnedDate/
  // expiryDate rather than "now". _recalcStatus only sums entries within a
  // rolling 12-month window — if the reversal were dated "now" it would
  // outlive the original once the original ages out of the window (the
  // original stops counting while the negative offset keeps counting),
  // silently over-deducting status points months later. Sharing the same
  // window means both entries always age out together and permanently net
  // to zero.
  reverseForBill(billId, orgId) {
    const cfg = this._loadConfig();
    if (!cfg.enabled) return;

    const custSheet   = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    const ledgerSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PointsLedger');
    if (!custSheet || !ledgerSheet) return;

    const ledgerRows = ledgerSheet.getDataRange().getValues();
    let earnEntry = null, redeemEntry = null;
    for (let i = 1; i < ledgerRows.length; i++) {
      if (ledgerRows[i][3] !== billId) continue;
      if (ledgerRows[i][6] === 'earn' && !earnEntry) {
        earnEntry = {
          phone: ledgerRows[i][1], name: ledgerRows[i][2],
          points: Number(ledgerRows[i][7]) || 0,
          earnedDate: ledgerRows[i][4], expiryDate: ledgerRows[i][5]
        };
      }
      if (ledgerRows[i][6] === 'redeem' && !redeemEntry) {
        redeemEntry = { phone: ledgerRows[i][1], name: ledgerRows[i][2], points: Number(ledgerRows[i][7]) || 0 };
      }
    }
    if (!earnEntry && !redeemEntry) return; // nothing recorded for this bill (e.g. no phone at save time)

    const phone = (earnEntry || redeemEntry).phone;
    const name  = (earnEntry || redeemEntry).name;
    const custRows = custSheet.getDataRange().getValues();
    const custIdx  = this._findCustomerRow(custRows, phone);
    if (custIdx < 0) return;

    let balance = Number(custRows[custIdx][5]) || 0;
    const now = new Date();

    if (earnEntry && earnEntry.points > 0) {
      balance -= earnEntry.points;
      ledgerSheet.appendRow([
        'LPV' + now.getTime() + Math.random().toString(36).substr(2, 4),
        phone, name || '', billId,
        earnEntry.earnedDate, earnEntry.expiryDate, 'earn',
        -earnEntry.points, balance,
        'Reversed — bill ' + billId + ' voided', orgId || ''
      ]);
    }

    if (redeemEntry && redeemEntry.points < 0) {
      const refund = Math.abs(redeemEntry.points);
      balance += refund;
      ledgerSheet.appendRow([
        'LPV' + now.getTime() + Math.random().toString(36).substr(2, 4),
        phone, name || '', billId,
        now.toISOString(), '', 'redeem',
        refund, balance,
        'Refunded — bill ' + billId + ' voided', orgId || ''
      ]);
    }

    custSheet.getRange(custIdx + 1, 6).setValue(balance);
    this._recalcStatus(custIdx, custSheet, custRows[custIdx], cfg, ledgerSheet);
  }
};
