export interface IngestionPayload {
  conversationId: string;
  messageId?: string;
  provider: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  status: 'SUCCESS' | 'ERROR';
  errorMessage?: string;
  inputPreview: string;
  outputPreview: string;
  timestamp?: string;
}

export interface ConversationResponse {
  id: string;
  title: string;
  status: 'ACTIVE' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageResponse {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: Date;
}

export interface DashboardMetrics {
  totalRequests: number;
  averageLatencyMs: number;
  totalTokens: number;
  errorRate: number;
  latencyHistory: {
    time: string;
    latency: number;
  }[];
  tokensHistory: {
    time: string;
    tokens: number;
  }[];
  errorRateHistory: {
    time: string;
    errorRate: number;
  }[];
  throughputHistory: {
    time: string;
    throughput: number;
  }[];
  modelStats: {
    model: string;
    count: number;
    avgLatency: number;
  }[];
  recentLogs: {
    id: string;
    conversationId: string;
    messageId?: string | null;
    provider: string;
    model: string;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    status: 'SUCCESS' | 'ERROR';
    errorMessage?: string | null;
    inputPreview: string;
    outputPreview: string;
    timestamp: Date | string;
  }[];
}

