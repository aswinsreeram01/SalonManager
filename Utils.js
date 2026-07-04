// Backend utilities
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours, all session types (admin + staff)

const Utils = {
  createResponse(status, message, data = {}) {
    return ContentService.createTextOutput(JSON.stringify({
      status: status,
      message: message,
      ...data
    })).setMimeType(ContentService.MimeType.JSON);
  },

  // Canonical customer phone identity: E.164 with a +91 (India) default.
  // Used everywhere a customer phone is stored or matched (Customers, Bills,
  // LoyaltyPoints) so the same person always resolves to the same key
  // regardless of how the number was typed in. Idempotent — normalizing an
  // already-canonical number returns it unchanged, and normalizing an old
  // plain-digits legacy value produces the same result a fresh canonical
  // lookup would, so no data migration is required.
  normalizePhone(phone) {
    if (!phone) return '';
    const raw = String(phone).trim();
    if (raw.startsWith('+')) return '+' + raw.slice(1).replace(/\D/g, '');
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1); // strip trunk 0
    if (digits.length === 12 && digits.startsWith('91')) return '+' + digits;
    if (digits.length === 10) return '+91' + digits;
    return digits ? '+' + digits : ''; // unexpected length — best effort, still stable/idempotent
  },

  // ── Overtime calculation (shared by Attendance and HRApprovals) ──────────
  // Was previously duplicated with a hardcoded 9h threshold in both places;
  // now a single implementation. Threshold is per-staff-member, sourced from
  // their assigned Incentive Profile (IncentiveProfiles.buildOTThresholdMap)
  // — it can differ from person to person, not one company-wide value.
  // No break-time deduction — Shifts.breakMins is intentionally not used.
  _timeStrToMinutes(timeStr) {
    const t = String(timeStr || '');
    const parts = t.split(':');
    if (parts.length < 2) return 0;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  },

  // thresholdHours: look up via IncentiveProfiles.buildOTThresholdMap(orgId)
  // once per request/batch and pass the per-staffId value in — avoids
  // re-reading the Staff/IncentiveProfiles sheets per attendance row.
  computeHoursAndOT(clockIn, clockOut, thresholdHours) {
    if (!clockIn || !clockOut) return { hoursWorked: 0, otHours: 0 };
    const workedMins  = this._timeStrToMinutes(clockOut) - this._timeStrToMinutes(clockIn);
    const hoursWorked = Math.max(0, workedMins / 60);
    const threshold   = Number(thresholdHours) || 9;
    const otHours     = Math.max(0, hoursWorked - threshold);
    return { hoursWorked: Math.round(hoursWorked * 100) / 100, otHours: Math.round(otHours * 100) / 100 };
  },

  // ── Timezone ───────────────────────────────────────────────────────────
  // Single source of truth for "what calendar day is it" across the app.
  // Defaults to the script project's timezone (Asia/Kolkata, see
  // appsscript.json); can be overridden without a redeploy via an
  // OrgSettings row with key 'timezone' (any IANA name, e.g. 'Asia/Kolkata').
  getTimezone() {
    const override = OrgSettings._getRaw().timezone;
    return override || Session.getScriptTimeZone();
  },

  // Returns the 'yyyy-MM-dd' calendar date for `date` (defaults to now) in
  // the configured timezone — NOT UTC. Replaces the old
  // date.toISOString().slice(0,10) pattern, which silently assigns a bill,
  // attendance record, etc. to the wrong calendar day near midnight in any
  // timezone ahead of UTC (which India always is).
  businessDate(date) {
    return Utilities.formatDate(date || new Date(), this.getTimezone(), 'yyyy-MM-dd');
  },

  hashPassword(password) {
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
    return digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  },

  // ── Stateless signed sessions ────────────────────────────────────────────
  // Sessions are no longer stored server-side (CacheService entries could be
  // evicted early and were hard-capped at 6h regardless of the TTL requested).
  // Instead the token itself carries the claims plus an HMAC-SHA256 signature,
  // so any node can validate a token without shared storage. Trade-off (by
  // design): a token cannot be revoked before it expires; logout is
  // client-side only (the browser discards the token).
  _getSessionSecret() {
    const props = PropertiesService.getScriptProperties();
    let secret = props.getProperty('SESSION_SECRET');
    if (secret) return secret;

    // Lazy-init on first ever use; lock to avoid two concurrent requests
    // minting different secrets (which would invalidate whichever token
    // was signed with the one that loses the race).
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      secret = props.getProperty('SESSION_SECRET');
      if (!secret) {
        secret = Utilities.getUuid() + Utilities.getUuid();
        props.setProperty('SESSION_SECRET', secret);
      }
    } finally {
      lock.releaseLock();
    }
    return secret;
  },

  _signPayload(payloadB64) {
    const secret = this._getSessionSecret();
    const sigBytes = Utilities.computeHmacSha256Signature(payloadB64, secret);
    return Utilities.base64EncodeWebSafe(sigBytes);
  },

  _encodeToken(claims) {
    const payloadB64 = Utilities.base64EncodeWebSafe(JSON.stringify(claims));
    const sig = this._signPayload(payloadB64);
    return payloadB64 + '.' + sig;
  },

  // Verifies the signature and returns the parsed claims, or null if the
  // token is missing, malformed, tampered with, or unparsable.
  _decodeToken(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sig] = parts;
    if (this._signPayload(payloadB64) !== sig) return null;
    try {
      const json = Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString();
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  },

  createSession(userId, orgId, roleId) {
    return this._encodeToken({ t: 'admin', uid: userId, org: orgId || '', role: roleId || '', exp: Date.now() + SESSION_TTL_MS });
  },

  validateSession(token) {
    const claims = this._decodeToken(token);
    if (!claims || claims.t !== 'admin') return null;
    if (Date.now() > claims.exp) return null;
    return { userId: claims.uid, orgId: claims.org || '', roleId: claims.role || '' };
  },

  invalidateSession(token) {
    // No-op by design: tokens are stateless and cannot be revoked before
    // they expire. The client is responsible for discarding the token.
  },

  // ── Staff portal sessions (prefixed 'sp_') ─────────────────────────────────
  createStaffSession(staffId, orgId) {
    return 'sp_' + this._encodeToken({ t: 'staff', sid: staffId, org: orgId || '', exp: Date.now() + SESSION_TTL_MS });
  },

  validateStaffSession(token) {
    if (!token || !String(token).startsWith('sp_')) return null;
    const claims = this._decodeToken(token.slice(3));
    if (!claims || claims.t !== 'staff') return null;
    if (Date.now() > claims.exp) return null;
    return { staffId: claims.sid, orgId: claims.org || '' };
  },

  getCached(key) {
    try {
      const val = CacheService.getScriptCache().get('d_' + key);
      return val ? JSON.parse(val) : null;
    } catch(e) { return null; }
  },

  setCached(key, data, ttlSecs) {
    try {
      CacheService.getScriptCache().put('d_' + key, JSON.stringify(data), ttlSecs || 300);
    } catch(e) {}
  },

  clearCached(key) {
    try {
      CacheService.getScriptCache().remove('d_' + key);
    } catch(e) {}
  }
};