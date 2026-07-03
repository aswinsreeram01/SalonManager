const Auth = {
  login(data) {
    const usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    const lastRow = usersSheet.getLastRow();
    
    if (lastRow < 2) {
      return Utils.createResponse('error', 'No users found');
    }
    
    const usersData = usersSheet.getRange(2, 1, lastRow - 1, 9).getValues();
    
    for (let i = 0; i < usersData.length; i++) {
      const [userId, email, password, fullName, phone, whatsapp, orgId, roleId, status] = usersData[i];
      
      if (email === data.email && password === Utils.hashPassword(data.password)) {
        if (status && status.toString().toLowerCase() === 'active') {
          const permissions = Permissions.getByRole({ roleId: roleId });
          const sessionToken = Utils.createSession(userId, orgId, roleId);

          return Utils.createResponse('success', 'Login successful', {
            sessionToken: sessionToken,
            userId: userId,
            email: email,
            fullName: fullName,
            phone: phone,
            whatsapp: whatsapp,
            orgId: orgId,
            roleId: roleId,
            permissions: permissions.permissions || []
          });
        } else {
          return Utils.createResponse('error', 'Account is inactive');
        }
      }
    }
    
    return Utils.createResponse('error', 'Invalid email or password');
  },
  
  requestPasswordReset(data) {
    const usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    const lastRow = usersSheet.getLastRow();
    
    if (lastRow < 2) {
      return Utils.createResponse('error', 'Email not found');
    }
    
    const usersData = usersSheet.getRange(2, 1, lastRow - 1, 9).getValues();
    let userFound = false;
    
    for (let i = 0; i < usersData.length; i++) {
      const [userId, email, password, fullName] = usersData[i];
      
      if (email === data.email) {
        userFound = true;
        
        // Generate token
        const token = Utilities.getUuid();
        const expiry = new Date();
        expiry.setHours(expiry.getHours() + 1); // 1 hour expiry
        
        // Store token
        const tokensSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PasswordResetTokens');
        tokensSheet.appendRow([token, email, expiry, false]);
        
        // Send email
        const resetLink = `https://aswinsreeram01.github.io/SalonManager/reset-password.html?token=${token}`;
        const subject = 'Password Reset Request - Salon Manager';
        const body = `Hi ${fullName},\n\nYou requested to reset your password.\n\nClick here to reset: ${resetLink}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, please ignore this email.\n\nRegards,\nSalon Manager Team`;
        
        try {
          MailApp.sendEmail(email, subject, body);
          return Utils.createResponse('success', 'Password reset email sent. Please check your inbox.');
        } catch (error) {
          return Utils.createResponse('error', 'Failed to send email: ' + error.toString());
        }
      }
    }
    
    if (!userFound) {
      return Utils.createResponse('error', 'Email not found');
    }
  },
  
  // Plain-object token check shared by validateResetToken and resetPassword.
  // (Do not wrap this in Utils.createResponse — that returns a ContentService
  // TextOutput which has no .status property, so callers comparing .status
  // would always take the failure branch. See resetPassword below.)
  _checkToken(token) {
    const tokensSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PasswordResetTokens');
    const tokensData = tokensSheet.getDataRange().getValues();

    for (let i = 1; i < tokensData.length; i++) {
      const [rowToken, email, expiry, used] = tokensData[i];

      if (rowToken === token) {
        if (used) {
          return { valid: false, error: 'This reset link has already been used' };
        }

        const expiryDate = new Date(expiry);
        if (new Date() > expiryDate) {
          return { valid: false, error: 'This reset link has expired' };
        }

        return { valid: true, email: email, rowIndex: i };
      }
    }

    return { valid: false, error: 'Invalid reset link' };
  },

  validateResetToken(data) {
    const result = this._checkToken(data.token);
    if (!result.valid) {
      return Utils.createResponse('error', result.error);
    }
    return Utils.createResponse('success', 'Token valid', { email: result.email });
  },

  resetPassword(data) {
    // Validate token first
    const result = this._checkToken(data.token);
    if (!result.valid) {
      return Utils.createResponse('error', result.error);
    }

    const email = result.email;

    // Update password
    const usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
    const usersData = usersSheet.getDataRange().getValues();

    for (let i = 1; i < usersData.length; i++) {
      if (usersData[i][1] === email) {
        usersSheet.getRange(i + 1, 3).setValue(Utils.hashPassword(data.newPassword));

        // Mark token as used (single-use)
        const tokensSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PasswordResetTokens');
        tokensSheet.getRange(result.rowIndex + 1, 4).setValue(true);

        return Utils.createResponse('success', 'Password updated successfully');
      }
    }

    return Utils.createResponse('error', 'User not found');
  },

  logout(data) {
    Utils.invalidateSession(data.sessionToken);
    return Utils.createResponse('success', 'Logged out successfully');
  }
};