import { LaneHandler, ProcessingContext, LaneResult } from '../types.js';
import { retryWithBackoff } from '../../../src/utils/common.js';

export class ExpenseLogHandler implements LaneHandler {
    async process(ctx: ProcessingContext): Promise<LaneResult> {
        const tableUsed = 'evidence_logs';

        // 1. Vision OCR to get raw handwriting text
        let ocrText = "";
        try {
            ocrText = await ctx.extractTextWithVision(ctx.fileBuffer);
        } catch (error: any) {
            console.error(`   ❌ Vision OCR Error: ${error.message}`);
        }

        if (!ocrText || ocrText.trim().length < 10) {
            console.warn("   ⚠️ Insufficient OCR text detected. Aborting extraction.");
            return {
                extractedData: { error: "Insufficient OCR text" },
                markdown: "> **Error:** Vision OCR failed to extract sufficient text from this page.",
                tableUsed,
                elementsCaptured: []
            };
        }

        // 2. Construct Prompt with the specific schema
        const schemaPrompt = `
You are a forensic document examiner. Analyze the following OCR text from a handwritten monthly expense log.
Structure the data into a JSON object based on the schema below.

### Personal Finance Logs
**Sub-Category:** Handwritten Monthly Expense Logs (Judy/Keith Format)
> Unstructured lined paper logs with specific forensic behaviors (dittos, margin notes, ink changes).

| Field Name | Data Type | Description | Structure Context |
| :--- | :--- | :--- | :--- |
| **Entity Name** | String | Top header name (e.g., 'Judy' or 'Keith'). | Page Header |
| **Reporting Period** | Date | Month and Year of the log. | Page Header |
| **Payee (Main)** | String | Primary recipient or description. | Column 1 |
| **Payee Modifier (Margin)** | String | Text written in the left margin acting as a prefix. | Left Margin |
| **Payment Method** | String | Auto Pay, Cash, or Check #. | Column 2 |
| **Amount** | Currency | Transaction value. | Column 5 |
| **Ditto Resolution** | Boolean | Indicates if value was derived from (") marks above. | Vertical Pattern Recognition |

OCR TEXT:
${ocrText}

OUTPUT FORMAT:
Return a JSON object with keys: "Entity Name", "Reporting Period", and "Transactions" (an array of objects with the column fields).
`;

        console.log("   Structuring Handwritten Expense Log...");
        const res = await retryWithBackoff(() => ctx.reasoningModel.generateContent({
            contents: [{ role: 'user', parts: [ctx.pdfPart, { text: schemaPrompt }] }]
        }));

        const extractedData = JSON.parse(res.response.candidates?.[0]?.content?.parts?.[0]?.text || "{}");

        // 3. Generate Markdown Table from the structured JSON
        let markdown = `## Handwritten Expense Log\n\n`;
        markdown += `**Entity:** ${extractedData["Entity Name"] || 'Unknown'}\n`;
        markdown += `**Period:** ${extractedData["Reporting Period"] || 'Unknown'}\n\n`;
        markdown += `| Payee | Method | Amount | Modifier | Ditto? |\n|---|---|---|---|---|\n`;

        if (Array.isArray(extractedData.Transactions)) {
            extractedData.Transactions.forEach((t: any) => {
                markdown += `| ${t['Payee (Main)']} | ${t['Payment Method']} | ${t['Amount']} | ${t['Payee Modifier (Margin)']} | ${t['Ditto Resolution']} |\n`;
            });
        }

        // 4. Save to DB
        await ctx.supabase.from(tableUsed).insert({
            doc_id: ctx.docId,
            log_type: 'expense_log',
            entities: extractedData.Transactions,
            content: `Entity: ${extractedData["Entity Name"]}, Period: ${extractedData["Reporting Period"]}`
        });

        return {
            extractedData,
            markdown,
            tableUsed,
            elementsCaptured: ["Entity Name", "Reporting Period", "Payee", "Amount", "Ditto Resolution"]
        };
    }
}