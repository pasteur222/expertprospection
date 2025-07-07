/*
  # Update webhook configuration

  1. New Tables
    - `webhook_config`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `webhook_url` (text, webhook endpoint URL)
      - `secret_key` (text, webhook secret for verification)
      - `events` (jsonb, array of event types to subscribe to)
      - `is_active` (boolean, whether webhook is enabled)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `webhook_config` table
    - Add policy for users to manage their own webhook configurations

  3. Changes
    - Create webhook configuration table for storing user webhook settings
    - Add indexes for performance optimization
*/

CREATE TABLE IF NOT EXISTS webhook_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  webhook_url text NOT NULL,
  secret_key text NOT NULL,
  events jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE webhook_config ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own webhook configs"
  ON webhook_config
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own webhook configs"
  ON webhook_config
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own webhook configs"
  ON webhook_config
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own webhook configs"
  ON webhook_config
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_webhook_config_user_id ON webhook_config(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_config_active ON webhook_config(is_active) WHERE is_active = true;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER webhook_config_updated_at
  BEFORE UPDATE ON webhook_config
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_config_updated_at();