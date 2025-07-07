import { Groq } from "npm:groq-sdk@0.26.0";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Create a Groq client for a specific user
 * @param userId The user ID to create a client for
 * @returns A configured Groq client
 */
export async function createGroqClient(userId: string): Promise<Groq> {
  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's Groq configuration
    const { data, error } = await supabase
      .from('user_groq_config')
      .select('api_key, model')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching Groq configuration:', error);
      throw new Error(`Failed to fetch Groq configuration: ${error.message}`);
    }

    if (!data || !data.api_key) {
      throw new Error('No Groq API key found for this user');
    }

    // Create and return Groq client
    return new Groq({
      apiKey: data.api_key,
      dangerouslyAllowBrowser: true
    });
  } catch (error) {
    console.error('Error creating Groq client:', error);
    throw error;
  }
}