# RAGaphene — Architecture

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Technology Stack](#technology-stack)
4. [Directory Structure](#directory-structure)
5. [Component Architecture](#component-architecture)
6. [State Management](#state-management)
7. [API Layer](#api-layer)
8. [Connector Layer](#connector-layer)
9. [Type System](#type-system)
10. [Configuration System](#configuration-system)
11. [Security](#security)
12. [Deployment](#deployment)
13. [Testing](#testing)

---

## Overview

RAGaphene is a Next.js and React application for building, evaluating, and analyzing Retrieval-Augmented Generation (RAG) systems. It follows a three-stage lifecycle:

```
Data  →  Evaluate  →  Analyze
```

| Stage | Purpose |
|-------|---------|
| **Data** | Create and curate multi-turn conversation datasets with subject-matter-expert annotation |
| **Evaluate** | Run RAG pipelines and LLM judges against curated datasets |
| **Analyze** | Export results to InspectorRAGet for performance benchmarking |

---

## System Architecture

```
┌──────────────────────────────────────────────┐
│                Client (Browser)               │
│  React components                              │
│  Context providers: Session (NextAuth),        │
│    Theme, Notification, Configuration          │
└──────────────┬─────────────────────────────────┘
               │  HTTPS + NextAuth session cookie
               ▼
┌──────────────────────────────────────────────┐
│           Next.js Server (Node.js)             │
│  REST API routes                               │
│  withErrorHandler middleware                   │
│  Zod request validation                        │
│  Connector / adapter layer                     │
│    Generators (5)      Retrievers (4)          │
└──────┬─────────────────────────────────────────┘
       │
  ┌────┴─────────────────────────────┐
  ▼                                   ▼
LLM services                 Data sources / storage
WatsonX.AI, OpenAI,          Local Documents,
Anthropic, Gemini,           Elasticsearch (ELSER),
Ollama                       MongoDB, Cloudant
```

### Request lifecycle

A typical request flows through the following layers:

```
User action → React component state update
  → fetch() to a Next.js API route
    → withErrorHandler wrapper
      → Zod schema validation
        → getServerSession() authentication check
          → load() configuration (cached)
            → getGenerator() / getRetriever() factory
              → connector.generate() / connector.retrieve()
                → Response.json()
  → component re-render
```

---

## Technology Stack

### Frontend

| Layer | Technology |
|-------|-----------|
| Framework | Next.js (App Router) |
| UI | React |
| Design system | IBM Carbon (`@carbon/react`) |
| Styling | SCSS Modules with Carbon tokens |
| Language | TypeScript |
| Charts | `@carbon/charts-react` |

### Backend and runtime

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js (≥ 22.14) |
| Authentication | NextAuth.js |
| Validation | Zod |
| Elasticsearch | `@elastic/elasticsearch` |
| MongoDB | `mongodb` |
| Cloudant | `@ibm-cloud/cloudant` |
| WatsonX.AI | `@ibm-generative-ai/node-sdk` |
| OpenAI | `openai` |

### Development tooling

- **Lint:** ESLint with the Next.js plugin
- **Format:** Prettier
- **Style lint:** Stylelint
- **Git hooks:** Husky
- **Tests:** Jest with ts-jest

---

## Directory Structure

```
RAGaphene/
├── public/                     # Static assets (images, fonts)
├── src/
│   ├── app/
│   │   ├── api/                # REST API routes
│   │   │   ├── auth/[...nextauth]/
│   │   │   │   ├── options.ts  # authOptions (NextAuth config)
│   │   │   │   └── route.ts    # GET / POST handlers
│   │   │   ├── messages/       # POST — text and chat completion
│   │   │   ├── models/         # GET  — list generator models
│   │   │   ├── collections/    # GET  — list retriever collections
│   │   │   ├── queries/        # POST — semantic search
│   │   │   ├── ingest/         # POST — index uploaded local documents
│   │   │   ├── conversations/  # POST — save conversation
│   │   │   ├── evaluations/    # GET + POST — run evaluation
│   │   │   ├── issues/         # POST — report issue (GitHub)
│   │   │   ├── configuration/  # GET  — sanitized system config
│   │   │   ├── credentials/    # GET + POST — connector credentials
│   │   │   ├── middleware/
│   │   │   │   ├── errorHandler.ts  # withErrorHandler + typed error classes
│   │   │   │   └── validation.ts    # validateBody / validateQuery
│   │   │   └── schemas/        # Zod schemas (one per endpoint)
│   │   ├── data/create/        # Create workflow page
│   │   ├── data/review/        # Review workflow page
│   │   ├── experiment/         # Experiment page
│   │   ├── layout.tsx          # Root layout (providers)
│   │   ├── page.tsx            # Home
│   │   └── global.scss
│   │
│   ├── components/             # React components (all 'use client')
│   │   ├── analyzer/           # Analysis view
│   │   ├── chatline/           # Single chat message
│   │   ├── conversation-viewer/
│   │   ├── documents/          # Document viewer
│   │   ├── experience-settings/# Generator and retriever settings panels
│   │   ├── experiment/         # Experiment runner
│   │   ├── login/              # Auth UI
│   │   ├── metrics/            # Carbon charts metrics
│   │   ├── pipeline-builder/   # Pipeline configuration
│   │   ├── reviewer/           # Review workflow UI
│   │   └── settings/           # App settings panel
│   │
│   ├── common/
│   │   ├── connectors/
│   │   │   ├── generator.ts    # ActiveGenerator base + implementations
│   │   │   └── retriever.ts    # ActiveRetriever base + implementations
│   │   ├── state/              # React Context providers
│   │   ├── utilities/          # Helper modules
│   │   │   ├── configuration.ts# Config load/sanitize (module-level cache)
│   │   │   ├── connectorCache.ts# Cache for models and collections lists
│   │   │   ├── credentials.ts  # Client-side credential storage
│   │   │   ├── localIndex.ts   # Local Documents ingestion and search
│   │   │   ├── messages.ts     # generate / chat / sendMessage helpers
│   │   │   ├── migration.ts    # v1→v2 conversation schema migration
│   │   │   ├── search.ts       # retrieve() helper
│   │   │   ├── logger.ts       # Flat-file and console logger
│   │   │   └── validators.ts   # UI-layer input validation
│   │   └── data/               # Sample JSON fixtures
│   │
│   ├── config/
│   │   └── system.ts           # System configuration (TypeScript module)
│   │
│   ├── styles/                 # Shared SCSS partials
│   │
│   └── views/                  # Page-level components
│       ├── home/
│       ├── create/
│       ├── review/
│       └── experiment/
│
├── types/
│   ├── custom.ts               # Shared TypeScript type definitions
│   └── next-auth.d.ts          # NextAuth session type extensions
├── docs/
│   └── architecture.md         # This file
├── .env.example                # Environment variable template
├── jest.config.js
├── next.config.js
├── tsconfig.json
└── package.json
```

---

## Component Architecture

### Provider stack (`src/app/layout.tsx`)

```tsx
<SessionProvider>            // NextAuth — user identity and auth state
  <ThemeProvider>            // Carbon g10/g90 theme toggle
    <NotificationProvider>   // Toast queue (show/clear)
      <ConfigurationProvider>// System config fetched once on mount
        {children}
      </ConfigurationProvider>
    </NotificationProvider>
  </ThemeProvider>
</SessionProvider>
```

### Component hierarchy (simplified)

```
Home page
Create page
  └── Configure view  (generator + retriever selection)
  └── Create view
        ├── ExperienceSettings  (model parameters, mode toggle)
        ├── ChatLine (per message)
        ├── DocumentsViewer
        └── ConversationViewer

Review page
  └── Reviewer  (split pane, annotation, export)

Experiment page
  └── Configure view  (pipeline builder)
  └── Experiment view
        ├── Runner  (execute evaluations)
        └── Metrics (Carbon charts)
```

### Client and server split

Interactive components are `'use client'`. Server-rendered code is limited to
the root layout, the `page.tsx` files, and the API route handlers.

---

## State Management

### Global state (Context providers)

| Context | What it holds |
|---------|--------------|
| `SessionProvider` | User identity and auth status (NextAuth) |
| `ThemeProvider` | Current Carbon theme (g10/g90) |
| `NotificationProvider` | Toast message queue |
| `ConfigurationProvider` | Sanitized system config from `/api/configuration` |

### Local component state

Each major component manages its own state with `useState` hooks. The current
complexity does not warrant a dedicated state-management library.

---

## API Layer

Every route is wrapped with `withErrorHandler`, which provides automatic logging
and typed error responses, and validates its inputs with a Zod schema.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/messages` | Text completion or chat completion (selected by the `mode` field) |
| `GET`  | `/api/models` | List models for a generator |
| `GET`  | `/api/collections` | List collections for a retriever |
| `POST` | `/api/queries` | Semantic search against a retriever |
| `POST` | `/api/ingest` | Index uploaded documents for the Local Documents retriever |
| `POST` | `/api/conversations` | Persist a conversation to the data store |
| `GET`/`POST` | `/api/evaluations` | Check status or run the evaluation pipeline |
| `POST` | `/api/issues` | Proxy issue creation to GitHub |
| `GET`  | `/api/configuration` | Return sanitized system config (credentials stripped) |
| `GET`/`POST` | `/api/credentials` | Read or store connector credentials in the session |
| `POST` | `/api/auth/[...nextauth]` | NextAuth sign-in, sign-out, and session |

### `/api/messages` request shape

```ts
// Text completion
{ mode: "completion", generator: string, model_id: string,
  input: string, parameters?: Record<string, unknown> }

// Chat completion
{ mode: "chat_completion", generator: string, model_id: string,
  conversation: Message[], documents?: Document[],
  system_instruction?: string, context_template?: string,
  parameters?: Record<string, unknown> }
```

Wire-format message construction for each provider is done server-side inside
the connector's `chat()` method. Clients send raw application data.

### Error response format

```json
{
  "error": {
    "message": "Human-readable description",
    "code": "VALIDATION_ERROR",
    "details": {},
    "timestamp": "2026-01-01T00:00:00.000Z",
    "path": "/api/messages"
  }
}
```

HTTP status codes: 400 (validation), 401 (unauthenticated), 403 (forbidden),
404 (not found), 409 (conflict), 429 (rate limit), 503 (external service error).

---

## Connector Layer

The connector layer is the extension point of the application. Every LLM and
retriever provider implements a common interface, so adding a new provider does
not touch the UI or the API routes.

### Generator connectors (`src/common/connectors/generator.ts`)

An abstract base class, `ActiveGenerator`, with five concrete implementations:

| Class | Provider | Modes |
|-------|---------|-------|
| `WatsonXAI` | IBM WatsonX.AI | completion, chat_completion |
| `OpenAI` | OpenAI and compatible | completion, chat_completion |
| `AnthropicGenerator` | Anthropic | chat_completion |
| `GeminiGenerator` | Google Gemini | chat_completion |
| `OllamaGenerator` | Ollama (local) | completion, chat_completion |

Each connector declares its `supported_modes`. The UI's mode toggle is gated on
this field, so unsupported modes are hidden.

Connectors are instantiated per request rather than kept as singletons. This
keeps concurrent requests that use different user credentials isolated from one
another.

### Adding a new generator

1. Extend `ActiveGenerator` in `generator.ts`:

   ```ts
   class MyLLM extends ActiveGenerator {
     supported_modes = ['completion', 'chat_completion'];

     constructor(endpoint: string, api_key: string) {
       super();
       this.client = new MyLLMClient({ endpoint, apiKey: api_key });
     }

     async getModels(): Promise<Model[]> { /* ... */ }
     async generate(model_id, input, parameters): Promise<{}> { /* ... */ }
     async chat(model_id, messages, documents, parameters): Promise<{}> { /* ... */ }
   }
   ```

2. Add a branch to the `getGenerator()` factory function.
3. Add the connector entry to `src/config/system.ts`.

### Retriever connectors (`src/common/connectors/retriever.ts`)

An abstract base class, `ActiveRetriever`, with four concrete implementations:

| Class | Provider |
|-------|----------|
| `Local` | Local Documents (in-process, no external service) |
| `Elastic` | Elasticsearch (ELSER) |
| `MongoDB` | MongoDB |
| `Cloudant` | IBM Cloudant |

Each exposes:

- `getCollections(): Promise<string[]>`
- `retrieve(collection, query, top_k): Promise<Document[]>`

New retrievers follow the same pattern as generators: extend `ActiveRetriever`,
add a branch to `getRetriever()`, and register the connector in
`src/config/system.ts`.

---

## Type System

Types in `types/custom.ts` are organized in three layers to keep configuration,
runtime state, and persisted data distinct:

| Layer | Types | Purpose |
|-------|-------|---------|
| **System config** | `RetrieverConfig`, `GeneratorConfig` | Connector definitions in `src/config/system.ts`, including full credentials and settings. Never sent to the client as-is. |
| **Runtime session** | `ActiveRetriever`, `ActiveGenerator` | Objects used during an active conversation. Include a connector back-reference and mutable `settings`. |
| **Persisted JSON** | `RetrieverSnapshot`, `GeneratorSnapshot` | Credential-free snapshots stored in saved conversation JSON, produced by `formatRetriever()` and `formatGenerator()`. |

```
RetrieverConfig  ──────────────────────────────►  RetrieverSnapshot
(system config)      formatRetriever()             (saved JSON, no creds)
      │
      └──► ActiveRetriever  (runtime: + collection + mutable settings)
```

### Conversation schema versioning

Saved conversations carry a `schema_version` field. `migrateConversation()` in
`src/common/utilities/migration.ts` upgrades legacy files automatically on load:

| Version | Shape |
|---------|-------|
| v1 (legacy) | `retriever.parameters`, `query_syntax` as a JSON string, `project` field map, `generator.prompt` and `generator.parameters` at the top level |
| v2 (current) | `retriever.settings`, `query_syntax` as an object, `templates.{projection,display}`, `generator.settings.{prompt,parameters}`, `generator.mode` |

---

## Configuration System

### Source of truth

System configuration lives in `src/config/system.ts` as a TypeScript module. It
is imported directly rather than parsed from an environment variable, which
gives compile-time type safety.

### Schema overview

```ts
interface SystemConfiguration {
  authenticator: { enabled: boolean; provider: 'credentials' | 'oauth' | 'github' };
  retrievers: RetrieverConfig[];
  generators: GeneratorConfig[];
  plugins?: PluginConfig[];
}

interface GeneratorConfig {
  name: string;
  provider: string;      // 'IBM' | 'OpenAI' | 'Anthropic' | 'Google' | 'Ollama'
  endpoint?: string;
  credentials: {
    provider: 'client' | 'server';
    // server credentials also declare env var names (env_api_key, env_project_id, ...)
  };
  settings: {
    supported_modes: string[];
    configurable: boolean;
    prompt: { template; system_instruction; input; context };
    parameters: Record<string, unknown>;
  };
}
```

### Credential resolution

Credentials are resolved per connector at load time:

```
All declared env_* fields present in process.env
    → inject values, return provider: 'server'  (no browser prompt)

Any env_* field missing
    → return provider: 'client'  (user supplies the key in the browser)
    → env_* fields stripped from the output before it reaches the client
```

Ollama and Local Documents are always `provider: 'client'` because they need no
server-side secret.

### Configuration caching

`load()` in `configuration.ts` caches the parsed configuration at the module
level. It is parsed once per process and refreshed only by a server restart.

---

## Security

| Control | Mechanism |
|---------|-----------|
| Authentication | NextAuth.js — username/password (credentials), GitHub OAuth, or generic OIDC |
| Session | Encrypted JWT in an HTTP-only cookie (via NextAuth) |
| Credential storage | Connector API keys are stored in the NextAuth session, never sent in an Authorization header or exposed in the browser Network tab |
| Input validation | Zod schemas on every API endpoint |
| Error handling | Centralized middleware — internal details are not leaked in production responses |
| Config sanitization | `load(true)` strips credentials and endpoints before returning config to the browser |

---

## Deployment

### Environment variables

```bash
# Required
NEXTAUTH_URL=https://your-domain.com
NEXTAUTH_SECRET=<openssl rand -base64 32>

# Authentication provider
AUTH_PROVIDER=credentials        # credentials | github | oauth
AUTH_USERNAME=<demo user>        # for the credentials provider
AUTH_PASSWORD=<demo password>
AUTH_CLIENT_ID=<oauth client id>        # for github / oauth
AUTH_CLIENT_SECRET=<oauth client secret>

# Per-connector server credentials (optional; omit to use client-supplied keys)
WATSONX_API_KEY=...
WATSONX_PROJECT_ID=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
GEMINI_API_KEY=...

# Logging
LOG_DIR=./logs   # default
```

### Local development

For the default local path, run over HTTP:

```bash
npm install
npm run setup   # writes .env.local with a generated secret and demo login
npm run dev     # starts on http://localhost:3000
```

OAuth providers redirect back over HTTPS, so local OAuth needs a TLS proxy.
Generate a locally-trusted certificate with mkcert, set
`NEXTAUTH_URL=https://localhost:3000`, and run the HTTPS proxy:

```bash
mkdir keys && cd keys && mkcert localhost
npm run dev:https   # HTTPS proxy on :3000 → Next.js on :3001
```

### Production build

```bash
npm run build   # produce the optimized production build
npm run start   # serve it on :3000
```

### Scaling notes

- API routes are stateless, so horizontal scaling is safe.
- The NextAuth session is JWT-based (stateless); no shared session store is needed.
- MongoDB, Cloudant, and Elasticsearch are scaled independently.
- Logs are written to `./logs/`; forward them with a log shipper in production.

---

## Testing

Tests run on Jest with ts-jest. All tests run offline: external SDKs (WatsonX,
OpenAI, Elasticsearch, MongoDB, Cloudant) are mocked at the module level, so the
suite makes no live API calls.

```bash
npm test                # run all tests
npm run test:watch      # watch mode
npm run test:coverage   # coverage report
```

Server-side code (middleware, utilities, connectors, and API routes) is covered
by the suite.
