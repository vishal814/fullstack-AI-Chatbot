import { IngestionPayload } from '../types';

export interface LLMConfig {
  apiKey: string;
  provider: 'google' | 'openai';
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMRequestOptions {
  conversationId: string;
  messageId?: string;
  history?: { role: 'user' | 'model'; parts: { text: string }[] }[];
}

export class LLMSDK {
  private config: LLMConfig;
  private ingestionUrl: string;

  constructor(config: LLMConfig, ingestionUrl: string = 'http://localhost:8000/api/logs') {
    this.config = config;
    this.ingestionUrl = ingestionUrl;
  }

  /**
   * Generates content from the LLM, tracks performance, and logs metadata asynchronously.
   */
  async generateContent(prompt: string, options: LLMRequestOptions): Promise<string> {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();
    
    let responseText = '';
    let status: 'SUCCESS' | 'ERROR' = 'SUCCESS';
    let errorMessage: string | undefined;
    let inputTokens = 0;
    let outputTokens = 0;
    
    // Simplistic fallback token estimator (approx. 4 characters per token)
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);

    try {
      if (this.config.provider === 'google') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
        
        // Structure the request for Gemini multi-turn format if history is provided
        const contents = [];
        if (options.history && options.history.length > 0) {
          contents.push(...options.history);
        }
        contents.push({ role: 'user', parts: [{ text: prompt }] });

        const requestBody = {
          contents,
          generationConfig: {
            temperature: this.config.temperature ?? 0.7,
            maxOutputTokens: this.config.maxTokens ?? 1000,
          }
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as any;
          throw new Error(errorData.error?.message || `HTTP ${response.status} Error`);
        }

        const data = await response.json() as any;
        
        // Extract text response
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (!responseText) {
          throw new Error('Received empty response from Gemini API');
        }

        // Capture actual token counts from Gemini metadata if available, otherwise estimate
        inputTokens = data.usageMetadata?.promptTokenCount || estimateTokens(prompt);
        outputTokens = data.usageMetadata?.candidatesTokenCount || estimateTokens(responseText);

      } else if (this.config.provider === 'openai') {
        // Ready for future extension (Multi-provider bonus!)
        const url = 'https://api.openai.com/v1/chat/completions';
        const requestBody = {
          model: this.config.model,
          messages: [
            ...(options.history || []).map(h => ({
              role: h.role === 'model' ? 'assistant' : 'user',
              content: h.parts[0].text
            })),
            { role: 'user', content: prompt }
          ],
          temperature: this.config.temperature ?? 0.7,
          max_tokens: this.config.maxTokens ?? 1000,
        };

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as any;
          throw new Error(errorData.error?.message || `HTTP ${response.status} Error`);
        }

        const data = await response.json() as any;
        responseText = data.choices?.[0]?.message?.content || '';
        inputTokens = data.usage?.prompt_tokens || estimateTokens(prompt);
        outputTokens = data.usage?.completion_tokens || estimateTokens(responseText);
      } else {
        throw new Error(`Unsupported provider: ${this.config.provider}`);
      }

      return responseText;
    } catch (error: any) {
      status = 'ERROR';
      errorMessage = error.message || 'Unknown error occurred';
      responseText = `Error calling LLM: ${errorMessage}`;
      
      // Fallbacks for token count on error
      inputTokens = estimateTokens(prompt);
      outputTokens = 0;
      
      throw error;
    } finally {
      const endTime = performance.now();
      const latencyMs = Math.round(endTime - startTime);
      
      // Construct Ingestion Payload
      const payload: IngestionPayload = {
        conversationId: options.conversationId,
        messageId: options.messageId,
        provider: this.config.provider,
        model: this.config.model,
        latencyMs,
        inputTokens,
        outputTokens,
        status,
        errorMessage,
        inputPreview: prompt.length > 500 ? prompt.substring(0, 500) + '...' : prompt,
        outputPreview: responseText.length > 500 ? responseText.substring(0, 500) + '...' : responseText,
        timestamp,
      };

      // Fire ingestion payload asynchronously in the background (near real-time)
      this.fireIngestion(payload);
    }
  }

  /**
   * Sends the log payload to the ingestion endpoint without blocking the main LLM call.
   */
  private async fireIngestion(payload: IngestionPayload): Promise<void> {
    try {
      // Fire-and-forget request
      fetch(this.ingestionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(err => {
        console.error('[LLMSDK Log Pipeline Error]: Failed to ingest logs:', err);
      });
    } catch (err) {
      console.error('[LLMSDK Log Pipeline Error]: Failed to trigger fetch:', err);
    }
  }
}
