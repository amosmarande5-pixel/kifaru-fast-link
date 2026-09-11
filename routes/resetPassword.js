const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');

// Request password reset
router.post('/request', async (req, res) => {
  console.log('📧 Reset password request received for:', req.body.email);
  
  try {
    const { email } = req.body;
    if (!email) {
      console.log('❌ No email provided');
      return res.status(400).json({ error: 'Email is required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      console.log('ℹ️ User not found:', email);
      // Don't reveal if email exists
      return res.json({ message: 'If that email is registered, you will receive reset instructions.' });
    }

    console.log('✅ User found, generating token...');

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    console.log('🔑 Token generated and saved');

    // Send email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const resetUrl = `http://localhost:${process.env.PORT || 3000}/reset-password.html?token=${resetToken}`;

    console.log('📤 Sending email to:', email);
    console.log('🔗 Reset URL:', resetUrl);

    await transporter.sendMail({
      from: `"Kifaru Fast Link" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ff7a3d;">Kifaru Fast Link</h2>
          <p>You requested a password reset. Click the link below to set a new password:</p>
          <a href="${resetUrl}" style="display: inline-block; background: #ff7a3d; color: #0d0f10; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
          <p style="margin-top: 20px; color: #666; font-size: 14px;">This link expires in 1 hour.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request this, ignore this email.</p>
        </div>
      `
    });

    console.log('✅ Email sent successfully');

    res.json({ message: 'If that email is registered, you will receive reset instructions.' });
  } catch (err) {
    console.error('❌ Reset request error:', err.message);
    console.error('Full error:', err);
    res.status(500).json({ error: 'Server error. Try again later.' });
  }
});

// Reset password with token
router.post('/reset', async (req, res) => {
  console.log('🔑 Password reset with token received');
  
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required.' });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token.' });
    }

    const bcrypt = require('bcryptjs');
    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: 'Password reset successful. You can now log in.' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Server error. Try again later.' });
  }
});

module.exports = router;
