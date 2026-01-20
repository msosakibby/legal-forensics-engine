import { SummaryStrategy } from '../types.js';

export class ExpenseLogSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let totalAmount = 0;
        let transactionCount = 0;
        let entities = new Set<string>();
        let periods = new Set<string>();

        pages.forEach(p => {
            const d = p.extracted_data;
            if (d?.["Entity Name"]) entities.add(d["Entity Name"]);
            if (d?.["Reporting Period"]) periods.add(d["Reporting Period"]);

            if (Array.isArray(d?.Transactions)) {
                transactionCount += d.Transactions.length;
                d.Transactions.forEach((t: any) => {
                    const val = parseFloat(String(t.Amount).replace(/[^0-9.-]+/g, ""));
                    if (!isNaN(val)) totalAmount += val;
                });
            }
        });

        highlights += `## 📓 Handwritten Expense Log Summary\n`;
        if (entities.size > 0) highlights += `- **Entity:** ${Array.from(entities).join(', ')}\n`;
        if (periods.size > 0) highlights += `- **Period:** ${Array.from(periods).join(', ')}\n`;
        highlights += `- **Total Transactions:** ${transactionCount}\n`;
        highlights += `- **Total Amount:** $${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;

        highlights += `\n> Note: Data extracted from handwritten logs via Vision OCR.\n\n`;

        return highlights;
    }
}