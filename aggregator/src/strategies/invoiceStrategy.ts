import { SummaryStrategy } from '../types.js';

export class InvoiceSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let vendors = new Set<string>();
        let dates = new Set<string>();
        let totalAmount = 0;
        let invoiceCount = 0;

        pages.forEach(p => {
            const d = p.extracted_data || {};

            if (d["Vendor Name"]) vendors.add(d["Vendor Name"]);
            if (d["Invoice Date"]) dates.add(d["Invoice Date"]);
            if (d["Invoice Number"]) invoiceCount++;

            const total = d["Total Amount Due"];
            if (total) {
                const val = parseFloat(String(total).replace(/[^0-9.-]+/g, ""));
                if (!isNaN(val)) totalAmount += val;
            }
        });

        highlights += `## 🧾 Invoice & Bill Summary\n`;
        if (vendors.size > 0) highlights += `- **Biller(s):** ${Array.from(vendors).join(', ')}\n`;
        if (dates.size > 0) highlights += `- **Date(s):** ${Array.from(dates).join(', ')}\n`;
        highlights += `- **Invoices Processed:** ${invoiceCount}\n`;
        highlights += `- **Total Due:** $${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;

        return highlights;
    }
}