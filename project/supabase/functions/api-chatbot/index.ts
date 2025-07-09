// Follow this setup guide to integrate the Deno runtime and Supabase functions in your project:
// https://deno.land/manual/getting_started/setup_your_environment

import { serve } from "npm:@supabase/functions-js";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createGroqClient } from "../_shared/groq-client.ts";

// Define CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    // Get the chatbot type from the URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const chatbotType = pathParts[pathParts.length - 1]; // Last part of the path

    if (!['client', 'education', 'quiz'].includes(chatbotType)) {
      return new Response(
        JSON.stringify({ error: 'Invalid chatbot type. Must be client, education, or quiz' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Parse request body
    const messageData = await req.json();
    
    // Validate request data
    if (!messageData.from || !messageData.text) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: from, text' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Save incoming message
    const { data: savedMessage, error: saveError } = await supabase
      .from('customer_conversations')
      .insert({
        phone_number: messageData.from,
        content: messageData.text,
        sender: 'user',
        created_at: new Date(messageData.timestamp * 1000).toISOString()
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving message:', saveError);
      throw new Error(`Failed to save message: ${saveError.message}`);
    }

    // Get user profile from phone number or create a new one for education
    let userId = null;
    let studentId = null;

    if (chatbotType === 'education') {
      // For education, we need to get or create a student profile
      const { data: student, error: studentError } = await supabase
        .from('student_profiles')
        .select('id, user_id')
        .eq('phone_number', messageData.from)
        .maybeSingle();

      if (studentError) {
        console.error('Error fetching student profile:', studentError);
      }

      if (student) {
        studentId = student.id;
        if (student.user_id) {
          userId = student.user_id;
        }
      } else {
        // Create a new student profile
        const { data: newProfile, error: profileError } = await supabase
          .from('student_profiles')
          .insert({
            phone_number: messageData.from,
            level: '3ème', // Default level
            subjects: [],
            preferred_language: 'french'
          })
          .select()
          .single();

        if (profileError) {
          console.error('Error creating student profile:', profileError);
        } else {
          studentId = newProfile.id;
        }
      }
    }

    // If we still don't have a userId, try to get from profils_utilisateurs
    if (!userId) {
      const { data: userProfile } = await supabase
        .from('profils_utilisateurs')
        .select('id')
        .eq('phone_number', messageData.from)
        .maybeSingle();
        
      if (userProfile) {
        userId = userProfile.id;
      } else {
        // If still no userId, get any user with Groq config
        const { data: anyGroqConfig } = await supabase
          .from('user_groq_config')
          .select('user_id')
          .limit(1)
          .maybeSingle();
          
        if (anyGroqConfig) {
          userId = anyGroqConfig.user_id;
        }
      }
    }

    // If we still don't have a userId, we can't proceed
    if (!userId) {
      throw new Error('No user with Groq configuration found');
    }

    // Create Groq client with user's API key
    const groq = await createGroqClient(userId);

    // Generate system prompt based on chatbot type
    let systemPrompt = '';
    switch (chatbotType) {
      case 'education':
        systemPrompt = `You are an educational assistant specialized in helping students with their studies.
Your goal is to provide clear, accurate explanations and guide students through their learning process.
Be patient, encouraging, and adapt your explanations to different learning styles.
Provide step-by-step solutions when appropriate and ask clarifying questions if needed.`;
        break;
      case 'quiz':
        systemPrompt = `You are a quiz master who creates engaging educational quizzes.
Your goal is to make learning fun through interactive questions and challenges.
Be enthusiastic, encouraging, and provide informative feedback on answers.
Keep track of scores and progress, and adapt difficulty based on performance.`;
        break;
      default: // client support
        systemPrompt = `You are a customer service assistant for a telecom company.
Your goal is to help customers with their inquiries, issues, and requests.
Be professional, courteous, and solution-oriented.
Provide clear instructions and ask for clarification when needed.
If you cannot resolve an issue, offer to escalate it to a human agent.`;
    }

    // Generate response using Groq
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        { role: "user", content: messageData.text }
      ],
      model: "mixtral-8x7b-32768",
      temperature: 0.7,
      max_tokens: 2048,
    });

    const response = completion.choices[0]?.message?.content || "Je suis désolé, je n'ai pas pu générer une réponse appropriée.";

    // Save bot response
    const { data: savedResponse, error: responseError } = await supabase
      .from('customer_conversations')
      .insert({
        phone_number: messageData.from,
        content: response,
        sender: 'bot',
        intent: chatbotType,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (responseError) {
      console.error('Error saving response:', responseError);
      throw new Error(`Failed to save response: ${responseError.message}`);
    }

    // For education chatbot, update analytics
    if (chatbotType === 'education' && studentId) {
      // Save analytics data
      await supabase.from('education_analytics').insert({
        student_id: studentId,
        message_id: savedMessage.id,
        message_type: 'question',
        subject: 'general', // This could be determined by AI analysis
        sentiment: 0,
        complexity_level: 0.5,
        understanding_score: 0.7
      });
    }

    // Send response back to WhatsApp
    // This would typically be handled by the webhook, but we include the logic here
    // in case you want to implement direct sending in the future
    const phoneNumberId = messageData.phoneNumberId;
    const accessToken = req.headers.get('Authorization')?.split(' ')[1];
    
    if (phoneNumberId && accessToken) {
      try {
        await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: messageData.from,
            type: 'text',
            text: { body: response }
          })
        });
      } catch (sendError) {
        console.error('Error sending WhatsApp response:', sendError);
        // Continue anyway, as the webhook will handle the response
      }
    }

    // Return success response
    return new Response(
      JSON.stringify({ 
        success: true, 
        response: response,
        chatbotType: chatbotType
      }),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  } catch (error) {
    console.error('Error in api-chatbot function:', error);
    
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
          ...corsHeaders
        }
      }
    );
  }
});