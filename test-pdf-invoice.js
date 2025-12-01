/**
 * Test script for PDF invoice generation
 * Run: node test-pdf-invoice.js
 */

const fs = require("fs");
const path = require("path");
const { generateInvoicePDF, numberToWords } = require("./src/services/pdf.service");

async function testPDFGeneration() {
  try {
    console.log("🧪 Testing PDF Invoice Generation...\n");

    // Sample invoice data
    const invoiceData = {
      invoiceNumber: "INV-2025-1234567890",
      invoiceDate: "27/11/2025",
      paymentDate: "27/11/2025",
      transactionId: "pay_ABC123XYZ456DEF789",
      customerName: "John Doe",
      customerEmail: "john.doe@example.com",
      customerPhone: "+91 9876543210",
      customerAddress: "123 Main Street, Mumbai, Maharashtra, India",
      planName: "Intermediate Plan",
      price: "₹799",
      gst: "₹144",
      total: "₹943",
      amountInWords: numberToWords(943),
      currency: "INR",
    };

    console.log("📄 Invoice Details:");
    console.log("   Invoice Number:", invoiceData.invoiceNumber);
    console.log("   Customer:", invoiceData.customerName);
    console.log("   Plan:", invoiceData.planName);
    console.log("   Total Amount:", invoiceData.total);
    console.log("   Amount in Words:", invoiceData.amountInWords);
    console.log("");

    console.log("⏳ Generating PDF...");
    const pdfBuffer = await generateInvoicePDF(invoiceData);

    // Save PDF to test directory
    const testDir = path.join(__dirname, "test-output");
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir);
    }

    const pdfPath = path.join(testDir, `${invoiceData.invoiceNumber}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);

    console.log("✅ PDF generated successfully!");
    console.log("📁 Saved to:", pdfPath);
    console.log("📊 File size:", (pdfBuffer.length / 1024).toFixed(2), "KB");
    console.log("");
    console.log("🎉 Test completed successfully!");
    console.log("📝 Please open the PDF file to verify the invoice layout.");

  } catch (error) {
    console.error("❌ Error during PDF generation:", error);
    process.exit(1);
  }
}

// Run test
testPDFGeneration();
