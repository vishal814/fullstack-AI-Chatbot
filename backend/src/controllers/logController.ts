import { Request, Response } from 'express';
import { EventEmitter } from 'events';
import { z } from 'zod';
import prisma from '../services/db';
import { DashboardMetrics } from '../types';

// Central Event Emitter for Ingestion Pipeline
const IngestionEmitter = new EventEmitter();
const ingestionQueue: any[] = [];

// Regex-based PII Redactor for privacy compliance
export const redactPII = (text: string): string => {
  if (!text) return text;
  
  // 1. Email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  
  // 2. Phone Numbers (matches international and standard local formats like 123-456-7890, +1 (123) 456-7890)
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  
  // 3. Credit Cards (16-digit spaced sequences)
  const cardRegex = /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g;
  
  // 4. SSNs (Social Security Numbers)
  const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b|\b\d{9}\b/g;

  return text
    .replace(emailRegex, '[REDACTED_EMAIL]')
    .replace(phoneRegex, '[REDACTED_PHONE]')
    .replace(cardRegex, '[REDACTED_CARD]')
    .replace(ssnRegex, '[REDACTED_SSN]');
};

// Event subscriber that processes and redacts logs before pushing to buffer
IngestionEmitter.on('log.received', (logData: any) => {
  try {
    // Redact sensitive inputs/outputs for PII compliance before saving
    logData.inputPreview = redactPII(logData.inputPreview);
    logData.outputPreview = redactPII(logData.outputPreview);
    
    ingestionQueue.push(logData);
  } catch (err) {
    console.error('[Ingestion Event Subscriber Error]:', err);
  }
});

// Periodic Batch Flush Worker (Heartbeat) - Writes queued logs every 1000ms
setInterval(async () => {
  if (ingestionQueue.length === 0) return;

  const batch = [...ingestionQueue];
  ingestionQueue.length = 0; // Clear immediately to capture incoming logs

  try {
    console.log(`[Event Ingestion Worker] Flushing batch of ${batch.length} logs to database...`);
    
    await prisma.inferenceLog.createMany({
      data: batch.map((item: any) => ({
        conversationId: item.conversationId,
        messageId: item.messageId || null,
        provider: item.provider,
        model: item.model,
        latencyMs: item.latencyMs,
        inputTokens: item.inputTokens,
        outputTokens: item.outputTokens,
        status: item.status,
        errorMessage: item.errorMessage || null,
        inputPreview: item.inputPreview,
        outputPreview: item.outputPreview,
        timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
      })),
    });

    console.log(`[Event Ingestion Worker] Ingested ${batch.length} logs successfully.`);
  } catch (error) {
    console.error('[Event Ingestion Worker Error]: Failed to save batch logs:', error);
    // Push logs back to queue to ensure no data loss
    ingestionQueue.push(...batch);
  }
}, 1000);

// Zod schema for ingestion payload validation
const logSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
  provider: z.string(),
  model: z.string(),
  latencyMs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  status: z.enum(['SUCCESS', 'ERROR']),
  errorMessage: z.string().optional(),
  inputPreview: z.string(),
  outputPreview: z.string(),
  timestamp: z.string().datetime().optional(),
});

/**
 * Handle log ingestion pipeline requests from the SDK (Async, Event-Driven)
 */
export const ingestLog = async (req: Request, res: Response) => {
  try {
    const validatedData = logSchema.parse(req.body);
    
    // Asynchronous ingestion: Emit event and instantly return 202 Accepted
    IngestionEmitter.emit('log.received', validatedData);

    return res.status(202).json({ success: true, message: 'Log accepted and queued' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      console.error('[Ingestion Pipeline Validation Error]:', error.errors);
      return res.status(400).json({ success: false, errors: error.errors });
    }
    console.error('[Ingestion Pipeline Server Error]:', error);
    return res.status(500).json({ success: false, message: 'Internal Ingestion Error' });
  }
};

/**
 * Fetch aggregated statistics and metrics to feed the frontend dashboard
 */
export const getDashboardMetrics = async (req: Request, res: Response) => {
  try {
    // 1. Core Summary Stats
    const totalRequests = await prisma.inferenceLog.count();
    
    const avgLatencyResult = await prisma.inferenceLog.aggregate({
      _avg: {
        latencyMs: true,
      },
    });
    const averageLatencyMs = Math.round(avgLatencyResult._avg.latencyMs || 0);

    const tokenSumResult = await prisma.inferenceLog.aggregate({
      _sum: {
        inputTokens: true,
        outputTokens: true,
      },
    });
    const totalTokens = (tokenSumResult._sum.inputTokens || 0) + (tokenSumResult._sum.outputTokens || 0);

    const errorCount = await prisma.inferenceLog.count({
      where: { status: 'ERROR' },
    });
    const errorRate = totalRequests > 0 ? parseFloat((errorCount / totalRequests).toFixed(4)) : 0;

    // 2. Model Specific Aggregations
    const modelGroupStats = await prisma.inferenceLog.groupBy({
      by: ['model'],
      _count: {
        _all: true,
      },
      _avg: {
        latencyMs: true,
      },
    });

    const modelStats = modelGroupStats.map((stat: any) => ({
      model: stat.model,
      count: stat._count._all,
      avgLatency: Math.round(stat._avg.latencyMs || 0),
    }));

    // 3. Historical Trends (Last 20 records chronologically to showcase near real-time changes)
    const recentLogs = await prisma.inferenceLog.findMany({
      take: 20,
      orderBy: { timestamp: 'desc' },
      select: {
        timestamp: true,
        latencyMs: true,
        inputTokens: true,
        outputTokens: true,
        status: true,
      },
    });

    // Reverse to show left-to-right (chronological) order in the charts
    const chronologicalLogs = [...recentLogs].reverse();

    const latencyHistory = chronologicalLogs.map(log => ({
      time: new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      latency: log.latencyMs,
    }));

    const tokensHistory = chronologicalLogs.map(log => ({
      time: new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      tokens: log.inputTokens + log.outputTokens,
    }));

    // Calculate rolling error rates or simple timelines
    let totalProcessed = 0;
    let errorProcessed = 0;
    const errorRateHistory = chronologicalLogs.map(log => {
      totalProcessed++;
      if (log.status === 'ERROR') errorProcessed++;
      return {
        time: new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        errorRate: parseFloat((errorProcessed / totalProcessed).toFixed(4)),
      };
    });

    // 4. Calculate Requests/Second Throughput History (last 30 seconds)
    const now = Date.now();
    const thirtySecondsAgo = new Date(now - 30 * 1000);
    const throughputLogs = await prisma.inferenceLog.findMany({
      where: {
        timestamp: {
          gte: thirtySecondsAgo,
        },
      },
      select: {
        timestamp: true,
      },
    });

    const throughputHistory = [];
    for (let i = 29; i >= 0; i--) {
      const secTime = now - i * 1000;
      const secDate = new Date(secTime);
      const timeLabel = secDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      const count = throughputLogs.filter((log: { timestamp: Date }) => {
        const logTime = new Date(log.timestamp).getTime();
        return logTime >= secTime && logTime < secTime + 1000;
      }).length;

      throughputHistory.push({
        time: timeLabel,
        throughput: count,
      });
    }

    // 5. Recent Redacted Database Logs (Retrieve last 50 entries)
    const recentLogsGrid = await prisma.inferenceLog.findMany({
      take: 50,
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        conversationId: true,
        messageId: true,
        provider: true,
        model: true,
        latencyMs: true,
        inputTokens: true,
        outputTokens: true,
        status: true,
        errorMessage: true,
        inputPreview: true,
        outputPreview: true,
        timestamp: true,
      },
    });

    const metrics: DashboardMetrics = {
      totalRequests,
      averageLatencyMs,
      totalTokens,
      errorRate,
      latencyHistory,
      tokensHistory,
      errorRateHistory,
      throughputHistory,
      modelStats,
      recentLogs: recentLogsGrid,
    };

    return res.status(200).json(metrics);
  } catch (error) {
    console.error('[Metrics Controller Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch dashboard metrics' });
  }
};
