import { supabase } from '../lib/supabase';
import { createGroqClient } from '../lib/groq-config';
import { processCustomerMessage } from '../lib/education';

/**
 * Process incoming WhatsApp messages from webhook
 * @param data The message data from webhook
 * @returns Response with success status
 */
export async function processWebhookMessage(data: any) {
  try {
    if (!data.from || !data.text) {
      throw new Error('Missing required fields: from, text');
    }

    // Save incoming message to database
    const { error: saveError } = await supabase
      .from('customer_conversations')
      .insert({
        phone_number: data.from,
        content: data.text,
        sender: 'user',
        created_at: new Date(data.timestamp * 1000).toISOString()
      });

    if (saveError) {
      console.error('Error saving incoming message:', saveError);
    }

    // Get user profile from phone number
    const { data: userProfile } = await supabase
      .from('student_profiles')
      .select('id, user_id')
      .eq('phone_number', data.from)
      .maybeSingle();

    if (!userProfile) {
      console.warn(`No user profile found for phone number: ${data.from}`);
      return { success: false, error: 'User not found' };
    }

    // Process message with appropriate chatbot
    const message = {
      phoneNumber: data.from,
      content: data.text,
      sender: 'user' as const
    };

    const response = await processCustomerMessage(message);

    return { 
      success: true, 
      response: response.content,
      chatbotType: 'education'
    };
  } catch (error) {
    console.error('Error processing webhook message:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Process message status updates from webhook
 * @param data The status update data from webhook
 * @returns Response with success status
 */
export async function processStatusUpdate(data: any) {
  try {
    if (!data.messageId || !data.status) {
      throw new Error('Missing required fields: messageId, status');
    }

    // Update message status in database
    const { error: updateError } = await supabase
      .from('message_logs')
      .update({
        status: data.status,
        updated_at: new Date().toISOString()
      })
      .eq('message_id', data.messageId);

    if (updateError) {
      console.error('Error updating message status:', updateError);
      return { success: false, error: updateError.message };
    }

    return { 
      success: true, 
      message: `Status updated to ${data.status}`
    };
  } catch (error) {
    console.error('Error processing status update:', error);
    return { 
      success: false, 
      error: error.message || 'Unknown error'
    };
  }
}