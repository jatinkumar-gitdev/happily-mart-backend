const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

/**
 * Generate professional PDF invoice for subscription payment
 * @param {Object} invoiceData - Invoice data containing payment details
 * @returns {Promise<Buffer>} PDF buffer
 */
const generateInvoicePDF = async (invoiceData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 35,
        info: {
          Title: `Invoice - ${invoiceData.invoiceNumber}`,
          Author: "Happily Mart",
          Subject: "Subscription Payment Receipt",
          Keywords: "invoice, receipt, payment",
        },
      });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Colors
      const primaryColor = "#0ea5e9";
      const secondaryColor = "#333333";
      const lightGray = "#f0f0f0";
      const darkGray = "#666666";

      // Page width and positions
      const pageWidth = doc.page.width;
      const leftMargin = 50;
      const rightMargin = pageWidth - 50;
      const contentWidth = rightMargin - leftMargin;

      let yPosition = 40;

      // ============= HEADER SECTION =============
      // Company Logo (using text as placeholder - can be replaced with actual logo)
      doc
        .fontSize(24)
        .fillColor(primaryColor)
        .font("Helvetica-Bold")
        .text("HAPPILY MART", leftMargin, yPosition);

      yPosition += 28;

      // Company tagline
      doc
        .fontSize(9)
        .fillColor(darkGray)
        .font("Helvetica")
        .text("Your Trusted Subscription Platform", leftMargin, yPosition);

      // Invoice title on the right
      doc
        .fontSize(22)
        .fillColor(secondaryColor)
        .font("Helvetica-Bold")
        .text("INVOICE", rightMargin - 100, 40, {
          align: "right",
          width: 100,
        });

      yPosition += 20;

      // Horizontal line
      doc
        .strokeColor(primaryColor)
        .lineWidth(2)
        .moveTo(leftMargin, yPosition)
        .lineTo(rightMargin, yPosition)
        .stroke();

      yPosition += 20;

      // ============= INVOICE INFO SECTION =============
      // Left column - Company details
      doc
        .fontSize(9)
        .fillColor(secondaryColor)
        .font("Helvetica-Bold")
        .text("From:", leftMargin, yPosition);

      yPosition += 12;

      doc
        .fontSize(8)   
        .font("Helvetica")
        .fillColor(darkGray)
        .text("Happily Mart Private Limited", leftMargin, yPosition);
      yPosition += 11;
      doc.text(" A-99, 2nd Floor, DDA Shed, Block A, Okhla Phase II", leftMargin, yPosition);
      yPosition += 11;
      doc.text("Okhla Industrial Estate, New Delhi, Delhi 110020, India", leftMargin, yPosition);
      yPosition += 11;
      doc.text("GSTIN: 27ABCDE1234F1Z5", leftMargin, yPosition);
      yPosition += 11;
      doc.text("CIN: U74999MH2023PTC123456", leftMargin, yPosition);

      // Right column - Invoice details
      const rightColumnX = pageWidth / 2 + 50;
      let rightYPosition = yPosition - 67;

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(secondaryColor)
        .text("Invoice Details:", rightColumnX, rightYPosition);

      rightYPosition += 12;

      // Invoice number
      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(darkGray)
        .text("Invoice No:", rightColumnX, rightYPosition);
      doc
        .font("Helvetica-Bold")
        .fillColor(secondaryColor)
        .text(invoiceData.invoiceNumber, rightColumnX + 70, rightYPosition, {
          width: 150,
        });

      rightYPosition += 11;

      // Invoice date
      doc
        .font("Helvetica")
        .fillColor(darkGray)
        .text("Invoice Date:", rightColumnX, rightYPosition);
      doc
        .font("Helvetica-Bold")
        .fillColor(secondaryColor)
        .text(invoiceData.invoiceDate, rightColumnX + 70, rightYPosition);

      rightYPosition += 11;

      // Transaction ID
      doc
        .font("Helvetica")
        .fillColor(darkGray)
        .text("Transaction ID:", rightColumnX, rightYPosition);
      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor(secondaryColor)
        .text(invoiceData.transactionId, rightColumnX + 70, rightYPosition, {
          width: 150,
        });

      yPosition += 18;

      // ============= BILL TO SECTION =============
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(secondaryColor)
        .text("Bill To:", leftMargin, yPosition);

      yPosition += 12;

      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(darkGray)
        .text(invoiceData.customerName, leftMargin, yPosition);
      yPosition += 11;
      doc.text(invoiceData.customerEmail, leftMargin, yPosition);
      yPosition += 11;
      if (invoiceData.customerPhone) {
        doc.text(invoiceData.customerPhone, leftMargin, yPosition);
        yPosition += 11;
      }
      if (invoiceData.customerAddress) {
        doc.text(invoiceData.customerAddress, leftMargin, yPosition, {
          width: contentWidth / 2,
        });
        yPosition += 22;
      } else {
        yPosition += 11;
      }

      yPosition += 8;

      // ============= ITEMS TABLE =============
      // Table header background
      doc
        .rect(leftMargin, yPosition, contentWidth, 20)
        .fillColor(primaryColor)
        .fill();

      // Table headers
      doc
        .fontSize(9)
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .text("Purchased", leftMargin + 10, yPosition + 6, { width: 250 })
        .text("HSN/SAC", leftMargin + 270, yPosition + 6, { width: 80 })
        .text("Amount", rightMargin - 100, yPosition + 6, {
          width: 90,
          align: "right",
        });

      yPosition += 20;

      // Table row - Subscription plan
      doc
        .fillColor(lightGray)
        .rect(leftMargin, yPosition, contentWidth, 24)
        .fill();

      doc
        .fontSize(9)
        .fillColor(secondaryColor)
        .font("Helvetica-Bold")
        .text(invoiceData.planName, leftMargin + 10, yPosition + 6, {
          width: 250,
        });

      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(darkGray)
        .text("998314", leftMargin + 270, yPosition + 6, { width: 80 });

      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(secondaryColor)
        .text(invoiceData.price, rightMargin - 100, yPosition + 6, {
          width: 90,
          align: "right",
        });

      yPosition += 24;

      // Subtotal
      yPosition += 12;
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(darkGray)
        .text("Subtotal:", rightMargin - 200, yPosition)
        .text(invoiceData.price, rightMargin - 100, yPosition, {
          width: 90,
          align: "right",
        });

      yPosition += 16;

      // GST
      doc
        .text("GST (18%):", rightMargin - 200, yPosition)
        .text(invoiceData.gst, rightMargin - 100, yPosition, {
          width: 90,
          align: "right",
        });

      yPosition += 15;

      // Total line
      doc
        .strokeColor(primaryColor)
        .lineWidth(2)
        .moveTo(rightMargin - 200, yPosition)
        .lineTo(rightMargin, yPosition)
        .stroke();

      yPosition += 8;

      // Total amount
      doc
        .fontSize(11)
        .font("Helvetica-Bold")
        .fillColor(primaryColor)
        .text("Total Amount:", rightMargin - 200, yPosition)
        .text(invoiceData.total, rightMargin - 100, yPosition, {
          width: 90,
          align: "right",
        });

      yPosition += 15;

      doc
        .strokeColor(primaryColor)
        .lineWidth(2)
        .moveTo(rightMargin - 200, yPosition)
        .lineTo(rightMargin, yPosition)
        .stroke();

      yPosition += 20;

      // Amount in words
      doc
        .fontSize(8)
        .font("Helvetica-Bold")
        .fillColor(secondaryColor)
        .text("Amount in Words:", leftMargin, yPosition);

      yPosition += 11;

      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(darkGray)
        .text(invoiceData.amountInWords, leftMargin, yPosition, {
          width: contentWidth,
        });

      yPosition += 25;

      // ============= PAYMENT INFORMATION =============
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(secondaryColor)
        .text("Payment Information:", leftMargin, yPosition);

      yPosition += 11;

      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(darkGray)
        .text("Payment Method: Online Payment (Razorpay) | Status: Completed | Date: " + invoiceData.paymentDate, leftMargin, yPosition, {
          width: contentWidth,
        });

      // ============= TERMS & CONDITIONS =============
      yPosition += 20;

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(secondaryColor)
        .text("Terms & Conditions:", leftMargin, yPosition);

      yPosition += 11;

      doc
        .fontSize(7)
        .font("Helvetica")
        .fillColor(darkGray)
        .text(
          " 1. Computer-generated invoice, no signature required. \n 2. Non-refundable except per policy. \n 3. Services activated immediately. \n 4. Retain for records. \n 5. Queries: support@happilymart.com",
          leftMargin,
          yPosition,
          { width: contentWidth }
        );

      yPosition += 20;

      // ============= FOOTER SECTION =============
      // Position footer dynamically based on content
      yPosition += 200;

      // Company stamp/seal (circular design with text)
      const stampX = leftMargin + 60;
      const stampY = yPosition + 25;
      const stampRadius = 28;

      // Outer circle
      doc
        .circle(stampX, stampY, stampRadius)
        .lineWidth(1.5)
        .strokeColor(primaryColor)
        .stroke();

      // Inner circle
      doc
        .circle(stampX, stampY, stampRadius - 4)
        .lineWidth(0.8)
        .strokeColor(primaryColor)
        .stroke();

      // Stamp text
      doc
        .fontSize(6)
        .fillColor(primaryColor)
        .font("Helvetica-Bold")
        .text("HAPPILY MART", stampX - 25, stampY - 16, {
          width: 50,
          align: "center",
        });

      doc
        .fontSize(5)
        .fillColor(darkGray)
        .font("Helvetica")
        .text("PRIVATE LIMITED", stampX - 25, stampY - 8, {
          width: 50,
          align: "center",
        });

      doc
        .fontSize(6)
        .fillColor(primaryColor)
        .font("Helvetica-Bold")
        .text("AUTHORIZED", stampX - 25, stampY + 4, {
          width: 50,
          align: "center",
        });

      doc
        .fontSize(5)
        .fillColor(darkGray)
        .font("Helvetica")
        .text("SIGNATORY", stampX - 25, stampY + 12, {
          width: 50,
          align: "center",
        });

      // Authorized signature section
      const signatureX = rightMargin - 130;
      doc
        .fontSize(8)
        .fillColor(darkGray)
        .font("Helvetica")
        .text("Authorized Signature", signatureX, yPosition + 38);

      doc
        .strokeColor(darkGray)
        .lineWidth(0.8)
        .moveTo(signatureX, yPosition + 36)
        .lineTo(signatureX + 100, yPosition + 36)
        .stroke();

      // Final footer line
      yPosition += 60;

      doc
        .strokeColor(primaryColor)
        .lineWidth(1)
        .moveTo(leftMargin, yPosition)
        .lineTo(rightMargin, yPosition)
        .stroke();

      doc
        .fontSize(7)
        .fillColor(darkGray)
        .font("Helvetica")
        .text(
          "This is a system-generated invoice | support@happilymart.com | +91-1800-123-4567",
          leftMargin,
          yPosition + 8,
          {
            width: contentWidth,
            align: "center",
          }
        );

      doc
        .fontSize(6)
        .text(
          "Happily Mart Private Limited | www.happilymart.com",
          leftMargin,
          yPosition + 18,
          {
            width: contentWidth,
            align: "center",
          }
        );

      // Finalize PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Convert number to words (Indian format)
 */
const numberToWords = (num) => {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const teens = [
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];

  if (num === 0) return "Zero";

  const numStr = Math.floor(num).toString();
  const decimals = Math.round((num - Math.floor(num)) * 100);

  let words = "";

  // Convert integer part
  if (numStr.length > 3) {
    const thousands = parseInt(numStr.slice(0, -3));
    words += convertHundreds(thousands, ones, tens, teens) + " Thousand ";
  }

  const hundreds = parseInt(numStr.slice(-3));
  words += convertHundreds(hundreds, ones, tens, teens);

  // Add decimal part
  if (decimals > 0) {
    words += " and " + convertHundreds(decimals, ones, tens, teens) + " Paise";
  }

  return words.trim() + " Only";
};

const convertHundreds = (num, ones, tens, teens) => {
  let result = "";

  if (num >= 100) {
    result += ones[Math.floor(num / 100)] + " Hundred ";
    num %= 100;
  }

  if (num >= 10 && num <= 19) {
    result += teens[num - 10] + " ";
  } else {
    if (num >= 20) {
      result += tens[Math.floor(num / 10)] + " ";
      num %= 10;
    }
    if (num > 0) {
      result += ones[num] + " ";
    }
  }

  return result.trim();
};

module.exports = {
  generateInvoicePDF,
  numberToWords,
};
