// Follow this setup guide to integrate the Deno runtime and Supabase functions in your project:
// https://deno.land/manual/getting_started/setup_your_environment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

interface WhatsAppMessage {
  phoneNumber: string; 
  message: string;
  media?: {
    type: 'image' | 'video' | 'document';
    url?: string;
    data?: string;
  };
  variables?: Record<string, string>;
}

interface WhatsAppRequest {
  messages: WhatsAppMessage | WhatsAppMessage[];
  userId: string;
}

serve(async (req) => {
  try {
    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }

    // Parse request body
    const requestData: WhatsAppRequest = await req.json();
    
    // Validate request data
    if (!requestData.messages) {
      return new Response(
        JSON.stringify({ error: 'No messages provided' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }

    // Validate userId is provided
    if (!requestData.userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          }
        }
      );
    }

    // Get WhatsApp configuration from database
    const config = await getWhatsAppConfig(requestData.userId);
    
    // Process messages
    const messages = Array.isArray(requestData.messages) 
      ? requestData.messages 
      : [requestData.messages];
    
    const results = await Promise.all(
      messages.map(msg => sendWhatsAppMessage(msg, config))
    );

    // Return success response
    return new Response(
      JSON.stringify({ 
        success: true, 
        result: { 
          messages: results.map(r => ({ id: r.messageId }))
        }
      }),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    );
  } catch (error) {
    // Return error response
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An error occurred',
        details: error.stack
      }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      }
    );
  }
});

// Get WhatsApp configuration from database
async function getWhatsAppConfig(userId: string) {
  try {
    const supabaseClient = Deno.env.get("SUPABASE_CLIENT") || "{}";
    const { supabaseUrl, supabaseKey } = JSON.parse(supabaseClient);
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration not found');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get user-specific config
    const { data: userConfig } = await supabase
      .from('user_whatsapp_config')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    
    if (!userConfig || !userConfig.access_token || !userConfig.phone_number_id) {
      throw new Error('No active WhatsApp configuration found for this user');
    }
    
    return {
      accessToken: userConfig.access_token,
      phoneNumberId: userConfig.phone_number_id
    };
  } catch (error) {
    console.error('Error getting WhatsApp configuration:', error);
    throw error;
  }
}

// Send WhatsApp message
async function sendWhatsAppMessage(message: WhatsAppMessage, config: { accessToken: string, phoneNumberId: string }) {
  try {
    // Process message variables if present
    let processedMessage = message.message;
    if (message.variables) {
      Object.entries(message.variables).forEach(([key, value]) => {
        processedMessage = processedMessage.replace(
          new RegExp(`{{${key}}}`, 'g'),
          value
        );
      });
    }

    // Prepare the WhatsApp message payload
    const messagePayload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.phoneNumber,
      type: message.media ? message.media.type : 'text'
    };

    // Add the appropriate content based on message type
    if (message.media) {
      if (message.media.url) {
        messagePayload[message.media.type] = { url: message.media.url };
      } else if (message.media.data) {
        // For base64 encoded media
        // This would need additional handling in a real implementation
        messagePayload[message.media.type] = { url: message.media.data };
      }
    } else {
      messagePayload.text = { body: processedMessage };
    }

    // Send the message to WhatsApp API
    const response = await fetch(`https://graph.facebook.com/v18.0/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'WhatsApp API error');
    }

    const data = await response.json();
    return {
      success: true,
      messageId: data.messages?.[0]?.id
    };
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    throw error;
  }
}

// Simple Supabase client implementation
function createClient(supabaseUrl: string, supabaseKey: string) {
  return {
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: any) => ({
          eq: (column2: string, value2: any) => ({
            maybeSingle: async () => {
              try {
                const url = `${supabaseUrl}/rest/v1/${table}?select=${columns}&${column}=eq.${value}&${column2}=eq.${value2}`;
                const response = await fetch(url, {
                  headers: {
                    'apikey': supabaseKey,
                    'Authorization': `Bearer ${supabaseKey}`
                  }
                });
                
                if (!response.ok) {
                  throw new Error(`Supabase API error: ${response.status}`);
                }
                
                const data = await response.json();
                return { data: data.length > 0 ? data[0] : null };
              } catch (error) {
                console.error('Supabase query error:', error);
                return { data: null, error };
              }
            }
          })
        })
      }),
      insert: (data: any) => {
        console.log(`[MOCK] Inserting into ${table}:`, data);
        return Promise.resolve({ data, error: null });
      }
    })
  };
}