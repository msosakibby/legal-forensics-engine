# Document Metadata Extraction Fields

This document outlines metadata schemas for various structured and unstructured financial documents.

### General Transactional
**Sub-Category:** Invoices, Bills, & Receipts

> Common fields for B2B invoices, utility bills, and Point-of-Sale receipts.

| Field Name | Data Type | Description | Structure Context |
| :--- | :--- | :--- | :--- |
| **Vendor/Merchant Name** | String | The entity issuing the document. | Header Logo / Top Left text |
| **Document Type** | Enum | Invoice, Credit Memo, Receipt, Quote. | Explicit in header |
| **Document ID** | String | Invoice Number, Receipt ID, or Order #. | Key-Value Pair |
| **Transaction Date** | Date | Date service was rendered or purchase made. | Header / Top Right |
| **Grand Total** | Currency | Final amount to be paid. | Bottom Summary Block (Bolded) |
| **Line Item Description** | String | Name of product or service. | Table rows (Repeated) |

***

### Banking & Credit
**Sub-Category:** Bank Statements

> Focuses on running balances and statement periods.

| Field Name | Data Type | Description | Structure Context |
| :--- | :--- | :--- | :--- |
| **Financial Institution** | String | Bank or Credit Card Issuer Name. | Header Logo |
| **Account Number** | String | Last 4 digits of the account. | Header / Top Right |
| **Statement Period** | Date Range | Start Date to End Date. | Header info block |
| **Closing Balance** | Currency | Money available at end of period. | Summary Box |

***

### Forensic Analysis
**Sub-Category:** Bank Statement Check Images (Composite)

> Complex extraction linking scanned check images to statement line-item text for validation.

| Field Name | Data Type | Description | Structure Context |
| :--- | :--- | :--- | :--- |
| **Statement Verification Line** | String | The printed text immediately below the check image. | Page Layout / Anchor |
| **Payor Block** | Object | Name, Address, Phone of account holder. | Check Image: Top Left |
| **Date Written** | Date | Handwritten date. | Check Image: Top Right |
| **Check # (Image)** | Integer | Printed sequence number on the check paper. | Check Image: Top Right |
| **Payee Name** | String | Handwritten or Typed name of recipient. | Check Image: Center Left |
| **Courtesy Amount** | Currency | Numeric amount in the box. | Check Image: Center Right |
| **Legal Amount** | String | Amount written in words. | Check Image: Center Bottom |
| **MICR Line** | String | Machine-readable E-13B font characters. | Check Image: Bottom Edge |

***

### Personal Finance Logs
**Sub-Category:** Handwritten Monthly Expense Logs (Judy/Keith Format)

> Unstructured lined paper logs with specific forensic behaviors (dittos, margin notes, ink changes).

| Field Name | Data Type | Description | Structure Context |
| :--- | :--- | :--- | :--- |
| **Entity Name** | String | Top header name (e.g., 'Judy' or 'Keith'). | Page Header |
| **Reporting Period** | Date | Month and Year of the log. | Page Header |
| **Payee (Main)** | String | Primary recipient or description. | Column 1 |
| **Payee Modifier (Margin)** | String | Text written in the left margin acting as a prefix. | Left Margin |
| **Payment Method** | String | Auto Pay, Cash, or Check #. | Column 2 |
| **Amount** | Currency | Transaction value. | Column 5 |
| **Ditto Resolution** | Boolean | Indicates if value was derived from (") marks above. | Vertical Pattern Recognition |

***

### Financial Registers
**Sub-Category:** Handwritten Checkbook Transaction Register

> Strict grid-based extraction. Critical focus on multi-line descriptions (Payee vs Memo), code identification, and running balance logic.

| Field Name | Data Type | Description | Structure Context |
| :--- | :--- | :--- | :--- |
| **Page Year** | Integer | The year context for the page (often found in header or top row). | Header/Context |
| **Row Sequence** | Integer | Visual line number (1-indexed) to maintain strict order. | Layout |
| **Transaction Code** | String | Raw code: 'EFT', 'Dep', 'ATM', or Check Number (e.g., '1014'). | Col 1: Number/Code |
| **Date (Raw)** | String | Date exactly as written (e.g., '1/4', '2/1'). | Col 2: Date |
| **Date (Normalized)** | Date | MM/DD/YYYY inferred from Page Year context. | Computed |
| **Payee / Description (Line 1)** | String | Primary text on the top half of the row (e.g., 'Spartan Lease'). | Col 3: Top Line |
| **Memo / Notes (Line 2)** | String | Secondary text on bottom half (e.g., 'Jan 2016', 'Acct# 123'). | Col 3: Bottom Line |
| **Payment / Debit (-)** | Currency | Amount of withdrawal or payment. | Col 4: Payment |
| **Reconciled Flag** | Boolean | True if a checkmark (✓) or 'x' appears. | Col 5: Checkbox |
| **Fee Amount** | Currency | Bank fees or service charges. | Col 6: Fee |
| **Deposit / Credit (+)** | Currency | Amount of deposit or interest. | Col 7: Deposit |
| **Running Balance** | Currency | The user-calculated balance on the right. | Col 8: Balance |
| **Correction Indicator** | String | Notes on crossed-out numbers or scribbles. | Visual Analysis |
| **Balance Forward Row** | Boolean | True if this is the top row carrying over from previous page. | Top Row Logic |

***

