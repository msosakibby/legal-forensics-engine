import { SummaryStrategy } from '../types.js';
import { LegalSummaryStrategy } from './legalStrategy.js';
import { FinancialSummaryStrategy } from './financialStrategy.js';
import { BankSummaryStrategy } from './bankStrategy.js';
import { TaxSummaryStrategy } from './taxStrategy.js';
import { CheckRegisterSummaryStrategy } from './checkRegisterStrategy.js';
import { GenericSummaryStrategy } from './genericStrategy.js';
import { MediaSummaryStrategy } from './mediaStrategy.js';
import { ExpenseLogSummaryStrategy } from './expenseLogStrategy.js';
import { ReceiptSummaryStrategy } from './receiptStrategy.js';
import { RealEstateSummaryStrategy } from './realEstateStrategy.js';
import { InvoiceSummaryStrategy } from './invoiceStrategy.js';
import { CourtSummaryStrategy } from './courtStrategy.js';
import { CreditCardSummaryStrategy } from './creditCardStrategy.js';

export class SummaryFactory {
    static getStrategy(docType: string): SummaryStrategy | null {
        if (docType.includes("Legal")) return new LegalSummaryStrategy();
        if (docType.includes("Financial Planner") || docType.includes("Letter")) return new FinancialSummaryStrategy();
        if (docType === "Credit Card Statements") return new CreditCardSummaryStrategy();
        if (docType.includes("Bank") || docType.includes("Statement")) return new BankSummaryStrategy();
        if (docType.includes("Tax")) return new TaxSummaryStrategy();
        if (docType.includes("Check Register")) return new CheckRegisterSummaryStrategy();
        if (docType.includes("Expense Log") || docType.includes("Handwritten Monthly")) return new ExpenseLogSummaryStrategy();
        if (docType === "Receipts" || docType.includes("Receipt")) return new ReceiptSummaryStrategy();
        if (docType === "Invoices & Bills" || docType.includes("Invoice") || docType.includes("Bill")) return new InvoiceSummaryStrategy();
        if (docType === "Real Estate Documents") return new RealEstateSummaryStrategy();
        if (docType === "Court Judgments") return new CourtSummaryStrategy();
        if (docType.includes("media") || docType.includes("audio") || docType.includes("video")) return new MediaSummaryStrategy();
        return new GenericSummaryStrategy();
    }
}