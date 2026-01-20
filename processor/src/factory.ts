import { LaneHandler } from './types.js';
import { LegalLaneHandler } from './lanes/legalLane.js';
import { FinancialLaneHandler } from './lanes/financialLane.js';
import { BankStatementHandler } from './lanes/bankLane.js';
import { CreditCardLaneHandler } from './lanes/creditCardLane.js';
import { TaxReturnHandler } from './lanes/taxLane.js';
import { CheckRegisterHandler } from './lanes/checkRegisterLane.js';
import { GenericLaneHandler } from './lanes/genericLane.js';
import { ExpenseLogHandler } from './lanes/expenseLogLane.js';
import { ReceiptLaneHandler } from './lanes/receiptLane.js';
import { RealEstateLaneHandler } from './lanes/realEstateLane.js';
import { InvoiceLaneHandler } from './lanes/invoiceLane.js';
import { CourtLaneHandler } from './lanes/courtLane.js';

export class LaneFactory {
    static getHandler(docType: string): LaneHandler | null {
        if (docType === "Legal Contracts & Agreements") return new LegalLaneHandler();
        if (docType === "Financial Planner Letters") return new FinancialLaneHandler();
        if (docType === "Bank Statements") return new BankStatementHandler();
        if (docType === "Credit Card Statements") return new CreditCardLaneHandler();
        if (docType.includes("Tax")) return new TaxReturnHandler();
        if (docType.includes("Check Register")) return new CheckRegisterHandler();
        if (docType.includes("Expense Log") || docType.includes("Handwritten Monthly")) return new ExpenseLogHandler();
        if (docType === "Receipts") return new ReceiptLaneHandler();
        if (docType === "Invoices & Bills") return new InvoiceLaneHandler();
        if (docType === "Court Judgments") return new CourtLaneHandler();
        if (docType === "Real Estate Documents") return new RealEstateLaneHandler();
        return new GenericLaneHandler();
    }
}
