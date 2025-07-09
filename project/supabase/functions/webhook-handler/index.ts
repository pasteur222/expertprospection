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
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving message:', saveError);
      throw new Error(`Failed to save message: ${saveError.message}`);
    }

    // Get user profile from phone number
    const { data: userProfile, error: userError } = await supabase
      .from('student_profiles')
      .select('id, user_id')
      .eq('phone_number', messageData.from)
      .maybeSingle();

    if (userError) {
      console.error('Error fetching user profile:', userError);
      throw new Error(`Failed to fetch user profile: ${userError.message}`);
    }

    if (!userProfile || !userProfile.user_id) {
      // Create a new student profile if one doesn't exist
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
        throw new Error(`Failed to create student profile: ${profileError.message}`);
      }
      
      userProfile = newProfile;
    }

    // Determine chatbot type from message content
    const chatbotType = determineChatbotType(messageData.text);

    // Create Groq client with user's API key
    const groq = await createGroqClient(userProfile.user_id);

    // Generate response using Groq
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: getChatbotSystemPrompt(chatbotType)
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
    console.error('Error in webhook-handler function:', error);
    
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

/**
 * Determine which chatbot should handle the message based on content analysis
 * @param message The message text to analyze
 * @returns The chatbot type: 'client', 'education', or 'quiz'
 */
function determineChatbotType(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  // Education keywords
  const educationKeywords = [
    'learn', 'study', 'course', 'education', 'school', 'homework', 
    'assignment', 'question', 'apprendre', 'étudier', 'cours', 'éducation', 
    'école', 'devoir', 'exercice'
  ];
  
  // Quiz keywords
  const quizKeywords = [
    'quiz', 'game', 'test', 'play', 'challenge', 'question', 'answer',
    'jeu', 'défi', 'réponse', 'questionnaire'
  ];
  
  // Check for education keywords
  if (educationKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'education';
  }
  
  // Check for quiz keywords
  if (quizKeywords.some(keyword => lowerMessage.includes(keyword))) {
    return 'quiz';
  }
  
  // Default to client support
  return 'client';
}

/**
 * Get the system prompt for a specific chatbot type
 * @param chatbotType The type of chatbot
 * @returns The system prompt
 */
function getChatbotSystemPrompt(chatbotType: string): string {
  switch (chatbotType) {
    case 'education':
      return `You are an educational assistant specialized in helping students with their studies.
Your goal is to provide clear, accurate explanations and guide students through their learning process.
Be patient, encouraging, and adapt your explanations to different learning styles.
Provide step-by-step solutions when appropriate and ask clarifying questions if needed.`;
    
    case 'quiz':
      return `You are a quiz master who creates engaging educational quizzes.
Your goal is to make learning fun through interactive questions and challenges.
Be enthusiastic, encouraging, and provide informative feedback on answers.
Keep track of scores and progress, and adapt difficulty based on performance.`;
    
    default: // client support
      return `You are a customer service assistant for a telecom company.
Your goal is to help customers with their inquiries, issues, and requests.
Be professional, courteous, and solution-oriented.
Provide clear instructions and ask for clarification when needed.
If you cannot resolve an issue, offer to escalate it to a human agent.`;
  }
}