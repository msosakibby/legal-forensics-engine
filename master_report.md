# Master Document Analysis Report

## Part 1: Metadata Definitions (Schemas)

### General Transactional
> Common fields for B2B invoices and POS receipts.

| Field Name | Type | Description | Context |
| :--- | :--- | :--- | :--- |
| **Vendor Name** | String | Entity issuing document. | Header |
| **Total Amount** | Currency | Final amount to be paid. | Footer |
| **Date** | Date | Transaction date. | Header |

---

### Banking & Credit
> Running balances and periods.

| Field Name | Type | Description | Context |
| :--- | :--- | :--- | :--- |
| **Account #** | String | Masked account number. | Header |
| **Period** | Date Range | Statement start/end. | Header |

---

### Forensic Analysis
> Complex extraction linking scanned check images to statement line-item text.

| Field Name | Type | Description | Context |
| :--- | :--- | :--- | :--- |
| **Statement Line** | String | Printed verification text. | Below Image |
| **Payor Info** | Object | Name/Address top left. | Image Top-Left |
| **MICR Line** | String | E-13B font characters. | Image Bottom |

---


## Part 2: Visual Layout Example (Bank Statement)
**Page:** 2 | **Account:** 1024797

| Left Column (Scan) | Right Column (Scan) |
| :--- | :--- |
| **Check #9586**<br>-------------------------<br>**K. Grundy**<br>P.O. Box 297, Marion, MI<br><br>Date: 2007-12-04<br>Pay: **VFW Auxiliary 6015**<br>Amt: **$50.00**<br>*Fifty and 00/100*<br>MICR: `⑆072404948⑆ 0001024797⑈ 9586`<br>-------------------------<br>> Verified: Check #9586 Paid : 12/18/2007 $50.00 | **Check #9588**<br>-------------------------<br>**K. Grundy**<br>P.O. Box 297, Marion, MI<br><br>Date: 2007-12-07<br>Pay: **Judy Grandy**<br>Amt: **$1000.00**<br>*One Thousand & 00/100*<br>MICR: `⑆072404948⑆ 0001024797⑈ 9588`<br>-------------------------<br>> Verified: Check #9588 Paid : 12/13/2007 $1000.00 |
