-- PDF Order Table Schema
-- Purpose: Store generated PDFs for orders
-- This table maintains a one-to-one relationship between orders and PDFs
-- One order can have exactly one PDF record

CREATE TABLE IF NOT EXISTS pdforder (
  record_id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(record_id) UNIQUE,  -- Enforces one-to-one relationship
  trade_order TEXT NOT NULL UNIQUE,                              -- Also unique for easier lookups
  pdf_data BYTEA NOT NULL,                                       -- The actual PDF binary data
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL,                                         -- 'completed', 'failed', 'processing'
  error_message TEXT,                                           -- Optional error message if generation failed
  filename TEXT NOT NULL                                        -- Suggested filename for downloading
);

-- Add indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_pdforder_order_id ON pdforder(order_id);
CREATE INDEX IF NOT EXISTS idx_pdforder_trade_order ON pdforder(trade_order);