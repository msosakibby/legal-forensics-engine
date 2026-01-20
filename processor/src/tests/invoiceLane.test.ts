import { InvoiceLaneHandler } from '../lanes/invoiceLane.js';
import assert from 'assert';

async function testInvoiceLaneHandler() {
    console.log("🧪 Starting Unit Test: InvoiceLaneHandler");

    // 1. Setup Mock Data
    const mockAiResponse = {
        "Vendor Name": "Acme Corp",
        "Vendor Address": "123 Industrial Way",
        "Invoice Number": "INV-2024-001",
        "Account Number": "ACC-999",
        "PO Number": "PO-555",
        "Invoice Date": "2024-02-01",
        "Due Date": "2024-03-01",
        "Total Amount Due": "$1,250.00",
        "Tax Amount": "$100.00",
        "Line Items": [
            { "Description": "Consulting Services", "Qty": "10", "Unit Price": "$100.00", "Line Total": "$1,000.00" },
            { "Description": "Software License", "Qty": "1", "Unit Price": "$150.00", "Line Total": "$150.00" }
        ]
    };

    // 2. Create Mock Context
    const mockContext: any = {
        docId: "test-doc-invoice",
        tempPath: "/tmp/test_invoice.pdf",
        pdfPart: { inlineData: { mimeType: 'application/pdf', data: '' } },
        promptConfig: { prompts: {} },

        generateMarkdown: async () => "Mock Markdown Content for Invoice",

        reasoningModel: {
            generateContent: async () => ({
                response: {
                    candidates: [{
                        content: {
                            parts: [{ text: JSON.stringify(mockAiResponse) }]
                        }
                    }]
                }
            })
        },

        supabase: {
            from: (table: string) => ({
                insert: async (data: any) => {
                    console.log(`   [Mock] DB Insert into '${table}'`);
                    assert.strictEqual(table, 'receipts_log');
                    assert.strictEqual(data.vendor_name, "Acme Corp");
                    assert.strictEqual(data.total_amount, "$1,250.00");
                    assert.strictEqual(data.category, "Invoice/Bill");
                    return { error: null };
                }
            })
        }
    };

    // 3. Run Handler
    const handler = new InvoiceLaneHandler();
    const result = await handler.process(mockContext);

    // 4. Assertions
    assert.strictEqual(result.extractedData["Vendor Name"], "Acme Corp");
    assert.strictEqual(result.extractedData["Invoice Number"], "INV-2024-001");
    assert.strictEqual(result.elementsCaptured.length, 5);
    assert.strictEqual(result.tableUsed, 'receipts_log');

    console.log("✅ Test Passed: InvoiceLaneHandler processed correctly.");
}

testInvoiceLaneHandler().catch((err) => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});