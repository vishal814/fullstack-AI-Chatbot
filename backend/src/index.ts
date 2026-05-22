import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { ingestLog, getDashboardMetrics } from './controllers/logController';
import {
  createConversation,
  listConversations,
  cancelConversation,
  getConversationMessages,
  sendMessage,
} from './controllers/chatController';
import prisma from './services/db';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

// Enable CORS for frontend requests
app.use(cors({
  origin: '*', // In development, allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Parse incoming JSON payloads
app.use(express.json());

// Logger middleware for incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Diagnostic health check
app.get('/health', async (req, res) => {
  try {
    // Verify database connectivity
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: 'healthy', database: 'connected' });
  } catch (error: any) {
    return res.status(500).json({ status: 'unhealthy', database: 'disconnected', error: error.message });
  }
});

// ==========================================
// Ingestion Pipeline & Analytics Routes
// ==========================================
app.post('/api/logs', ingestLog);
app.get('/api/metrics', getDashboardMetrics);

// ==========================================
// Chat & Conversation Routes
// ==========================================
app.post('/api/conversations', createConversation);
app.get('/api/conversations', listConversations);
app.post('/api/conversations/:id/cancel', cancelConversation);
app.get('/api/conversations/:id/messages', getConversationMessages);
app.post('/api/conversations/:id/messages', sendMessage);

// Start Server & Connect Database
const startServer = async () => {
  try {
    console.log('Connecting to database...');
    await prisma.$connect();
    console.log('Successfully connected to database.');

    app.listen(port, () => {
      console.log(`=================================================`);
      console.log(` LLM INGESTION PIPELINE BACKEND RUNNING ON PORT ${port}`);
      console.log(`=================================================`);
    });
  } catch (error) {
    console.error('Fatal: Failed to connect to database on startup:', error);
    process.exit(1);
  }
};

startServer();
