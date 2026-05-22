# Enterprise-Grade LLM Ingestion Pipeline & Chatbot Application

A high-performance, real-time logging, telemetry, and conversational platform designed for enterprise LLM operations. This system integrates an asynchronous, event-driven log ingestion queue, real-time telemetry charting, an automated pre-save regulatory PII redaction filter, and a premium chat interface featuring live **Server-Sent Events (SSE)** response streaming.

---

## 🚀 Key Architectural Upgrades

This platform has been elevated from a basic MVP to an enterprise-ready pipeline with the following key components:

1. **Live SSE Streaming UI:** Leverages Server-Sent Events (`text/event-stream`) to output incremental tokens from the LLM. The React frontend processes these streams in real-time using standard `TextDecoder` and `ReadableStream` readers.
2. **Decoupled Asynchronous Log Ingestion:** An high-throughput logging endpoint (`/api/logs`) immediately publishes events to a centralized Node.js `EventEmitter` queue and responds with `202 Accepted`. A background heartbeat daemon ticks every **1000ms** to batch process logs and run bulk-inserts (`createMany`) into the database, drastically slashing active DB connection overhead and query blockages.
3. **Regulatory PII Redaction Filter:** A pre-save automated Regex-based PII scrubber intercepts log inputs. It automatically identifies and masks sensitive patterns before writing to the database:
   - **Emails:** `user@domain.com` ➔ `[REDACTED_EMAIL]`
   - **Phone Numbers:** `(123) 456-7890` or `123-456-7890` ➔ `[REDACTED_PHONE]`
   - **Credit Cards:** `1234-5678-9012-3456` ➔ `[REDACTED_CARD]`
   - **SSNs:** `123-45-6789` ➔ `[REDACTED_SSN]`
4. **Telemetry & Dashboard Analytics:** A dynamic, premium dashboard featuring:
   - Rolling **30-second throughput** (Requests / Second) tracked in 1-second bin partitions.
   - Core operational indicators (Average Latency, Error Rates, Token Load distribution, and Model usage metrics).
   - **Compliance Audit Log Grid:** A live scrollable data grid showing recently captured logs with highlighted `[REDACTED]` tokens, proving regulatory data handling.
5. **Interactive Model Provider Toggle:** Select between **OpenAI (gpt-4o)** and **Gemini (gemini-1.5-flash)** dynamically inside the chat header. The system supports full live integration, or falls back to an offline simulated telemetry environment if API keys are omitted.

---

## 📊 System Architecture Flow

The following diagram illustrates the lifecycle of a prompt execution, live SSE stream rendering, non-blocking asynchronous event ingestion, and sliding-window dashboard metric updates:

```mermaid
graph TD
    %% Frontend and UI Layer
    subgraph Client [React Workspace - Port 3000]
        UI[Vite React Application]
        Dash[Telemetry Dashboard]
        Audit[Compliance Audit Grid]
    end

    %% Web Server Proxy
    subgraph Proxy [Static Web Proxy]
        Nginx[Nginx Reverse Proxy]
    end

    %% Backend Server Layout
    subgraph API [Express Service - Port 8000]
        Router[API Gateway & Router]
        SSE[SSE Stream Generator]
        LLM[Multi-Provider LLM Selector]
        Emitter[EventEmitter Queue Buffer]
        Worker[Heartbeat Worker 1000ms]
        PII[PII Redaction Engine]
    end

    %% Third-party LLM APIs
    subgraph LLM_APIs [AI Inference Services]
        OpenAI[OpenAI - gpt-4o]
        Gemini[Google Gemini - gemini-1.5-flash]
    end

    %% Database Engine
    subgraph Database [Postgres Database Cluster]
        DB[(Prisma PostgreSQL)]
    end

    %% Connections & Paths
    UI -->|1. Request Assets & API /api| Nginx
    Nginx -->|2. Route to Backend| Router
    Router -->|3. Establish SSE Connection| SSE
    SSE -->|4. Request Response| LLM
    LLM -->|5. Streams Chunks| OpenAI
    LLM -->|5. Streams Chunks| Gemini
    OpenAI -->|6. Token Stream| SSE
    Gemini -->|6. Token Stream| SSE
    SSE -->|7. Event stream chunks| UI

    %% Non-Blocking Log Pipeline
    SSE -.->|8. Fire-and-Forget Log| Router
    Router -.->|9. Push Event to Queue| Emitter
    Emitter -.->|10. Ingest & Flush Batch| Worker
    Worker -.->|11. Mask Sensitive Data| PII
    PII -.->|12. Prisma Bulk-Insert| DB

    %% Dashboard Telemetry Metrics
    Dash -->|13. Polls sliding metrics| Router
    Audit -->|14. Queries recent rows| Router
    Router -->|15. SQL Aggregations| DB
```

---

## 🗄️ Relational & Operational Database Schema

The PostgreSQL schema balances structured relational integrity for chat threads alongside high-performance indexing for high-velocity logging telemetry.

```mermaid
erDiagram
    CONVERSATIONS {
        uuid id PK
        string title
        string status "ACTIVE / ENDED"
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
        uuid conversationId FK "nullable"
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

    CONVERSATIONS ||--o{ MESSAGES : "contains"
    CONVERSATIONS ||--o{ INFERENCE_LOGS : "references"
    MESSAGES ||--o{ INFERENCE_LOGS : "tracks"
```

### Architectural Database Design Decisions
1. **Zero-Lock Decoupling:** Relational state components (`conversations`, `messages`) are strictly independent of analytical metrics (`inference_logs`). Operations on logs (purging, partition swaps, or indexing) will never interrupt or lock user chat sequences.
2. **Nullable Relations:** The `conversationId` and `messageId` keys in the telemetry table are fully nullable, meaning system diagnostics, batch scripts, and validation probes can route through the same pipeline without artificially creating chat shells.
3. **Database Performance Indexing:** Composite indices are implemented on `timestamp` and `status` to ensure sliding 30-second queries and aggregated rate computations execute in microsecond brackets, even under high-density loads.

---

## 🛠️ Local Development & Setup

Follow these steps to configure and run the backend API server and frontend React application locally.

### Prerequisites
- Node.js (v20 or higher)
- A PostgreSQL database instance (local or hosted on Neon/Supabase)

### Step 1: Configure Environment Files
Create a `.env` file within the `/backend` directory:
```bash
# Navigate to backend and clone configuration
cd backend
cp .env.example .env
```

Open `.env` and fill in your credentials:
```env
# Relational DB Connection string (e.g., hosted Postgres URL)
DATABASE_URL="postgresql://user:password@host:5432/dbname?sslmode=require"

# Server Execution Port
PORT=8000

# LLM Providers Configuration
# (If API keys are left blank, the platform automatically engages Simulation Mode!)
OPENAI_API_KEY="sk-proj-..."
OPENAI_MODEL="gpt-4o"

GEMINI_API_KEY="AIzaSy..."
GEMINI_MODEL="gemini-1.5-flash"
```

### Step 2: Set Up Database Schemas
Sync the Prisma database models directly to your PostgreSQL database:
```bash
# In the /backend directory
npm install
npm run prisma:generate
npm run prisma:push
```

### Step 3: Run the Services

#### Start Backend Service:
```bash
# Inside /backend directory
npm run dev
```
The server will boot and run on `http://localhost:8000`.

#### Start Frontend Client:
```bash
# In a new terminal workspace
cd frontend
npm install
npm run dev
```
The client dashboard and chatbot interface will be available at `http://localhost:3000`.

---

## 🐳 Multi-Container Orchestration (Docker Compose)

The workspace features a multi-container Docker Compose file (`docker-compose.yml`) which coordinates Postgres, the Node/Express backend pipeline, and the static frontend UI served behind Nginx.

To spin up the entire application locally with a **single command**:

```bash
# From the root directory
docker-compose up --build
```

### Architectural Benefits of This Orchestration:
- **Automatic Syncs:** The backend container initiates a health check on the Postgres database and runs `npx prisma db push` automatically to sync structures before opening the API gateway.
- **Nginx Reverse Proxy API Routing:** The frontend React container is packaged behind an **Nginx server** that intercepts static route queries and proxies `/api/*` endpoints directly to the backend container. This completely eliminates CORS issues and local origin configurations.

---

## ☸️ Self-Hosted Kubernetes (K8s) Deployment

The application features standard, production-ready Kubernetes manifests in the `/k8s/` directory to facilitate smooth self-hosted deployment.

### Folder Manifests Structure:
- `postgres.yaml`: Configures the database state, including a `PersistentVolumeClaim` (PVC), a `Deployment` pod, and an internal cluster service.
- `backend.yaml`: Provisions the Express API server pod, ConfigMaps for environment bindings, and an internal cluster service.
- `frontend.yaml`: Provisions the Nginx-hosted static React deployment pod and an internal cluster service.
- `ingress.yaml`: Provisions standard Ingress paths, mapping `/api` endpoints directly to the backend service and remaining requests to the static frontend.

### Deployment Walkthrough:

1. **Deploy Postgres Database:**
   ```bash
   kubectl apply -f k8s/postgres.yaml
   ```

2. **Deploy the Ingestion & Chat Backend:**
   *Note: Ensure to update the Database connection strings and API Keys inside the config handles inside the YAML before deploying.*
   ```bash
   kubectl apply -f k8s/backend.yaml
   ```

3. **Deploy the Frontend Client & Web Server:**
   ```bash
   kubectl apply -f k8s/frontend.yaml
   ```

4. **Expose Services via Ingress:**
   ```bash
   kubectl apply -f k8s/ingress.yaml
   ```

To monitor the status of the cluster deployments, run:
```bash
kubectl get pods,services,ingress -n default
```

---

## 🛡️ Regulatory Compliance & Verification
- **Verified Type Safety:** Complete compiler coverage checks (`npx tsc --noEmit`) run across both backend and frontend workspaces to maintain strict TypeScript schema safety.
- **Credential Hygiene:** Local environment files (`.env`) are strictly isolated and locked from git check-ins using rules established inside `.gitignore` files.
