# Document Metadata Extraction Fields

This document outlines metadata schemas for various structured and unstructured financial documents.

### General Transactional
**Sub-Category:** Invoices, Bills, & Receipts

> Common fields for B2B invoices, utility bills, and Point-of-Sale receipts.

| Field Name | Data Type | Description | Structure Context |
| :--- | :--- | :--- | :--- |
| **Vendor/Merchant Name** | String | The entity issuing the document. | Header Logo / Top Left text |
| **Document Type** | Enum | Invoice, Credit Memo, Receipt, Quote. | Explicit in header |
| **Document ID** | String | Invoice Number, Receipt ID, or Order #. | Key-Value Pair (e.g., 'Inv #: 102') |
| **PO Number** | String | Purchase Order reference number. | Header / B2B reference block |
| **Transaction Date** | Date | Date service was rendered or purchase made. | Header / Top Right |
| **Due Date** | Date | Date payment is required (Net 30/60/90). | Specific to Invoices/Bills |
| **Subtotal** | Currency | $$ \sum (\text{Price} \times \text{Qty}) $$ before tax/fees. | Bottom Summary Block |
| **Tax Amount** | Currency | Sales tax, VAT, or GST. | Bottom Summary Block |
| **Grand Total** | Currency | Final amount to be paid. | Bottom Summary Block (Bolded) |
| **Line Item Description** | String | Name of product or service. | Table rows (Repeated) |
| **Payment Method** | String | Visa, Cash, ACH, Check ending in ****. | Footer / Summary |

***

### Banking & Credit
**Sub-Category:** Bank Statements & Credit Card Statements

> Focuses on running balances and statement periods.

| Field Name | Data Type | Description | Structure Context |
| :--- | :--- | :--- | :--- |
| **Financial Institution** | String | Bank or Credit Card Issuer Name. | Header Logo |
| **Account Number (Masked)** | String | Last 4 digits of the account. | Header / Top Right |
| **Statement Period** | Date Range | Start Date to End Date. | Header info block |
| **Opening Balance** | Currency | Money available at start of period. | Summary Box |
| **Closing Balance** | Currency | Money available at end of period. | Summary Box |
| **Total Deposits/Credits** | Currency | Sum of incoming funds. | Summary Box |
| **Total Withdrawals/Debits** | Currency | Sum of outgoing funds. | Summary Box |
| **APR / Interest Rate** | Percentage | Annual Percentage Rate charged. | Footer / Fine Print |
| **Transaction Row Date** | Date | Date transaction occurred. | Ledger Table Column |
| **Transaction Code** | String | ACH, POS, CHK, DEP codes. | Ledger Table Column |

***

### Legal & Agreements
**Sub-Category:** Contracts (NDA, MSA, Employment)

> Unstructured text extraction requiring NLP.

| Field Name | Data Type | Description | Structure Context |
| :--- | :--- | :--- | :--- |
| **Agreement Type** | String | NDA, MSA, Lease, etc. | Title / Header |
| **Effective Date** | Date | When the contract becomes active. | First paragraph preamble |
| **Termination Date** | Date | When the contract expires. | 'Term' clause |
| **Party A (Discloser/Lessor)** | Entity | Name of the first entity. | Preamble |
| **Party B (Recipient/Lessee)** | Entity | Name of the second entity. | Preamble |
| **Jurisdiction** | Location | State/Country laws governing contract. | 'Governing Law' clause |
| **Contract Value** | Currency | Total monetary value of the deal. | Consideration / Payment Terms |
| **Renewal Type** | Boolean/Enum | Auto-renew vs Manual renew. | 'Term and Termination' clause |
| **Signatories** | String | Names of individuals signing. | Signature Block (Bottom) |

***

### Direct Store Delivery (DSD)
**Sub-Category:** Vendor Invoices (Coke, Pepsi, Frito-Lay, Aunt Millies)

> Supply chain logistics fields for route accounting.

| Field Name | Data Type | Description | Structure Context |
| :--- | :--- | :--- | :--- |
| **Route Number** | String | ID of the specific delivery truck route. | Header (Critical for tracking) |
| **Store Number** | String | Vendor's internal ID for the store. | Header |
| **Driver Name/ID** | String | Who physically delivered the goods. | Header or Signature line |
| **Delivery Signature** | Image/Bool | Proof store manager signed for goods. | Bottom (Handwritten) |
| **Case Count** | Integer | Number of physical boxes/crates delivered. | Table Total |
| **Bottle Deposit (CRV)** | Currency | State-mandated deposit fees. | Line item or Footer |
| **Credits/Returns** | Currency | Deduction for damaged/stale goods. | Negative values in body/footer |
| **UPC/EAN** | Numeric | Barcode number (12/13 digits). | Table Row (High precision) |
| **Promotion/Allowance** | Currency | Discounts applied at delivery. | Line item adjustment |

***

### Personal Finance
**Sub-Category:** Handwritten Check Registers

> Unstructured handwriting grids, often requiring HTR.

| Field Name | Data Type | Description | Structure Context |
| :--- | :--- | :--- | :--- |
| **Check Number** | Integer | Sequential number (e.g., 101, 102). | First Column (Anchor field) |
| **Entry Date** | Date | Date written (often incomplete e.g., '1/5'). | Second Column |
| **Transaction Description** | String | Payee name or notes. | Wide middle column |
| **Payment Amount (-)** | Currency | Debit amount. | Column right of description |
| **Deposit Amount (+)** | Currency | Credit amount. | Column right of Payment |
| **Reconciled Flag** | Boolean | Checkmark for bank matching. | Tiny column (tick mark) |
| **Running Balance** | Currency | User-calculated balance. | Far right column |
| **Void Indicator** | Boolean | Strike-through or word 'VOID'. | Visual overlay |

***

