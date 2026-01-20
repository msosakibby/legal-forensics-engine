import { sanitize } from '../../../../src/utils/common.js';

export class NamingService {
    /**
     * Smart Naming Logic.
     * Prioritizes the standardized '_metadata' block created by the Processor.
     */
    static determineTargetName(pageData: any): string {
        const meta = pageData._metadata || {};

        // 1. Date Logic
        let dateStr = new Date().toISOString().split('T')[0]; // Default to today
        if (meta.primary_date) {
            // Regex check to ensure it looks like a date YYYY-MM-DD
            const match = meta.primary_date.match(/\d{4}-\d{2}-\d{2}/);
            if (match) dateStr = match[0];
        }

        // 2. Entity Logic
        const entity = sanitize(meta.entity_name || "Entity");

        // 3. Type Logic
        let type = sanitize(meta.doc_type || "Document");

        // Shorten common types for readability
        if (type.includes("Statement")) type = "Stmt";
        if (type.includes("Financial")) type = "Fin";
        if (type.includes("Contract")) type = "Legal";

        // Construct Name: YYYY-MM-DD_Type_Entity
        return `${dateStr}_${type}_${entity}`;
    }
}