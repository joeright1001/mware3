-- Drop existing tables if they exist (optional, for clean start)
DROP TABLE IF EXISTS public.payments;
DROP TABLE IF EXISTS public.pay_status;
DROP TABLE IF EXISTS public.expiry;

-- Create payments table
CREATE TABLE public.payments (
    record_id serial PRIMARY KEY,
    order_record_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    provider character varying(50) NOT NULL,
    amount numeric(10,2) NOT NULL,
    status_url text,
    message_url text,
    payment_url text,
    status_pay character varying(50),
    message_pay text,
    payid character varying(255),
    expires_at timestamp with time zone,
    status_expiry text
);

-- Create pay_status table
CREATE TABLE public.pay_status (
    record_id serial PRIMARY KEY,
    payments_record_id integer NOT NULL,
    date_time timestamp with time zone NOT NULL,
    status text NOT NULL,
    message text,
    FOREIGN KEY (payments_record_id) REFERENCES public.payments (record_id)
);

-- Create expiry table
CREATE TABLE public.expiry (
    record_id serial PRIMARY KEY,
    payments_record_id integer NOT NULL,
    date_time timestamp with time zone NOT NULL,
    status text NOT NULL,
    message text,
    FOREIGN KEY (payments_record_id) REFERENCES public.payments (record_id)
);

-- Function to update payments table based on latest status and message in pay_status
CREATE OR REPLACE FUNCTION update_pay_status() RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.payments
    SET status_pay = NEW.status,
        message_pay = NEW.message
    WHERE record_id = NEW.payments_record_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the update_pay_status function after insert or update on pay_status
CREATE TRIGGER trg_update_pay_status
AFTER INSERT OR UPDATE ON public.pay_status
FOR EACH ROW
EXECUTE FUNCTION update_pay_status();

-- Function to update payments table based on latest status and message in expiry
CREATE OR REPLACE FUNCTION update_expiry_status() RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.payments
    SET status_expiry = NEW.status
    WHERE record_id = NEW.payments_record_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the update_expiry_status function after insert or update on expiry
CREATE TRIGGER trg_update_expiry_status
AFTER INSERT OR UPDATE ON public.expiry
FOR EACH ROW
EXECUTE FUNCTION update_expiry_status();

ALTER TABLE payments ADD COLUMN reviewed TEXT DEFAULT 'no';