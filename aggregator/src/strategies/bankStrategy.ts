import { SummaryStrategy } from '../types.js';

export class BankSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let failedMath = 0;
        let totalTrans = 0;

        pages.forEach(p => {
            const lines = p.extracted_data?.statement_lines || [];
            totalTrans += lines.length;
            failedMath += lines.filter((l: any) => l.is_math_verified === false).length;
        });

        highlights += `## 🧮 Forensic Math Audit\n`;
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