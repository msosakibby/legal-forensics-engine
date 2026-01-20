import { SummaryStrategy } from '../types.js';

export class CreditCardSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let failedMath = 0;
        let totalTrans = 0;
        let accountNumbers = new Set<string>();

        pages.forEach(p => {
            const lines = p.extracted_data?.statement_lines || [];
            totalTrans += lines.length;
            failedMath += lines.filter((l: any) => l.is_math_verified === false).length;

            if (p.extracted_data?.["Account Number"]) {
                accountNumbers.add(p.extracted_data["Account Number"]);
            }
        });

        highlights += `## 💳 Credit Card Forensic Audit\n`;
        if (accountNumbers.size > 0) {
            highlights += `- **Account(s):** ${Array.from(accountNumbers).join(', ')}\n`;
        }
        highlights += `- **Transactions:** ${totalTrans}\n`;

        if (failedMath > 0) {
            highlights += `- **🔴 CALCULATION ERRORS:** ${failedMath}\n`;
            highlights += `> Warning: Running balance did not match transaction math.\n`;
        } else {
            highlights += `- **Verification:** ✅ Clean.\n`;
        }
        highlights += `\n`;
        return highlights;
    }
}