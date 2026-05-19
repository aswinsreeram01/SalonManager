const Appointments = {
  _cols: {
    appointmentId: 0, customerId: 1, customerName: 2, customerPhone: 3,
    staffId: 4, staffName: 5, serviceId: 6, serviceName: 7,
    startTime: 8, durationMins: 9, status: 10, notes: 11,
    billId: 12, createdAt: 13, createdBy: 14
  },

  _rowToObj(r) {
    return {
      appointmentId: r[0],
      customerId:    r[1],
      customerName:  r[2],
      customerPhone: r[3],
      staffId:       r[4],
      staffName:     r[5],
      serviceId:     r[6],
      serviceName:   r[7],
      startTime:     String(r[8]),
      durationMins:  Number(r[9]) || 60,
      status:        r[10],
      notes:         r[11] || '',
      billId:        r[12] || '',
      createdAt:     String(r[13]),
      createdBy:     r[14] || ''
    };
  },

  getByDate(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Appointments');
    if (!sheet) return Utils.createResponse('success', 'Appointments retrieved', { appointments: [] });

    const date = data.date; // expected 'YYYY-MM-DD'
    if (!date) return Utils.createResponse('error', 'date parameter required');

    const rows = sheet.getDataRange().getValues();
    const appointments = [];
    for (let i = 1; i < rows.length; i++) {
      const startTime = String(rows[i][8]);
      if (startTime.startsWith(date)) {
        appointments.push(this._rowToObj(rows[i]));
      }
    }
    appointments.sort((a, b) => a.startTime.localeCompare(b.startTime));
    return Utils.createResponse('success', 'Appointments retrieved', { appointments });
  },

  save(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Appointments');
    if (!sheet) return Utils.createResponse('error', 'Appointments sheet not found');

    const appointmentId = 'APPT' + Date.now();
    const createdAt = new Date().toISOString();

    sheet.appendRow([
      appointmentId,
      data.customerId    || '',
      data.customerName  || '',
      data.customerPhone || '',
      data.staffId       || '',
      data.staffName     || '',
      data.serviceId     || '',
      data.serviceName   || '',
      data.startTime     || '',
      Number(data.durationMins) || 60,
      data.status        || 'booked',
      data.notes         || '',
      '',
      createdAt,
      data.createdBy     || ''
    ]);

    return Utils.createResponse('success', 'Appointment booked successfully', { appointmentId });
  },

  update(data) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Appointments');
    if (!sheet) return Utils.createResponse('error', 'Appointments sheet not found');

    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] !== data.appointmentId) continue;

      const set = (col, val) => { if (val !== undefined) sheet.getRange(i + 1, col + 1).setValue(val); };
      set(1,  data.customerId);
      set(2,  data.customerName);
      set(3,  data.customerPhone);
      set(4,  data.staffId);
      set(5,  data.staffName);
      set(6,  data.serviceId);
      set(7,  data.serviceName);
      set(8,  data.startTime);
      set(9,  data.durationMins !== undefined ? Number(data.durationMins) : undefined);
      set(10, data.status);
      set(11, data.notes);
      set(12, data.billId);

      return Utils.createResponse('success', 'Appointment updated successfully');
    }
    return Utils.createResponse('error', 'Appointment not found');
  }
};
