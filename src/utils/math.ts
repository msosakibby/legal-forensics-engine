/**
 * Verifies mathematical integrity of ledger lines.
 */
export function verifyMath(lines: any[]): number[] {
    const failedIndices: number[] = [];
    if (!lines || lines.length < 2) return [];

    for (let i = 1; i < lines.length; i++) {
        const prev = lines[i - 1];
        const curr = lines[i];

        if (prev.balance != null && curr.balance != null && curr.amount != null) {
            const pBal = parseFloat(String(prev.balance).replace(/[^0-9.-]+/g, ""));
            const cAmt = parseFloat(String(curr.amount).replace(/[^0-9.-]+/g, ""));
            const cBal = parseFloat(String(curr.balance).replace(/[^0-9.-]+/g, ""));

            const expected = pBal + cAmt;

            if (Math.abs(expected - cBal) > 0.05) {
                failedIndices.push(i);
            }
        }
    }
    return failedIndices;
}