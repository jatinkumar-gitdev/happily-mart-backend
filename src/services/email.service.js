const ejs = require("ejs");
const path = require("path");
const transporter = require("../config/email");
const { generateInvoicePDF, numberToWords } = require("./pdf.service");

const sendOTPEmail = async (email, otp, name) => {
  try {
    const templatePath = path.join(__dirname, "../views/emails/otp.ejs");
    const html = await ejs.renderFile(templatePath, { name, otp });

    const mailOptions = {
      from: `"Happily Mart" <${
        process.env.EMAIL_USER || "noreply@Happily Mart.com"
      }>`,
      to: email,
      subject: "Verify Your Email - Happily Mart",
      html: html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[OTP] OTP sent to ${email}: ${otp}`);
    return true;
  } catch (error) {
    console.error("Error sending OTP email:", error);
    // In development, still return true if it's a connection error
    if (process.env.NODE_ENV !== "production" && error.code === "ESOCKET") {
      console.log(`[OTP] Development mode - OTP for ${email}: ${otp}`);
      return true;
    }
    return false;
  }
};

const sendPasswordResetEmail = async (email, resetToken, name) => {
  try {
    const resetUrl = `${
      process.env.FRONTEND_URL || "http://localhost:3001"
    }/reset-password?token=${resetToken}`;
    const templatePath = path.join(
      __dirname,
      "../views/emails/resetPassword.ejs"
    );
    const html = await ejs.renderFile(templatePath, { name, resetUrl });

    const mailOptions = {
      from: `"Happily Mart" <${
        process.env.EMAIL_USER || "noreply@Happily Mart.com"
      }>`,
      to: email,
      subject: "Reset Your Password - Happily Mart",
      html: html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[PASSWORD RESET] Reset link sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending password reset email:", error);
    if (process.env.NODE_ENV !== "production" && error.code === "ESOCKET") {
      console.log(
        `[PASSWORD RESET] Development mode - Reset token for ${email}: ${resetToken}`
      );
      return true;
    }
    return false;
  }
};

const sendVerificationEmail = async (email, name) => {
  try {
    const templatePath = path.join(
      __dirname,
      "../views/emails/verification.ejs"
    );
    const html = await ejs.renderFile(templatePath, { name });

    const mailOptions = {
      from: `"Happily Mart" <${
        process.env.EMAIL_USER || "noreply@Happily Mart.com"
      }>`,
      to: email,
      subject: "Email Verified - Happily Mart",
      html: html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[VERIFICATION] Verification email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending verification email:", error);
    if (process.env.NODE_ENV !== "production" && error.code === "ESOCKET") {
      console.log(
        `[VERIFICATION] Development mode - Verification email for ${email} (logged to console)`
      );
      return true;
    }
    return false;
  }
};

const sendReactivationEmail = async (email, reactivationToken, name) => {
  try {
    const reactivationUrl = `${
      process.env.FRONTEND_URL || "http://localhost:3001"
    }/reactivate-account?token=${reactivationToken}`;
    const templatePath = path.join(
      __dirname,
      "../views/emails/reactivation.ejs"
    );
    const html = await ejs.renderFile(templatePath, {
      name,
      reactivationUrl,
    });

    const mailOptions = {
      from: `"Happily Mart" <${
        process.env.EMAIL_USER || "noreply@Happily Mart.com"
      }>`,
      to: email,
      subject: "Reactivate Your Account - Happily Mart",
      html: html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[REACTIVATION] Reactivation link sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending reactivation email:", error);
    if (process.env.NODE_ENV !== "production" && error.code === "ESOCKET") {
      console.log(
        `[REACTIVATION] Development mode - Reactivation token for ${email}: ${reactivationToken}`
      );
      return true;
    }
    return false;
  }
};

const sendEmailChangeVerificationEmail = async (email, otp, name) => {
  try {
    const templatePath = path.join(
      __dirname,
      "../views/emails/emailChange.ejs"
    );
    const html = await ejs.renderFile(templatePath, { name, otp });

    const mailOptions = {
      from: `"Happily Mart" <${
        process.env.EMAIL_USER || "noreply@Happily Mart.com"
      }>`,
      to: email,
      subject: "Confirm Your New Email - Happily Mart",
      html,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[EMAIL CHANGE] Verification code sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending email change verification email:", error);
    if (process.env.NODE_ENV !== "production" && error.code === "ESOCKET") {
      console.log(
        `[EMAIL CHANGE] Development mode - Email change code for ${email}: ${otp}`
      );
      return true;
    }
    return false;
  }
};

const sendPaymentReceiptEmail = async (email, name, paymentDetails) => {
  try {
    // Generate invoice number
    const timestamp = Date.now().toString().slice(-10);
    const invoiceNumber = `INV-${new Date().getFullYear()}-${timestamp}`;

    // Parse amount for words conversion
    const totalAmount = parseFloat(
      paymentDetails.total.replace(/[^0-9.]/g, "")
    );
    const amountInWords = numberToWords(totalAmount);

    // Prepare invoice data for PDF
    const invoiceData = {
      invoiceNumber,
      invoiceDate: new Date().toLocaleDateString("en-GB"),
      paymentDate: paymentDetails.paymentDate,
      transactionId: paymentDetails.transactionId,
      customerName: name,
      customerEmail: email,
      customerPhone: paymentDetails.customerPhone || "",
      customerAddress: paymentDetails.customerAddress || "",
      planName: paymentDetails.planName,
      price: paymentDetails.price,
      gst: paymentDetails.gst,
      total: paymentDetails.total,
      amountInWords,
      currency: paymentDetails.currency || "INR",
    };

    // Generate PDF invoice
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // Render email template
    const templatePath = path.join(
      __dirname,
      "../views/emails/paymentReceipt.ejs"
    );
    const html = await ejs.renderFile(templatePath, {
      name,
      email,
      invoiceNumber,
      paymentDate: paymentDetails.paymentDate,
      transactionId: paymentDetails.transactionId,
      planName: paymentDetails.planName,
      price: paymentDetails.price,
      gst: paymentDetails.gst,
      total: paymentDetails.total,
    });

    // Email options with PDF attachment
    const mailOptions = {
      from: `"Happily Mart" <${
        process.env.EMAIL_USER || "noreply@happilymart.com"
      }>`,
      to: email,
      subject: `Payment Receipt - ${invoiceNumber} - Happily Mart`,
      html,
      attachments: [
        {
          filename: `Invoice_${invoiceNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    console.log(
      `[PAYMENT RECEIPT] Receipt with PDF invoice sent to ${email} - ${invoiceNumber}`
    );
    return true;
  } catch (error) {
    console.error("Error sending payment receipt email:", error);
    if (process.env.NODE_ENV !== "production" && error.code === "ESOCKET") {
      console.log(
        `[PAYMENT RECEIPT] Development mode - Receipt for ${email} (logged to console)`
      );
      return true;
    }
    return false;
  }
};

module.exports = {
  sendOTPEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendReactivationEmail,
  sendEmailChangeVerificationEmail,
  sendPaymentReceiptEmail,
};
