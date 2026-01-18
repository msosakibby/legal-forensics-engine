-- Create table for Forensic Tax Analysis (Federal & Michigan)

CREATE TABLE IF NOT EXISTS tax_documents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    doc_id uuid REFERENCES documents(id) ON DELETE CASCADE,
    tax_year integer,
    jurisdiction text, -- 'Federal' or 'Michigan'
    form_number text, -- '1040', '1120S', '4562', etc.
    entity_name text, -- Individual or Business Name
    entity_id text, -- SSN or EIN
    filing_status text,
    total_income numeric,
    tax_liability numeric,
    depreciation_schedule jsonb DEFAULT '[]'::jsonb, -- Stores array of asset objects
    created_at timestamptz DEFAULT now()
);