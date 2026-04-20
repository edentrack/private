/*
  ADD WHATSAPP SUPPORT COLUMNS TO PLATFORM_SETTINGS
  ===================================================
  
  Adds missing columns for WhatsApp support configuration
*/

-- Add WhatsApp support columns if they don't exist
ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS whatsapp_support_number TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS whatsapp_support_message TEXT DEFAULT 'Hello! I need help with Ebenezer Farms app.';
