import { Request, Response } from 'express';
import prisma from '../services/db';
import { LLMSDK } from '../sdk/llmWrapper';

// Get LLM API key and initialize LLM SDK dynamically based on environment configuration
const getLLMSDKInstance = () => {
  const provider = (process.env.LLM_PROVIDER || 'google').toLowerCase() as 'google' | 'openai';
  
  let apiKey = '';
  let model = '';

  if (provider === 'openai') {
    apiKey = process.env.OPENAI_API_KEY || '';
    model = process.env.OPENAI_MODEL || 'gpt-4o';
    if (!apiKey) {
      console.warn('[LLMSDK Warning]: OPENAI_API_KEY is not defined! Running OpenAI in simulated mode.');
    }
  } else {
    apiKey = process.env.GEMINI_API_KEY || '';
    model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    if (!apiKey) {
      console.warn('[LLMSDK Warning]: GEMINI_API_KEY is not defined! Running Gemini in simulated mode.');
    }
  }

  // We point the SDK to our ingestion endpoint in the same application
  return new LLMSDK(
    {
      apiKey: apiKey || 'SIMULATED_KEY',
      provider,
      model,
      temperature: 0.7,
      maxTokens: 1000,
    },
    `http://localhost:${process.env.PORT || 8000}/api/logs`
  );
};

/**
 * Create a new conversation session
 */
export const createConversation = async (req: Request, res: Response) => {
  try {
    const { title } = req.body;
    const conversation = await prisma.conversation.create({
      data: {
        title: title || 'New Chat Session',
        status: 'ACTIVE',
      },
    });
    return res.status(201).json(conversation);
  } catch (error) {
    console.error('[Chat Controller Error]: Failed to create conversation:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Retrieve all conversation sessions
 */
export const listConversations = async (req: Request, res: Response) => {
  try {
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return res.status(200).json(conversations);
  } catch (error) {
    console.error('[Chat Controller Error]: Failed to list conversations:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Cancel an active conversation session (prevents further prompts)
 */
export const cancelConversation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Check if conversation exists
    const conversation = await prisma.conversation.findUnique({
      where: { id },
    });
    
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    console.log(`[Chat Session] Cancelled conversation: ${id}`);
    return res.status(200).json(updated);
  } catch (error) {
    console.error('[Chat Controller Error]: Failed to cancel conversation:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Fetch all messages inside a specific conversation (to resume conversation)
 */
export const getConversationMessages = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    return res.status(200).json({
      conversationStatus: conversation.status,
      messages: conversation.messages,
    });
  } catch (error) {
    console.error('[Chat Controller Error]: Failed to fetch messages:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * Send a message inside a conversation, handle conversation history,
 * run the logging wrapper SDK, and write logs/messages.
 */
export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      return res.status(400).json({ success: false, message: 'Prompt content is required' });
    }

    // 1. Verify conversation status
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    if (conversation.status === 'CANCELLED') {
      return res.status(400).json({
        success: false,
        message: 'This conversation has been cancelled and cannot accept new messages.',
      });
    }

    // 2. Save the user's message to database
    const userMessage = await prisma.message.create({
      data: {
        conversationId: id,
        role: 'USER',
        content: prompt,
      },
    });

    // Update conversation's updatedAt timestamp
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    // 3. Format context history for LLM (only maintain short conversation context e.g., last 10 messages)
    const historyLimit = 10;
    const recentMessages = conversation.messages.slice(-historyLimit);
    
    const formattedHistory = recentMessages.map(msg => ({
      role: msg.role === 'USER' ? 'user' as const : 'model' as const,
      parts: [{ text: msg.content }],
    }));

    // 4. Invoke LLM SDK (Proxying)
    const sdk = getLLMSDKInstance();
    
    // Create pre-allocated ID for the upcoming assistant message to tie the logs perfectly
    const assistantMessageId = crypto.randomUUID();

    let aiResponse = '';
    
    try {
      const provider = (process.env.LLM_PROVIDER || 'google').toLowerCase() as 'google' | 'openai';
      const isSimulated = provider === 'openai' 
        ? (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'SIMULATED_KEY')
        : (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'SIMULATED_KEY');

      // If API key is not configured, fallback to simulation for easy local review
      if (isSimulated) {
        // Simulate a minor latency delay
        await new Promise(resolve => setTimeout(resolve, 800));
        
        const activeModel = provider === 'openai' 
          ? (process.env.OPENAI_MODEL || 'gpt-4o')
          : (process.env.GEMINI_MODEL || 'gemini-1.5-flash');

        aiResponse = `[Simulated ${provider === 'openai' ? 'OpenAI' : 'Gemini'} Response] I received your prompt: "${prompt}". Configure your ${provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY'} in the backend .env file to enable live responses!`;
        
        // Manual simulation of log ingestion in simulated mode
        const simulateLogUrl = `http://localhost:${process.env.PORT || 8000}/api/logs`;
        fetch(simulateLogUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: id,
            messageId: assistantMessageId,
            provider,
            model: activeModel,
            latencyMs: 800,
            inputTokens: Math.ceil(prompt.length / 4),
            outputTokens: Math.ceil(aiResponse.length / 4),
            status: 'SUCCESS',
            inputPreview: prompt,
            outputPreview: aiResponse,
            timestamp: new Date().toISOString(),
          }),
        }).catch(() => {});
      } else {
        aiResponse = await sdk.generateContent(prompt, {
          conversationId: id,
          messageId: assistantMessageId,
          history: formattedHistory,
        });
      }
    } catch (err: any) {
      // Create message for error representation
      aiResponse = `Failed to generate a completion: ${err.message || 'Unknown LLM Error'}`;
    }

    // 5. Save the assistant's message in the database (with the pre-allocated uuid)
    const assistantMessage = await prisma.message.create({
      data: {
        id: assistantMessageId,
        conversationId: id,
        role: 'ASSISTANT',
        content: aiResponse,
      },
    });

    // Update conversation updatedAt timestamp again
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    return res.status(200).json({
      userMessage,
      assistantMessage,
    });
  } catch (error) {
    console.error('[Chat Controller Error]: Send message failed:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
