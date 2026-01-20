import { SummaryStrategy } from '../types.js';

export class ReceiptSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let vendors = new Set<string>();
        let dates = new Set<string>();
        let totalAmount = 0;
        let itemCount = 0;

        pages.forEach(p => {
            const d = p.extracted_data || {};

            if (d["Vendor Name"]) vendors.add(d["Vendor Name"]);
            if (d["Transaction Date"]) dates.add(d["Transaction Date"]);

            const gross = d["Gross Receipt Total"];
            if (gross) {
                const val = parseFloat(String(gross).replace(/[^0-9.-]+/g, ""));
                if (!isNaN(val)) totalAmount += val;
            }

            if (Array.isArray(d["Line Items"])) {
                itemCount += d["Line Items"].length;
            }
        });

        highlights += `## 🧾 Receipt Summary\n`;
        if (vendors.size > 0) highlights += `- **Vendor(s):** ${Array.from(vendors).join(', ')}\n`;
        if (dates.size > 0) highlights += `- **Date(s):** ${Array.from(dates).join(', ')}\n`;
        highlights += `- **Total Items:** ${itemCount}\n`;
        highlights += `- **Total Amount:** $${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;

        return highlights;
    }
}