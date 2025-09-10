import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createGroqClient } from "../_shared/groq-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

interface ChatbotRequest {
  webUserId?: string;
  phoneNumber?: string;
  sessionId?: string;
  source: 'web' | 'whatsapp';
  text: string;
  chatbotType: 'client' | 'education' | 'quiz';
  userAgent?: string;
  timestamp?: string;
}

interface ChatbotResponse {
  success: boolean;
  response?: string;
  error?: string;
  sessionId?: string;
  messageId?: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    console.log(`🤖 [API-CHATBOT] ${req.method} request received from ${req.headers.get('origin') || 'unknown'}`);

    // Only allow POST requests
    if (req.method !== 'POST') {
      console.error('❌ [API-CHATBOT] Method not allowed:', req.method);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Method not allowed. Use POST.' 
        }),
        { 
          status: 405,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Parse and validate request body
    let requestData: ChatbotRequest;
    try {
      requestData = await req.json();
      console.log('🤖 [API-CHATBOT] Request data received:', {
        source: requestData.source,
        chatbotType: requestData.chatbotType,
        hasText: !!requestData.text,
        textLength: requestData.text?.length || 0,
        hasWebUserId: !!requestData.webUserId,
        hasPhoneNumber: !!requestData.phoneNumber,
        hasSessionId: !!requestData.sessionId
      });
    } catch (parseError) {
      console.error('❌ [API-CHATBOT] Failed to parse request JSON:', parseError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid JSON in request body' 
        }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Validate required fields
    if (!requestData.text || requestData.text.trim().length === 0) {
      console.error('❌ [API-CHATBOT] Missing or empty text field');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Text field is required and cannot be empty' 
        }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    if (!requestData.source || !['web', 'whatsapp'].includes(requestData.source)) {
      console.error('❌ [API-CHATBOT] Invalid source field:', requestData.source);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Source must be either "web" or "whatsapp"' 
        }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    if (!requestData.chatbotType || !['client', 'education', 'quiz'].includes(requestData.chatbotType)) {
      console.error('❌ [API-CHATBOT] Invalid chatbotType field:', requestData.chatbotType);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'ChatbotType must be "client", "education", or "quiz"' 
        }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Validate text length
    if (requestData.text.length > 4000) {
      console.error('❌ [API-CHATBOT] Text too long:', requestData.text.length);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Text message too long (max 4000 characters)' 
        }),
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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ [API-CHATBOT] Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Server configuration error' 
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
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Save incoming message to database
    console.log('💾 [API-CHATBOT] Saving incoming message to database');
    const { data: savedMessage, error: saveError } = await supabase
      .from('customer_conversations')
      .insert({
        phone_number: requestData.phoneNumber,
        web_user_id: requestData.webUserId,
        session_id: requestData.sessionId,
        source: requestData.source,
        content: requestData.text,
        sender: 'user',
        intent: requestData.chatbotType,
        user_agent: requestData.userAgent,
        created_at: requestData.timestamp || new Date().toISOString()
      })
      .select('id')
      .single();

    if (saveError) {
      console.error('❌ [API-CHATBOT] Error saving incoming message:', saveError);
      // Continue processing even if save fails
    } else {
      console.log('✅ [API-CHATBOT] Incoming message saved with ID:', savedMessage?.id);
    }

    // Get Groq client
    console.log('🧠 [API-CHATBOT] Creating Groq client');
    let groq;
    try {
      groq = await createGroqClient('system');
    } catch (groqError) {
      console.error('❌ [API-CHATBOT] Failed to create Groq client:', groqError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'AI service temporarily unavailable. Please try again later.' 
        }),
        { 
          status: 503,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Generate system prompt based on chatbot type
    let systemPrompt = '';
    switch (requestData.chatbotType) {
      case 'education':
        systemPrompt = `Vous êtes un assistant éducatif spécialisé dans l'aide aux étudiants.
Votre objectif est de fournir des explications claires et précises pour aider les étudiants dans leur apprentissage.
Soyez patient, encourageant et adaptez vos explications aux différents styles d'apprentissage.
Fournissez des solutions étape par étape quand c'est approprié.
${requestData.source === 'web' ? 'L\'étudiant vous contacte via le site web.' : 'L\'étudiant vous contacte via WhatsApp.'}`;
        break;
      case 'quiz':
        systemPrompt = `Vous êtes un maître de quiz qui crée des quiz éducatifs engageants.
Votre objectif est de rendre l'apprentissage amusant grâce à des questions et défis interactifs.
Soyez enthousiaste, encourageant et fournissez des commentaires informatifs.
${requestData.source === 'web' ? 'L\'utilisateur participe via le site web.' : 'L\'utilisateur participe via WhatsApp.'}`;
        break;
      default: // client
        systemPrompt = `Vous êtes un assistant de service client professionnel pour Airtel GPT.
Votre objectif est d'aider les clients avec leurs demandes, problèmes et questions.
Soyez professionnel, courtois et orienté solution.
Fournissez des instructions claires et demandez des clarifications si nécessaire.
Si vous ne pouvez pas résoudre un problème, proposez de l'escalader vers un agent humain.
Répondez toujours en français sauf si le client écrit dans une autre langue.
Gardez vos réponses concises mais complètes (maximum 500 mots).
${requestData.source === 'web' ? 'Le client vous contacte via le site web.' : 'Le client vous contacte via WhatsApp.'}`;
    }

    // Generate response using Groq
    console.log('🧠 [API-CHATBOT] Generating AI response');
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        { 
          role: "user", 
          content: requestData.text 
        }
      ],
      model: 'llama3-70b-8192',
      temperature: 0.7,
      max_tokens: 1500,
    });

    const response = completion.choices[0]?.message?.content || 
      "Je suis désolé, je n'ai pas pu générer une réponse appropriée. Un agent vous contactera bientôt.";

    // Validate and sanitize response
    let sanitizedResponse = response;
    if (sanitizedResponse.length > 4000) {
      console.warn('🎧 [API-CHATBOT] Response too long, truncating');
      sanitizedResponse = sanitizedResponse.substring(0, 3997) + '...';
    }

    // Remove any potential HTML/script content for security
    sanitizedResponse = sanitizedResponse
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();

    // Calculate response time
    const responseTime = (Date.now() - startTime) / 1000;
    console.log(`⏱️ [API-CHATBOT] Response generated in ${responseTime.toFixed(2)}s`);

    // Save bot response to database
    console.log('💾 [API-CHATBOT] Saving bot response to database');
    const { data: savedResponse, error: responseError } = await supabase
      .from('customer_conversations')
      .insert({
        phone_number: requestData.phoneNumber,
        web_user_id: requestData.webUserId,
        session_id: requestData.sessionId,
        source: requestData.source,
        content: sanitizedResponse,
        sender: 'bot',
        intent: requestData.chatbotType,
        response_time: responseTime,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (responseError) {
      console.error('❌ [API-CHATBOT] Error saving bot response:', responseError);
      // Continue even if save fails
    } else {
      console.log('✅ [API-CHATBOT] Bot response saved with ID:', savedResponse?.id);
    }

    // Return success response
    const successResponse: ChatbotResponse = {
      success: true,
      response: sanitizedResponse,
      sessionId: requestData.sessionId,
      messageId: savedResponse?.id
    };

    console.log('✅ [API-CHATBOT] Request processed successfully');
    return new Response(
      JSON.stringify(successResponse),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('❌ [API-CHATBOT] Critical error:', {
      message: error.message,
      stack: error.stack,
      source: requestData?.source,
      chatbotType: requestData?.chatbotType
    });
    
    // Return error response
    const errorResponse: ChatbotResponse = {
      success: false,
      error: error.message || 'An unexpected error occurred',
      sessionId: requestData?.sessionId
    };

    return new Response(
      JSON.stringify(errorResponse),
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