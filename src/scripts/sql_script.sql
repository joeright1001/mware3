--ALTER TABLE payments ADD COLUMN payid VARCHAR(255);
--ALTER TABLE payments ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;


-- Rename the status column to status_url and keep its current type
ALTER TABLE payments
RENAME COLUMN status TO status_url;

-- Add new columns: fees, shipping, bill_total, and status_pay with appropriate types and default values
ALTER TABLE payments
ADD COLUMN fees numeric(10,2),
ADD COLUMN shipping numeric(10,2),
ADD COLUMN bill_total numeric(10,2),
ADD COLUMN status_pay character varying(50) DEFAULT 'open';

-- Update the bill_total column to have the same value as the amount column for existing rows
UPDATE payments
SET bill_total = amount;