import { RealEstateLaneHandler } from '../lanes/realEstateLane.js';
import assert from 'assert';

async function testRealEstateLaneHandler() {
    console.log("🧪 Starting Unit Test: RealEstateLaneHandler");

    // 1. Setup Mock Data
    const mockAiResponse = {
        "Document Type": "Deed",
        "Property Address": "123 Oak St, Springfield, IL",
        "Parcel ID": "12-34-567-890",
        "Execution Date": "2023-05-15",
        "Recording Date": "2023-05-20",
        "Parties": {
            "Grantor_Seller_Landlord": ["John Doe"],
            "Grantee_Buyer_Tenant": ["Jane Smith"],
            "Lender": "Bank of Springfield"
        },
        "Financials": {
            "Purchase Price": "$450,000.00",
            "Loan Amount": "$360,000.00",
            "Monthly Rent": null,
            "Appraised Value": null
        }
    };

    // 2. Create Mock Context
    const mockContext: any = {
        docId: "test-doc-real-estate",
        tempPath: "/tmp/test_deed.pdf",
        pdfPart: { inlineData: { mimeType: 'application/pdf', data: '' } },
        promptConfig: { prompts: {} },

        generateMarkdown: async () => "Mock Markdown Content for Deed",

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
                    assert.strictEqual(table, 'real_estate_assets');
                    assert.strictEqual(data.document_type, "Deed");
                    assert.strictEqual(data.property_address, "123 Oak St, Springfield, IL");
                    assert.strictEqual(data.financials["Purchase Price"], "$450,000.00");
                    return { error: null };
                }
            })
        }
    };

    // 3. Run Handler
    const handler = new RealEstateLaneHandler();
    const result = await handler.process(mockContext);

    // 4. Assertions
    assert.strictEqual(result.extractedData["Document Type"], "Deed");
    assert.strictEqual(result.elementsCaptured.length, 5);
    assert.strictEqual(result.tableUsed, 'real_estate_assets');

    console.log("✅ Test Passed: RealEstateLaneHandler processed correctly.");
}

testRealEstateLaneHandler().catch((err) => {
    console.error("❌ Test Failed:", err);
    process.exit(1);
});