/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

// ===================================================================================
//                               CONFIGURATION
// ===================================================================================
export interface Credentials {
  provider: 'client' | 'server';
  username?: string;
  password?: string;
  api_key?: string;
  project_id?: string;
  database?: string;
  // Env var pointers (resolved at load time, never sent to client)
  env_api_key?: string;
  env_project_id?: string;
  env_username?: string;
  env_password?: string;
  env_database?: string;
}

export interface Connector {
  name: string;
  description?: string;
  endpoint?: string;
  env_endpoint?: string; // Env var pointer resolved at load time, never sent to client
  credentials: Credentials;
  provider?: string;
  // What kind of auth this connector needs to establish a connection.
  // 'token' = single API key, 'basic' = username/password, 'none' = no secret required.
  // Absent/undefined means auth is required (fail-safe): only connectors that genuinely
  // need no credentials (e.g. a local Ollama server) set 'none'. Connectors marked 'none'
  // skip the credential handshake entirely, so they resolve their endpoint from config
  // rather than the user session.
  authentication?: 'none' | 'token' | 'basic';
  tags?: string[];
  disabled?: boolean;
  // Seconds a models/collections response may be served from the server cache.
  // 0 disables caching for this connector; undefined uses the route's default TTL.
  maxAge?: number;
}

/**
 * RetrieverConfig — system-level configuration for a retriever connector.
 * Lives in system.ts / SYSTEM_CONFIGURATION. Has full credentials and all settings.
 * Formerly: RetrieverConfig
 */
export interface RetrieverConfig extends Connector {
  settings: {
    configurable: boolean;
    feedback?: {
      enabled: boolean;
    };
    max_count: number;
    max_utterances: number;
    query_syntax: string;
    templates: {
      projection: string;
      display: string;
    };
    collections?: {
      regex?: string;
    };
  };
}

/**
 * GeneratorConfig — system-level configuration for a generator connector.
 * Lives in system.ts / SYSTEM_CONFIGURATION. Has full credentials and all settings.
 * Formerly: GeneratorConfig
 */
export interface GeneratorConfig extends Connector {
  settings: {
    configurable: boolean;
    supported_modes?: ('completion' | 'chat_completion')[];
    use_chat_completion?: boolean; // kept for backwards-compat config parsing
    prompt: {
      template: string;
      input: string;
      system_instruction?: string;
      context?: string;
    };
    feedback?: {
      enabled: boolean;
    };
    models?: {
      regex?: string;
    };
    parameters: {
      max_new_tokens: number;
      min_new_tokens?: number;
      repetition_penalty?: number;
      stop_sequences?: string[];
    };
  };
}

export interface Plugin {
  name: string;
  settings?: {};
}

export interface SystemConfiguration {
  authenticator: {
    enabled: boolean;
    provider: 'credentials' | 'oauth' | 'github';
  };
  retrievers: RetrieverConfig[];
  generators: GeneratorConfig[];
  store?: Connector;
  plugins?: Plugin[];
}

// ===================================================================================
//                               SELECTED CONNECTORS
// ===================================================================================
/**
 * SelectedConnectors — the pair of system config entries chosen by the user
 * in the Configure step before a conversation starts.
 * Formerly: SelectedConnectors
 */
export interface SelectedConnectors {
  retriever: RetrieverConfig;
  generator: GeneratorConfig;
}

// ===================================================================================
//                               USER
// ===================================================================================
export interface User {
  username: string;
  firstName: string;
  name?: string;
  user_id?: string;
  email?: string | null;
  image?: string | null;
}

// ===================================================================================
//                               ACTIVE RETRIEVER (runtime session)
// ===================================================================================
export interface Collection {
  name: string;
  size?: number;
  uuid?: string;
  createdAt?: string;
}

/**
 * RetrieverParams — the adjustable parameters for a retriever during a session.
 * Formerly: RetrieverParams (renamed to avoid collision with the RetrieverParams React component)
 */
export interface RetrieverParams {
  max_count: number;
  max_utterances: number;
  query_syntax: string | object;
  templates: { projection: string; display: string };
}

/**
 * ActiveRetriever — the runtime object used during an active conversation.
 * Combines a selected Collection, current RetrieverParams, and a back-reference
 * to the full RetrieverConfig. Passed to sendMessage, search, and all UI components.
 * Formerly: ActiveRetriever
 */
export interface ActiveRetriever {
  collection: Collection;
  settings: RetrieverParams;
  connector: RetrieverConfig;
}

// ===================================================================================
//                               ACTIVE GENERATOR (runtime session)
// ===================================================================================
export interface Model {
  id: string;
  name: string;
}

export interface TextCompletionPromptSettings {
  template: string;
  input: string;
  context?: string;
  system_instruction?: string;
}

export interface TextCompletionParameters {
  max_new_tokens: number;
  min_new_tokens?: number;
  temperature?: number;
  top_p?: number;
  repetition_penalty?: number;
  stop_sequences?: string[];
}

export interface ChatCompletionPromptSettings {
  system_instruction?: string;
  context?: string;
}

export interface ChatCompletionParameters {
  max_completion_tokens: number;
  temperature?: number;
  top_p?: number;
  repetition_penalty?: number;
  stop?: string[];
}

/**
 * GeneratorParams — the prompt template and inference parameters for a generator session.
 * Formerly: GeneratorParams (renamed to avoid collision with the GeneratorParams React component)
 */
export interface GeneratorParams {
  prompt: TextCompletionPromptSettings | ChatCompletionPromptSettings;
  parameters?: TextCompletionParameters | ChatCompletionParameters;
}

/**
 * ActiveGenerator — the runtime object used during an active conversation.
 * Extends Model (id + name) with mode, GeneratorParams, and a back-reference
 * to the full GeneratorConfig. Passed to sendMessage and all UI components.
 * Formerly: ActiveGenerator
 */
export interface ActiveGenerator extends Model {
  mode: 'completion' | 'chat_completion';
  settings: GeneratorParams;
  connector: GeneratorConfig;
}

// ===================================================================================
//                               CONVERSATION SNAPSHOTS (persisted JSON)
// ===================================================================================
/**
 * ConnectorRef — a minimal connector reference stored inside a conversation JSON.
 * Only name and optional endpoint — credentials are never persisted.
 */
export interface ConnectorRef {
  name: string;
  endpoint?: string;
}

/**
 * RetrieverSnapshot — how a retriever is recorded in a saved/exported conversation JSON.
 * Credentials-free subset of ActiveRetriever. Produced by formatRetriever().
 * Formerly: no distinct type — incorrectly reused ActiveRetriever/ActiveRetriever
 */
export interface RetrieverSnapshot {
  collection: Collection;
  settings: RetrieverParams;
  connector: ConnectorRef;
}

/**
 * GeneratorSnapshot — how a generator is recorded in a saved/exported conversation JSON.
 * Credentials-free subset of ActiveGenerator. Produced by formatGenerator().
 * Formerly: no distinct type — incorrectly reused ActiveGenerator/ActiveGenerator
 */
export interface GeneratorSnapshot {
  id: string;
  name: string;
  mode: 'completion' | 'chat_completion';
  settings: GeneratorParams;
  connector: ConnectorRef;
}

// ===================================================================================
//                               FEEDBACK
// ===================================================================================
export interface Feedback {
  [key: string]: {
    [key: string]: { value: string | number; timestamp: number };
  };
}

// ===================================================================================
//                               CHAT
// ===================================================================================
export interface Evidence {
  type: 'DOCUMENT' | 'FUNCTION';
  score?: number;
  feedback?: Feedback;
}

export interface Document extends Evidence {
  document_id: string;
  text: string;
  formatted_text?: string;
  query?: {};
  title?: string;
  url?: string;
}

export interface Alternative {
  text: string;
  enrichments?: { [key: string]: string[] };
}

// ===================================================================================
//                               HINT
// ===================================================================================
export interface Hint {
  title: string;
  subtitle: string;
  kind: 'error' | 'info' | 'success' | 'warning';
  timeout?: number;
  onCloseButtonClick?: () => {};
  onActionButtonClick?: () => {};
  provenance?: string;
}

export interface Message {
  speaker: 'agent' | 'user';
  utterance_id?: string;
  text: string;
  timestamp: number;
  warnings?: string[];
  originalText?: string;
  contexts?: Document[];
  prompt?: string;
  feedback?: Feedback;
  enrichments?: { [key: string]: string[] };
  alternatives?: Alternative[];
}

// ===================================================================================
//                               NOTIFICATION
// ===================================================================================
export interface Notification {
  title: string;
  subtitle: string;
  kind:
    | 'error'
    | 'info'
    | 'info-square'
    | 'success'
    | 'warning'
    | 'warning-alt';
  caption?: string;
  timeout?: number;
  type?: 'Toast' | 'Inline' | 'Actionable';
  onCloseButtonClick?: () => {};
  onActionButtonClick?: () => {};
}

// ===================================================================================
//                               HIGHLIGHTER
// ===================================================================================
export interface StringMatchObject {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly matchesInTarget: { start: number; end: number }[];
  readonly count: number;
}

export interface SentenceMatchObject {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly score: number;
  readonly phraseMatches: StringMatchObject[];
}

// ===================================================================================
//                               COMMENT
// ===================================================================================
export interface CommentProvenance {
  component: string;
  text?: string;
  offsets?: number[];
}

export interface Comment {
  comment: string;
  author: string;
  created: number;
  updated: number;
  provenance?: CommentProvenance;
}

// ===================================================================================
//                               CONVERSATION
// ===================================================================================
export interface Conversation {
  readonly author: string;
  readonly messages: Message[];
  readonly retriever?: RetrieverSnapshot;
  readonly generator?: GeneratorSnapshot;
  comments?: Comment[];
  status?: 'created' | 'edited' | 'reviewed';
  status_history?: {
    author: string;
    status: 'created' | 'edited' | 'accepted' | 'rejected';
    timestamp: number;
  }[];
}

// ===================================================================================
//                               PIPELINE
// ===================================================================================
export interface Pipeline {
  name: string;
  author: string;
  description?: number;
  timestamp?: number;
  retriever?: ActiveRetriever;
  generator?: ActiveGenerator;
}

// ===================================================================================
//                               METRIC
// ===================================================================================
export interface Metric {
  name: string;
  author: string;
  kind: string;
  type: string;
  aggregator: string;
  displayName?: string;
  range?: number[];
  values?: {
    value: string | number;
    numericValue?: number;
    displayValue?: string;
  }[];
  description?: string;
  timestamp?: number;
  generator?: GeneratorSnapshot;
  tags?: string[];
  disabled?: boolean;
}

// ===================================================================================
//                               DATASET
// ===================================================================================
export interface Utterance {
  speaker: 'user' | 'agent';
  text: string;
  timestamp: number;
  enrichments?: { [key: string]: string[] };
  metadata?: object;
  contexts?: Document[];
}

export interface DatasetConversation {
  conversation_id: string;
  collection: string;
  all_contexts: { [key: string]: Document };
  messages: {
    speaker: 'user' | 'agent';
    text: string;
    timestamp: number;
    metadata: {
      author_type: string;
      author_id: string;
      created_at: number;
    };
    retrieved_contexts?: string[];
    enrichments?: { [key: string]: string[] };
  }[];
}

export interface DatasetTask {
  conversation_id: string;
  task_id: string;
  task_type: 'rag';
  turn: string;
  collection: string;
  contexts: Document[];
  input: Utterance[];
  targets: Utterance[];
  [key: string]: any;
}

// ===================================================================================
//                               PREDICTION
// ===================================================================================
export interface Prediction {
  pipelineName: string;
  text?: string;
  contexts?: Document[];
  evaluations: {
    [key: string]: { value: number | string | null; duration?: number };
  };
  duration?: {
    total: number;
    retriever?: number;
    generator?: number;
    evaluations?: number;
  };
}

// ===================================================================================
//                               EXPERIMENT
// ===================================================================================
export interface Experiment {
  pipelines: Pipeline[];
  metrics: Metric[];
}

export interface Job {
  task: DatasetTask;
  status:
    | 'success'
    | 'error'
    | 'running'
    | 'retrieving'
    | 'generating'
    | 'evaluating'
    | 'scheduled'
    | 'cancelled';
  predictions: Prediction[];
}

// ===================================================================================
//                               VALIDATION ERROR
// ===================================================================================
export interface ValidationError {
  kind: string;
  recommendation: string;
  data?: any;
}

// ===================================================================================
//                               CHAT MESSAGES (OPENAI FORMAT)
// ===================================================================================
interface Function {
  name: string;
  arguments: object | any[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: Function;
  parents?: string[];
  children?: string[];
}

interface Step {
  id: string;
  input: any;
  output: any;
  parents?: string[];
  children?: string[];
}

export interface ChatMessage {
  role: 'system' | 'developer' | 'user' | 'tool' | 'assistant';
  utterance_id?: string;
  content?: any;
  name?: string;
  timestamp?: number;
}

interface SystemMessage extends ChatMessage {
  role: 'system';
}

interface DeveloperMessage extends ChatMessage {
  role: 'developer';
}

interface UserMessage extends ChatMessage {
  role: 'user';
}

export interface Document {
  text: string;
  url?: string;
  title?: string;
  score?: number;
}
export interface ToolMessage extends ChatMessage {
  role: 'tool';
  tool_call_id: string;
  type?: 'text' | 'documents' | 'json';
  content: string | object | Document[];
}

export interface AssistantMessage extends ChatMessage {
  role: 'assistant';
  refusal?: string;
  tool_calls?: ToolCall[];
  steps?: Step[];
}
