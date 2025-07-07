import { supabase } from './supabase';

/**
 * Get the webhook URL for the application
 * @returns The webhook URL
 */
export async function getWebhookUrl(): Promise<string | null> {
  try {
    // Get the first active user_whatsapp_config
    const { data, error } = await supabase
      .from('user_whatsapp_config')
      .select('webhook_url')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching webhook URL:', error);
      return null;
    }

    return data?.webhook_url || null;
  } catch (error) {
    console.error('Error in getWebhookUrl:', error);
    return null;
  }
}

/**
 * Update the webhook URL for a user
 * @param userId The user ID
 * @param webhookUrl The new webhook URL
 */
export async function updateWebhookUrl(userId: string, webhookUrl: string): Promise<void> {
  try {
    // Check if user has a WhatsApp config
    const { data: existingConfig, error: checkError } = await supabase
      .from('user_whatsapp_config')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking WhatsApp config:', checkError);
      throw checkError;
    }

    if (existingConfig) {
      // Update existing config
      const { error: updateError } = await supabase
        .from('user_whatsapp_config')
        .update({
          webhook_url: webhookUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingConfig.id);

      if (updateError) {
        console.error('Error updating webhook URL:', updateError);
        throw updateError;
      }
    } else {
      // User doesn't have a WhatsApp config yet
      throw new Error('User does not have a WhatsApp configuration');
    }
  } catch (error) {
    console.error('Error in updateWebhookUrl:', error);
    throw error;
  }
}