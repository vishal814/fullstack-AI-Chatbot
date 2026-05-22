# LLM Ingestion Pipeline & Chatbot Application

A high-performance, real-time logging and ingestion system built for LLM applications. The system features a simple multi-turn chatbot interface, an ingestion pipeline that runs asynchronously in near-real-time, and a premium metrics dashboard visualizing key database metrics (latency, token usage, error rates, and model distributions).

---

## Technical Stack & Architecture

- **Frontend:** React, Vite, TypeScript, and custom Vanilla CSS (Obsidian dark-mode theme, glassmorphism, responsive native SVG charting).
- **Backend / Ingestion API:** Node.js, Express, TypeScript, and Zod (payload validation).
- **Database / ORM:** Hosted PostgreSQL (Neon / Supabase) interfaced using Prisma ORM.

### Architecture Flow

```mermaid
graph TD
    UI[React Web App - Port 3000] -->|1. Prompts & History| API[Express API Server - Port 8000]
    API -->|2. Relational Write| Message[Save User Message in DB]
    API -->|3. Call LLM via Wrapper SDK| Gemini[Gemini API - gemini-1.5-flash]
    Gemini -->|4. Completion Response| API
    API -->|5. Relational Write| AIResponse[Save Assistant Message in DB]
    
    %% Non-Blocking Ingestion
    API -.->|6. Asynchronous Background Post| Ingest["/api/logs Ingestion Pipeline"]
    Ingest -.->|7. Structured Row Insert| LogsTable[("PostgreSQL inference_logs Table")]

    %% Metrics Polling
    UI -->|8. Polls metrics every 5s| MetricsEndpoint["/api/metrics"]
    MetricsEndpoint -->|9. Reads Aggregations| LogsTable
    MetricsEndpoint -->|10. Live Graphs Refresh| UI
```

---

## Database Schema & Design Decisions

We chose **PostgreSQL** to balance structural integrity for conversation management with high-velocity, semi-structured data storage for LLM logging metadata.

### Entity Relationship Diagram
```mermaid
erDiagram
    CONVERSATIONS {
        uuid id PK
        string title
        string status "ACTIVE / CANCELLED"
        timestamp createdAt
        timestamp updatedAt
    }
    MESSAGES {
        uuid id PK
        uuid conversationId FK
        string role "USER / ASSISTANT"
        text content
        timestamp createdAt
    }
    INFERENCE_LOGS {
        uuid id PK
        uuid conversationId FK
        uuid messageId FK "nullable"
        string provider
        string model
        integer latencyMs
        integer inputTokens
        integer outputTokens
        string status "SUCCESS / ERROR"
        text errorMessage "nullable"
        text inputPreview
        text outputPreview
        timestamp timestamp
    }

    CONVERSATIONS ||--o{ MESSAGES : "has"
    CONVERSATIONS ||--o{ INFERENCE_LOGS : "logs"
    MESSAGES ||--o{ INFERENCE_LOGS : "references"
```

### Key Schema Decisions & Tradeoffs
1. **Separation of Concerns:** Relational states (`conversations` and `messages`) are strictly separated from operational telemetry (`inference_logs`). This ensures that purging or archiving logs for cost/retention reasons does not damage active user chat histories.
2. **Nullable Message Relationships:** `messageId` in `inference_logs` is nullable. This supports tracking system-level prompts, health check prompts, or batch model validations that might not be directly connected to an active chat bubble.
3. **Indexing Strategy:** We applied composite indices on `timestamp` and `status` in the `inference_logs` table. This dramatically speeds up sliding-window aggregations and failure rate queries for the dashboard.

---

## Architecture Notes

### 1. Ingestion Flow & Non-Blocking Design
The lightweight SDK wraps native API fetch calls. The round-trip duration is measured using microsecond-precision `performance.now()`. When a completion finishes (or throws an error), the SDK returns the text back to the active user *first*, and triggers a background HTTP `fetch` to `/api/logs` in a fire-and-forget promise block. This ensures that network lag in the logging database never increases user latency.

### 2. Failure Handling Assumptions
- **SDK Level:** If the ingestion server is down, the SDK catches the logging network exception silently, preventing a pipeline crash from breaking the chatbot.
- **Server Level:** The ingestion endpoint `/api/logs` uses Zod to reject poorly formed or corrupted payloads before hitting the database, maintaining database integrity.

### 3. Scaling Considerations (Production Upgrades)
To scale this to millions of requests per second:
1. **Message Queue (Ingestion Buffer):** Instead of hitting the PostgreSQL database directly, `/api/logs` should push payloads onto a Redis Stream or BullMQ queue. A cluster of worker nodes can read logs from the queue in batches (e.g., 500 records at a time) and execute SQL COPY or bulk inserts.
2. **Cold Logs Tiering:** Log data grows exponentially. In production, we would set up a PostgreSQL partition scheme (e.g., monthly partitions) and automatically move logs older than 90 days to a cheaper column-store like **ClickHouse** or an S3 cold glacier.

---

## Local Setup & Deployment Guide

### Prerequisites
- Node.js (v18 or higher)
- A free PostgreSQL database from [Neon.tech](https://neon.tech/) or [Supabase.com](https://supabase.com/)

---

### Step 1: Clone and Configure Environment

1. Inside `/backend`, create a `.env` file:
   ```bash
   cp .env.example .env
   ```
2. Open the `.env` file and input your hosted database URL and active LLM API credentials:
   ```env
   # Your hosted PostgreSQL connection string
   DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

   # Active Provider: "openai" or "google"
   LLM_PROVIDER="openai"

   # OpenAI Settings
   OPENAI_API_KEY="sk-..."
   OPENAI_MODEL="gpt-4o"

   # Google Gemini Settings (alternative)
   GEMINI_API_KEY="AIzaSy..."
   GEMINI_MODEL="gemini-1.5-flash"
   ```
   *(Note: If you leave your API key blank or undefined, the backend will automatically enter **Simulation Mode** using simulated responses and mock latency for your chosen provider, allowing you to review the pipeline dashboard completely offline!)*

---

### Step 2: Push Database Schema

Inside the `/backend` directory, run the following commands to install dependencies, generate Prisma Client, and sync the schema to your hosted PostgreSQL database:

```bash
cd backend
npm install
npm run prisma:generate
npm run prisma:push
```

*(This command maps out our Prisma schema and creates all SQL tables in your hosted database in seconds).*

---

### Step 3: Run the Application

#### Start the Backend API Server:
```bash
# Inside /backend
npm run dev
```
*(Runs backend server on `http://localhost:8000`)*

#### Start the Frontend React Web App:
```bash
# In a new terminal window
cd frontend
npm install
npm run dev
```
*(Runs frontend dev server on `http://localhost:3000`)*

Open your browser to `http://localhost:3000` to interact with your new premium LLM logging application!
