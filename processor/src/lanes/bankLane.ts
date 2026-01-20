import { LaneHandler, ProcessingContext, LaneResult } from '../types.js';
import { retryWithBackoff } from '../../../src/utils/common.js';
import { verifyMath } from '../../../src/utils/math.js';
import { PDFDocument } from 'pdf-lib';

export class BankStatementHandler implements LaneHandler {
    async process(ctx: ProcessingContext): Promise<LaneResult> {
        const tableUsed = 'statement_lines';
        const markdown = await ctx.generateMarkdown(ctx.tempPath);

        // 1. Standard Ledger Extraction
        const ledgerPrompt = ctx.promptConfig.prompts.bank_statement_math.template;
        console.log("   Extracting Bank Ledger & Verifying Math...");

        const resLedger = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: ledgerPrompt }] }]
        }));

        const extractedData = JSON.parse(resLedger.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

        // Run Math Verification
        if (extractedData.statement_lines) {
            const failedIndices = verifyMath(extractedData.statement_lines);
            const failureCount = failedIndices.length;
            if (failureCount > 0) console.warn(`   ⚠️ MATH AUDIT FAILED on ${failureCount} rows.`);

            const pageIndex = process.env.PAGE_INDEX ? parseInt(process.env.PAGE_INDEX) : 0;

            const rows = extractedData.statement_lines.map((line: any, index: number) => ({
                doc_id: ctx.docId,
                page_number: pageIndex,
                account_number: extractedData["Account Number"],
                date: line.date,
                description: line.description,
                amount: line.amount,
                balance: line.balance,
                is_math_verified: !failedIndices.includes(index),
                source: 'bank_statement'
            }));

            if (rows.length > 0) await ctx.supabase.from(tableUsed).insert(rows);
        }

        // 2. Check Image Detection & Extraction
        console.log("   Checking for Check Images...");
        const CHECK_PROMPT = `
### Forensic Analysis
**Sub-Category:** Bank Statement Check Images (Composite)

> Complex extraction linking scanned check images to statement line-item text for validation.

| Field Name | Data Type | Description | Structure Context |
| :--- | :--- | :--- | :--- |
| **Statement Verification Line** | String | The printed text immediately below the check image. | Page Layout / Anchor |
| **Payor Block** | Object | Name, Address, Phone of account holder. | Check Image: Top Left |
| **Date Written** | Date | Handwritten date. | Check Image: Top Right |
| **Check # (Image)** | Integer | Printed sequence number on the check paper. | Check Image: Top Right |
| **Payee Name** | String | Handwritten or Typed name of recipient. | Check Image: Center Left |
| **Courtesy Amount** | Currency | Numeric amount in the box. | Check Image: Center Right |
| **Legal Amount** | String | Amount written in words. | Check Image: Center Bottom |
| **MICR Line** | String | Machine-readable E-13B font characters. | Check Image: Bottom Edge |

Analyze the document page. If there are scanned check images, extract them according to the schema above.
If NO check images are found, return { "checks": [] }.

OUTPUT JSON:
{
  "checks": [
    {
      "Statement Verification Line": "string",
      "Payor Block": { "Name": "string", "Address": "string", "Phone": "string" },
      "Date Written": "YYYY-MM-DD",
      "Check # (Image)": 123,
      "Payee Name": "string",
      "Courtesy Amount": "currency string",
      "Legal Amount": "string",
      "MICR Line": "string"
    }
  ]
}`;

        const resChecks = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: CHECK_PROMPT }] }]
        }));

        const checkData = JSON.parse(resChecks.response.candidates?.[0]?.content?.parts?.[0]?.text || "{ \"checks\": [] }");

        if (checkData.checks && checkData.checks.length > 0) {
            console.log(`   Found ${checkData.checks.length} check images. Processing...`);

            // Save Check Data to DB
            await ctx.supabase.from('evidence_logs').insert({
                doc_id: ctx.docId,
                log_type: 'check_image_extraction',
                entities: checkData.checks,
                content: `Extracted ${checkData.checks.length} checks from page.`
            });
        }

        return {
            extractedData: { ...extractedData, ...checkData },
            markdown,
            tableUsed,
            elementsCaptured: ["Account Number", "Period", "Transactions", "Check Images"]
        };
    }
}