CREATE OR REPLACE FUNCTION match_receipts()
RETURNS TABLE (
    receipt_id INT,
    bank_line_id INT,
    confidence_score NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        r.id AS receipt_id,
        bl.id AS bank_line_id,
        1.0 AS confidence_score -- Exact match on amount and close dates, so high confidence
    FROM
        receipts r
    JOIN
        bank_lines bl ON r.amount = bl.amount
    WHERE
        r.date BETWEEN (bl.date - INTERVAL '3 days') AND (bl.date + INTERVAL '3 days');
END;
$$ LANGUAGE plpgsql;

-- Example usage (uncomment to test):
-- SELECT * FROM match_receipts();

-- Assuming 'receipts' and 'bank_lines' tables exist with 'id', 'amount', and 'date' columns.
-- Example table creation (uncomment to create dummy tables for testing):
-- CREATE TABLE receipts (id SERIAL PRIMARY KEY, amount NUMERIC, date DATE);
-- CREATE TABLE bank_lines (id SERIAL PRIMARY KEY, amount NUMERIC, date DATE);