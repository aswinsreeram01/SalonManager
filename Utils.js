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
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 8);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sessions');
    sheet.appendRow([token, userId, expiry, new Date()]);
    return token;
  },

  validateSession(token) {
    if (!token) return null;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sessions');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === token && new Date() <= new Date(data[i][2])) {
        return data[i][1]; // userId
      }
    }
    return null;
  },

  invalidateSession(token) {
    if (!token) return;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sessions');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === token) {
        sheet.deleteRow(i + 1);
        return;
      }
    }
  }
};