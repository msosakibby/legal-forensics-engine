import { SummaryStrategy } from '../types.js';

export class RealEstateSummaryStrategy implements SummaryStrategy {
    buildHighlights(pages: any[]): string {
        let highlights = "";
        let properties = new Set<string>();
        let docTypes = new Set<string>();
        let parties = new Set<string>();
        let financials: any = null;

        pages.forEach(p => {
            const d = p.extracted_data || {};
            if (d["Document Type"]) docTypes.add(d["Document Type"]);
            if (d["Property Address"]) properties.add(d["Property Address"]);

            if (d["Parties"]) {
                const pt = d["Parties"];
                if (Array.isArray(pt.Grantor_Seller_Landlord)) pt.Grantor_Seller_Landlord.forEach((s: string) => parties.add(s));
                if (Array.isArray(pt.Grantee_Buyer_Tenant)) pt.Grantee_Buyer_Tenant.forEach((s: string) => parties.add(s));
            }

            // Capture the first valid financial block found
            if (!financials && d["Financials"]) {
                financials = d["Financials"];
            }
        });

        highlights += `## 🏠 Real Estate Summary\n`;
        if (docTypes.size > 0) highlights += `- **Type:** ${Array.from(docTypes).join(', ')}\n`;
        if (properties.size > 0) highlights += `- **Property:** ${Array.from(properties).join('; ')}\n`;
        if (parties.size > 0) highlights += `- **Parties:** ${Array.from(parties).join(', ')}\n`;

        if (financials) {
            if (financials["Purchase Price"]) highlights += `- **Purchase Price:** ${financials["Purchase Price"]}\n`;
            if (financials["Loan Amount"]) highlights += `- **Loan Amount:** ${financials["Loan Amount"]}\n`;
            if (financials["Appraised Value"]) highlights += `- **Appraised Value:** ${financials["Appraised Value"]}\n`;
        }

        return highlights;
    }
}