CREATE TABLE payments (
    record_id SERIAL PRIMARY KEY,
    order_record_id INTEGER REFERENCES orders(record_id),
    provider VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    payment_url TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);