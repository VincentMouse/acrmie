-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant permissions
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule the auto-cancel-no-show function to run daily at 2 AM
SELECT cron.schedule(
  'auto-cancel-no-show-appointments',
  '0 2 * * *', -- Run at 2 AM every day
  $$
  SELECT
    net.http_post(
        url:='https://meogqwyyarmajtuidtjg.supabase.co/functions/v1/auto-cancel-no-show',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lb2dxd3l5YXJtYWp0dWlkdGpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5MDk4NzUsImV4cCI6MjA3NTQ4NTg3NX0.s3kBjz85VQyAWyBiBzz-gp_SIJkEJRIe0ev-OYNRYh4"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);