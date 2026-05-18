// Backend utilities
const Utils = {
  createResponse(status, message, data = {}) {
    return ContentService.createTextOutput(JSON.stringify({
      status: status,
      message: message,
      ...data
    })).setMimeType(ContentService.MimeType.JSON);
  },

  hashPassword(password) {
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
    return digest.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
  },

  createSession(userId) {
    const token = Utilities.getUuid();
    const expiry = Date.now() + (8 * 60 * 60 * 1000); // 8 hours in ms
    CacheService.getScriptCache().put(
      token,
      JSON.stringify({ userId, expiry }),
      28800 // 8 hours in seconds
    );
    return token;
  },

  validateSession(token) {
    if (!token) return null;
    const cached = CacheService.getScriptCache().get(token);
    if (!cached) return null;
    const session = JSON.parse(cached);
    if (Date.now() > session.expiry) {
      CacheService.getScriptCache().remove(token);
      return null;
    }
    return session.userId;
  },

  invalidateSession(token) {
    if (!token) return;
    CacheService.getScriptCache().remove(token);
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