const fs = require('fs');

// ==========================================
// 1. DATA SCHEMA & MOCK DATA (From Image)
// ==========================================

/* 
   This object represents the target structure. 
   It couples the "Statement Verification Data" (proven) 
   with the "Image Extraction Data" (unproven/handwritten).
*/
const extractionResults = {
  meta: {
    document_type: "Bank Statement - Check Image Detail",
    page_number: 2,
    account_number: "1024797",
    scan_date: "2024-02-23",
    source_uri: "gs://legal-forensics-engine-archive/2024_02_23_19_53_43"
  },
  // The 'checks' array represents the Top-Left to Bottom-Right flow
  checks: [
    // --- ROW 1, LEFT (Check #9586) ---
    {
      id: "chk_9586",
      layout: { row: 1, column: "left" },
      // The printed line BELOW the check image (Ground Truth)
      statement_verification: {
        check_number: "9586",
        paid_date: "2007-12-18",
        amount: 50.00,
        raw_text: "Check #9586 Paid : 12/18/2007 $50.00"
      },
      // The analysis of the check image itself
      image_analysis: {
        payor: {
          name: "K. Grundy",
          address: "P.O. Box 297, Marion, MI 49665",
          phone_or_dl: null // Field present in schema, null if not found
        },
        transaction_details: {
          date_written: "2007-12-04",
          check_number_top_right: "9586",
          payee_handwritten: "VFW Auxiliary 6015",
          amount_numeric: 50.00,
          amount_legal_text: "Fifty and 00/100", // "no/100" interpreted
          memo: "Dues", // Handwriting analysis
          bank_info: "Chemical Bank West"
        },
        micr_line: {
          raw: "⑆072404948⑆ 0001024797⑈ 9586",
          routing: "072404948",
          account: "0001024797",
          sequence: "9586"
        },
        // Validation Logic: Does the handwritten amount match the statement amount?
        validation: {
          amount_match: true,
          micr_match: true
        }
      }
    },
    // --- ROW 1, RIGHT (Check #9588) ---
    {
      id: "chk_9588",
      layout: { row: 1, column: "right" },
      statement_verification: {
        check_number: "9588",
        paid_date: "2007-12-13",
        amount: 1000.00,
        raw_text: "Check #9588 Paid : 12/13/2007 $1000.00"
      },
      image_analysis: {
        payor: {
          name: "K. Grundy",
          address: "P.O. Box 297, Marion, MI 49665",
          phone_or_dl: null
        },
        transaction_details: {
          date_written: "2007-12-07", // "Dec 7, 07"
          check_number_top_right: "9588",
          payee_handwritten: "Judy Grandy",
          amount_numeric: 1000.00,
          amount_legal_text: "One Thousand & 00/100",
          memo: null,
          bank_info: "Chemical Bank West"
        },
        micr_line: {
          raw: "⑆072404948⑆ 0001024797⑈ 9588",
          routing: "072404948",
          account: "0001024797",
          sequence: "9588"
        },
        validation: {
          amount_match: true,
          micr_match: true
        }
      }
    },
    // --- ROW 2, LEFT (Check #9589) ---
    {
      id: "chk_9589",
      layout: { row: 2, column: "left" },
      statement_verification: {
        check_number: "9589",
        paid_date: "2007-12-13",
        amount: 20.00,
        raw_text: "Check #9589 Paid : 12/13/2007 $20.00"
      },
      image_analysis: {
        payor: {
          name: "K. Grundy",
          address: "P.O. Box 297, Marion, MI 49665"
        },
        transaction_details: {
          date_written: "2007-12-07",
          check_number_top_right: "9589",
          payee_handwritten: "Cadillac Surgical Care, PC",
          amount_numeric: 20.00,
          amount_legal_text: "Twenty & no/100",
          memo: "33666-00194", // Account number in memo
          bank_info: "Chemical Bank West"
        },
        micr_line: {
          raw: "⑆072404948⑆ 0001024797⑈ 9589",
          routing: "072404948",
          account: "0001024797",
          sequence: "9589"
        },
        validation: {
          amount_match: true,
          micr_match: true
        }
      }
    },
    // --- ROW 2, RIGHT (Check #9590) ---
    {
      id: "chk_9590",
      layout: { row: 2, column: "right" },
      statement_verification: {
        check_number: "9590",
        paid_date: "2007-12-19",
        amount: 43.50,
        raw_text: "Check #9590 Paid : 12/19/2007 $43.50"
      },
      image_analysis: {
        payor: {
          name: "K. Grundy",
          address: "P.O. Box 297, Marion, MI 49665"
        },
        transaction_details: {
          date_written: "2007-12-07",
          check_number_top_right: "9590",
          payee_handwritten: "Dr. Ben Kienke",
          amount_numeric: 43.50,
          amount_legal_text: "Forty Three & 50/100",
          memo: null,
          bank_info: "Chemical Bank West"
        },
        micr_line: {
          raw: "⑆072404948⑆ 0001024797⑈ 9590",
          routing: "072404948",
          account: "0001024797",
          sequence: "9590"
        },
        validation: {
          amount_match: true,
          micr_match: true
        }
      }
    }
  ]
};

// ==========================================
// 2. MARKDOWN GENERATOR (LAYOUT ACCURATE)
// ==========================================

function generateMarkdown(data) {
  let md = `# Bank Statement Image Analysis\n`;
  md += `**Page:** ${data.meta.page_number} | **Account:** ${data.meta.account_number} | **Date:** ${data.meta.scan_date}\n\n`;
  
  md += `The following table reconstructs the visual grid of the source image. Each cell represents a check image with its associated statement metadata below it.\n\n`;

  // Start the Grid Table
  md += `| Left Column (Image Scan) | Right Column (Image Scan) |\n`;
  md += `| :--- | :--- |\n`;

  // Process checks in pairs to form rows
  for (let i = 0; i < data.checks.length; i += 2) {
    const leftCheck = data.checks[i];
    const rightCheck = data.checks[i + 1]; // Might be undefined if odd number of checks

    const leftCell = formatCheckCell(leftCheck);
    const rightCell = rightCheck ? formatCheckCell(rightCheck) : "";

    md += `| ${leftCell} | ${rightCell} |\n`;
  }

  return md;
}

// Helper: Formats a single check object into a visual text block for the table cell
function formatCheckCell(chk) {
  if (!chk) return "";
  const img = chk.image_analysis;
  const ver = chk.statement_verification;

  // We use <br> for line breaks inside Markdown table cells
  return `**Check #${ver.check_number}** (ID: ${chk.id})<br>` +
         `-----------------------------------------<br>` +
         `**${img.payor.name}**<br>` +
         `${img.payor.address}<br><br>` +
         `Date: **${img.transaction_details.date_written}** &nbsp;&nbsp;&nbsp; No. **${img.transaction_details.check_number_top_right}**<br>` +
         `Pay to: **${img.transaction_details.payee_handwritten}**<br>` +
         `Amount: **$${img.transaction_details.amount_numeric.toFixed(2)}**<br>` +
         `*${img.transaction_details.amount_legal_text}*<br><br>` +
         `Bank: ${img.transaction_details.bank_info}<br>` +
         `Memo: ${img.transaction_details.memo || "N/A"}<br>` +
         `MICR: \`${img.micr_line.raw}\`<br>` +
         `-----------------------------------------<br>` +
         `> **Statement Record:** ${ver.raw_text}<br>` +
         `> *Validation Match:* ${img.validation.amount_match ? "✅" : "❌"}`;
}

// ==========================================
// 3. EXECUTION
// ==========================================

// 1. Write JSON
fs.writeFileSync('check_extraction_data.json', JSON.stringify(extractionResults, null, 2));
console.log("✅ JSON Data Structure written to 'check_extraction_data.json'");

// 2. Write Markdown
const markdownContent = generateMarkdown(extractionResults);
fs.writeFileSync('check_visual_layout.md', markdownContent);
console.log("✅ Visual Markdown Layout written to 'check_visual_layout.md'");

