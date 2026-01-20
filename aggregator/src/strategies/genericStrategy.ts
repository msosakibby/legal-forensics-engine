import { SummaryStrategy } from '../types.js';

export class GenericSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let entities = new Set<string>();
        let dates = new Set<string>();
        let totalAmount = 0;
        let foundAmount = false;

        pages.forEach(p => {
            const d = p.extracted_data || {};

            // Attempt to find Entity/Vendor/Sender
            const entity = d.merchant || d.vendor || d.sender || d.organization || d.entity_name || d.store;
            if (entity) entities.add(entity);

            // Attempt to find Date
            const date = d.date || d.transaction_date || d.invoice_date || d.primary_date;
            if (date) dates.add(date);

            // Attempt to find Total Amount
            const amount = d.total || d.amount || d.total_amount || d.grand_total;
            if (amount) {
                const val = parseFloat(String(amount).replace(/[^0-9.-]+/g, ""));
                if (!isNaN(val)) {
                    totalAmount += val;
                    foundAmount = true;
                }
            }
        });

        highlights += `## 📄 General Document Summary\n`;
        if (entities.size > 0) highlights += `- **Entity/Source:** ${Array.from(entities).join(', ')}\n`;
        if (dates.size > 0) highlights += `- **Dates:** ${Array.from(dates).join(', ')}\n`;

        if (foundAmount) highlights += `- **Total Value:** $${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;

        return highlights;
    }
}