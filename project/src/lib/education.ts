import { supabase } from './supabase';
import { checkSubscriptionStatus } from './subscription'; 
import { createGroqClient } from './groq-config'; 

interface StudentProfile {
  id: string;
  phone_number: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  level: string;
  subjects: string[];
  preferred_language: string;
}

interface EducationSession {
  id: string;
  student_id: string;
  subject: string;
  topic?: string;
  start_time: Date;
  end_time?: Date;
  duration?: number;
  messages_count: number;
  questions_asked: number;
  correct_answers: number;
  comprehension_score: number;
}

interface MessageAnalysis {
  type: 'question' | 'answer' | 'explanation' | 'other';
  subject?: string;
  topic?: string;
  sentiment: number;
  complexity: number;
  understanding: number;
}

interface Message {
  phoneNumber: string;
  content: string;
  sender: 'user' | 'bot';
  imageUrl?: string;
}

export async function analyzeStudentMessage(message: string, studentId: string): Promise<MessageAnalysis> {
  try {
    // Get student profile to find user_id
    const { data: student } = await supabase
      .from('student_profiles')
      .select('user_id')
      .eq('id', studentId)
      .single();

    if (!student || !student.user_id) {
      throw new Error('Student profile not found or missing user_id');
    }

    // Create Groq client with user's API key
    const groq = await createGroqClient(student.user_id);

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are an education analyst. Analyze the following student message and provide:
            1. Message type (question/answer/explanation/other)
            2. Subject and topic if identifiable
            3. Sentiment score (-1 to 1)
            4. Complexity level (0 to 1)
            5. Understanding level (0 to 1)
            Format: JSON object with these fields.`
        },
        { role: 'user', content: message }
      ],
      model: 'mixtral-8x7b-32768',
      temperature: 0.3,
      max_tokens: 500,
    });

    const analysis = JSON.parse(completion.choices[0]?.message?.content || '{}');

    // Store analysis in database
    await supabase.from('education_analytics').insert({
      student_id: studentId,
      message_type: analysis.type,
      subject: analysis.subject,
      topic: analysis.topic,
      sentiment: analysis.sentiment,
      complexity_level: analysis.complexity,
      understanding_score: analysis.understanding
    });

    return analysis;
  } catch (error) {
    console.error('Error analyzing student message:', error);
    throw error;
  }
}

export async function analyzeStudentImage(imageUrl: string, studentId: string): Promise<MessageAnalysis> {
  try {
    // Get student profile to find user_id
    const { data: student } = await supabase
      .from('student_profiles')
      .select('user_id')
      .eq('id', studentId)
      .single();

    if (!student || !student.user_id) {
      throw new Error('Student profile not found or missing user_id');
    }

    // Create Groq client with user's API key
    const groq = await createGroqClient(student.user_id);

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are an education analyst. Analyze the following image sent by a student and provide:
            1. Message type (question/answer/explanation/other)
            2. Subject and topic if identifiable
            3. Sentiment score (-1 to 1) - use 0 if not applicable
            4. Complexity level (0 to 1)
            5. Understanding level (0 to 1) - use 0.5 if not applicable
            Format: JSON object with these fields.`
        },
        { 
          role: 'user', 
          content: [
            { 
              type: "text", 
              text: "Please analyze this educational image:" 
            },
            { 
              type: "image_url", 
              image_url: { url: imageUrl } 
            }
          ]
        }
      ],
      model: 'llama3-70b-8192',
      temperature: 0.3,
      max_tokens: 500,
    });

    const analysis = JSON.parse(completion.choices[0]?.message?.content || '{}');

    // Store analysis in database
    await supabase.from('education_analytics').insert({
      student_id: studentId,
      message_type: analysis.type || 'question',
      subject: analysis.subject,
      topic: analysis.topic,
      sentiment: analysis.sentiment || 0,
      complexity_level: analysis.complexity || 0.5,
      understanding_score: analysis.understanding || 0.5
    });

    return analysis;
  } catch (error) {
    console.error('Error analyzing student image:', error);
    // Return default analysis if error occurs
    return {
      type: 'question',
      subject: 'unknown',
      topic: 'unknown',
      sentiment: 0,
      complexity: 0.5,
      understanding: 0.5
    };
  }
}

export async function getOrCreateStudentProfile(phoneNumber: string): Promise<StudentProfile> {
  try {
    // Check if student exists
    const { data: existingStudent } = await supabase
      .from('student_profiles')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    if (existingStudent) {
      // Update last active timestamp
      await supabase
        .from('student_profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', existingStudent.id);

      return existingStudent;
    }

    // Create new student profile
    const { data: newStudent, error } = await supabase
      .from('student_profiles')
      .insert({
        phone_number: phoneNumber,
        level: '3ème', // Default level
        subjects: [],
        preferred_language: 'french'
      })
      .select()
      .single();

    if (error) throw error;
    return newStudent;
  } catch (error) {
    console.error('Error managing student profile:', error);
    throw error;
  }
}

export async function startEducationSession(studentId: string, subject: string): Promise<EducationSession> {
  try {
    const { data: session, error } = await supabase
      .from('education_sessions')
      .insert({
        student_id: studentId,
        subject: subject,
        start_time: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return session;
  } catch (error) {
    console.error('Error starting education session:', error);
    throw error;
  }
}

export async function updateSessionStats(
  sessionId: string,
  stats: Partial<EducationSession>
): Promise<void> {
  try {
    await supabase
      .from('education_sessions')
      .update(stats)
      .eq('id', sessionId);
  } catch (error) {
    console.error('Error updating session stats:', error);
    throw error;
  }
}

export async function getStudentAnalytics(studentId: string) {
  try {
    const { data: analytics } = await supabase
      .from('education_analytics')
      .select('*')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    const { data: sessions } = await supabase
      .from('education_sessions')
      .select('*')
      .eq('student_id', studentId)
      .order('start_time', { ascending: false });

    return {
      analytics,
      sessions,
      summary: calculateStudentSummary(analytics, sessions)
    };
  } catch (error) {
    console.error('Error fetching student analytics:', error);
    throw error;
  }
}

function calculateStudentSummary(analytics: any[], sessions: any[]) {
  // Calculate overall statistics and progress
  const totalSessions = sessions?.length || 0;
  if (totalSessions === 0) {
    return {
      totalSessions: 0,
      totalQuestions: 0,
      correctAnswers: 0,
      accuracy: 0,
      averageComprehension: 0,
      subjectProgress: {}
    };
  }

  const totalQuestions = sessions.reduce((sum, session) => sum + (session.questions_asked || 0), 0);
  const correctAnswers = sessions.reduce((sum, session) => sum + (session.correct_answers || 0), 0);
  const averageComprehension = sessions.reduce((sum, session) => sum + (session.comprehension_score || 0), 0) / totalSessions;

  // Calculate subject-specific progress
  const subjectProgress = sessions.reduce((acc: any, session) => {
    if (!acc[session.subject]) {
      acc[session.subject] = {
        sessions: 0,
        questions: 0,
        correct: 0,
        comprehension: 0
      };
    }
    
    acc[session.subject].sessions++;
    acc[session.subject].questions += session.questions_asked || 0;
    acc[session.subject].correct += session.correct_answers || 0;
    acc[session.subject].comprehension += session.comprehension_score || 0;
    
    return acc;
  }, {});

  return {
    totalSessions,
    totalQuestions,
    correctAnswers,
    accuracy: totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0,
    averageComprehension,
    subjectProgress
  };
}

export async function processCustomerMessage(message: Message): Promise<Message> {
  const startTime = Date.now();
  let groq;

  try {
    // Check if user has an active subscription
    const hasSubscription = await checkSubscriptionStatus(message.phoneNumber);
    
    // Get or create student profile
    const student = await getOrCreateStudentProfile(message.phoneNumber);

    // Get user_id from student profile or from profils_utilisateurs
    let userId = null;
    
    // First try to get from student_profiles if it has user_id
    if (student && student.user_id) {
      userId = student.user_id;
    } else {
      // Try to get from profils_utilisateurs
      const { data: userProfile } = await supabase
        .from('profils_utilisateurs')
        .select('id')
        .eq('phone_number', message.phoneNumber)
        .maybeSingle();
      
      if (userProfile) {
        userId = userProfile.id;
      }
    }

    if (!userId) {
      // If no user_id found, try to get any user with Groq config as fallback
      const { data: anyGroqConfig } = await supabase
        .from('user_groq_config')
        .select('user_id')
        .limit(1)
        .maybeSingle();
        
      if (anyGroqConfig) {
        userId = anyGroqConfig.user_id;
      } else {
        throw new Error('No user with Groq configuration found');
      }
    }

    // Create Groq client with user's API key
    groq = await createGroqClient(userId);

    // 1. Save the incoming message
    await supabase
      .from('customer_conversations')
      .insert([{
        phone_number: message.phoneNumber,
        content: message.content,
        sender: message.sender
      }]);

    // 2. Process based on message type
    if (message.imageUrl) {
      // Handle image message
      const analysis = await analyzeStudentImage(message.imageUrl, student.id);
      
      // Generate response using Groq
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are a teacher for ${student.level} students, specialized in ${analysis.subject || 'all subjects'}.
            Your goal is to help the student understand and progress.
            The student has sent an image. Analyze it carefully and provide a detailed, educational response.
            If it contains a problem or question, solve it step by step.
            If it's a diagram or chart, explain it thoroughly.
            Current understanding level: ${analysis.understanding}
            Subject complexity: ${analysis.complexity}
            Adapt your response accordingly.`
          },
          { 
            role: 'user', 
            content: [
              { 
                type: "text", 
                text: "Please analyze this image and provide an educational response:" 
              },
              { 
                type: "image_url", 
                image_url: { url: message.imageUrl } 
              }
            ]
          }
        ],
        model: 'llama3-70b-8192',
        temperature: 0.7,
        max_tokens: 2048,
      });

      const response = completion.choices[0]?.message?.content || "Je suis désolé, je n'ai pas pu analyser correctement cette image. Pourriez-vous envoyer une image plus claire ou poser votre question sous forme de texte ?";

      // 3. Save and return the response
      const responseTime = (Date.now() - startTime) / 1000;
      const botResponse: Message = {
        phoneNumber: message.phoneNumber,
        content: response,
        sender: 'bot'
      };

      await supabase
        .from('customer_conversations')
        .insert([{
          phone_number: botResponse.phoneNumber,
          content: botResponse.content,
          sender: botResponse.sender,
          intent: analysis.subject,
          response_time: responseTime
        }]);

      return botResponse;
    } else {
      // Handle text message
      // 2. Analyze the message
      const analysis = await analyzeStudentMessage(message.content, student.id);

      // 3. Generate response using Groq
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You are a teacher for ${student.level} students, specialized in ${analysis.subject || 'all subjects'}.
            Your goal is to help the student understand and progress.
            Current understanding level: ${analysis.understanding}
            Subject complexity: ${analysis.complexity}
            Adapt your response accordingly.`
          },
          { role: 'user', content: message.content }
        ],
        model: 'mixtral-8x7b-32768',
        temperature: 0.7,
        max_tokens: 2048,
      });

      const response = completion.choices[0]?.message?.content || "Je suis désolé, je n'ai pas pu générer une réponse appropriée.";

      // 4. Save and return the response
      const responseTime = (Date.now() - startTime) / 1000;
      const botResponse: Message = {
        phoneNumber: message.phoneNumber,
        content: response,
        sender: 'bot'
      };

      await supabase
        .from('customer_conversations')
        .insert([{
          phone_number: botResponse.phoneNumber,
          content: botResponse.content,
          sender: botResponse.sender,
          intent: analysis.subject,
          response_time: responseTime
        }]);

      return botResponse;
    }
  } catch (error) {
    console.error('Error processing education message:', error);
    return {
      phoneNumber: message.phoneNumber,
      content: "Désolé, je rencontre des difficultés techniques. Veuillez réessayer plus tard.",
      sender: 'bot'
    };
  }
}