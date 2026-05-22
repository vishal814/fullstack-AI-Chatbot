import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../services/db';
import { DashboardMetrics } from '../types';

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
 * Handle log ingestion pipeline requests from the SDK
 */
export const ingestLog = async (req: Request, res: Response) => {
  try {
    const validatedData = logSchema.parse(req.body);
    
    // Extract metadata and insert log into the database
    const log = await prisma.inferenceLog.create({
      data: {
        conversationId: validatedData.conversationId,
        messageId: validatedData.messageId || null,
        provider: validatedData.provider,
        model: validatedData.model,
        latencyMs: validatedData.latencyMs,
        inputTokens: validatedData.inputTokens,
        outputTokens: validatedData.outputTokens,
        status: validatedData.status,
        errorMessage: validatedData.errorMessage || null,
        inputPreview: validatedData.inputPreview,
        outputPreview: validatedData.outputPreview,
        timestamp: validatedData.timestamp ? new Date(validatedData.timestamp) : new Date(),
      },
    });

    console.log(`[Ingestion Pipeline] Successfully saved log: ${log.id} (Status: ${log.status})`);
    return res.status(201).json({ success: true, logId: log.id });
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

    const metrics: DashboardMetrics = {
      totalRequests,
      averageLatencyMs,
      totalTokens,
      errorRate,
      latencyHistory,
      tokensHistory,
      errorRateHistory,
      modelStats,
    };

    return res.status(200).json(metrics);
  } catch (error) {
    console.error('[Metrics Controller Error]:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch dashboard metrics' });
  }
};
