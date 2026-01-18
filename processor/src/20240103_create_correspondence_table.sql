-- Create table for Financial Planner Correspondence Analysis

CREATE TABLE IF NOT EXISTS financial_correspondence (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    doc_id uuid REFERENCES documents(id) ON DELETE CASCADE,
    letter_date date,
    addressee_name text,
    addressee_contact jsonb DEFAULT '{}'::jsonb, -- Stores Address, Phone, Email structure
    addressor_name text,
    addressor_contact jsonb DEFAULT '{}'::jsonb, -- Stores Firm, Address, Phone, Email
    subject text,
    themes jsonb DEFAULT '[]'::jsonb, -- Array of {Topic, Beneficiary, Details}
    financial_entities jsonb DEFAULT '[]'::jsonb, -- Array of {Name, Type, Value, AccountNumber}
    created_at timestamptz DEFAULT now()
);