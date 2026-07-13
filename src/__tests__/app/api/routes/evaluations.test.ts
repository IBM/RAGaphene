/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for GET /api/evaluations and POST /api/evaluations
 *
 * Mocks: node:fs, node:child_process, crypto.randomUUID, logger.
 * No filesystem writes or Python subprocess calls occur.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/src/common/utilities/logger', () => ({
  logger: {
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
  extractRequestContext: jest.fn((req: Request) => ({
    method: req.method,
    path: '/api/evaluations',
    query: {},
    userAgent: 'test',
  })),
}));

// Mock node:fs — prevents any real filesystem access
const mockExistsSync = jest.fn();
const mockReadFileSync = jest.fn();
const mockWriteFileSync = jest.fn();
jest.mock('node:fs', () => ({
  default: {
    existsSync: (...args: any[]) => mockExistsSync(...args),
    readFileSync: (...args: any[]) => mockReadFileSync(...args),
    writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
  },
  existsSync: (...args: any[]) => mockExistsSync(...args),
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
  writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
}));

// Mock node:child_process — prevents any real subprocess spawning.
// spawnSync backs the Python preflight check; default it to success (status 0).
const mockSpawn = jest.fn().mockReturnValue({ unref: jest.fn() });
const mockSpawnSync = jest.fn().mockReturnValue({ status: 0 });
jest.mock('node:child_process', () => ({
  spawn: (...args: any[]) => mockSpawn(...args),
  spawnSync: (...args: any[]) => mockSpawnSync(...args),
}));

// Fix randomUUID to return a predictable value so we can assert on file paths
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomUUID: jest.fn().mockReturnValue('test-uuid-1234'),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
import { GET, POST } from '@/src/app/api/evaluations/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGetRequest(id: string): Request {
  return new Request(`http://localhost/api/evaluations?id=${id}`);
}

function makePostRequest(body: any): Request {
  return new Request('http://localhost/api/evaluations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

// Matches the shape Runner.tsx POSTs to /api/evaluations
const validPayload = {
  metrics: ['f1', 'rouge-l'],
  pipelines: ['pipeline-a'],
  tasks: [
    {
      task_id: 'task-1',
      'pipeline-a': {
        predictions: ['predicted answer'],
        targets: ['gold answer'],
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// GET /api/evaluations
// ---------------------------------------------------------------------------

describe('GET /api/evaluations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 when id query param is missing', async () => {
    const res = await GET(new Request('http://localhost/api/evaluations'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when id is not a valid UUID', async () => {
    const res = await GET(makeGetRequest('not-a-uuid'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when neither output nor progress file exists', async () => {
    // Both existsSync calls (output, then progress) return false
    mockExistsSync.mockReturnValue(false);
    const res = await GET(makeGetRequest(VALID_UUID));
    expect(res.status).toBe(404);
    expect(mockExistsSync).toHaveBeenCalledWith(
      `/tmp/output_${VALID_UUID}.json`,
    );
    expect(mockExistsSync).toHaveBeenCalledWith(
      `/tmp/progress_${VALID_UUID}.json`,
    );
  });

  it('returns 200 with evaluation results when output file exists', async () => {
    const results = { score: 0.87, metrics: { faithfulness: 0.9 } };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(results));

    const res = await GET(makeGetRequest(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.score).toBe(0.87);
    expect(body.status).toBe('complete');
  });

  it('returns 400 when output file exists but contains invalid JSON', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not valid json{{');

    const res = await GET(makeGetRequest(VALID_UUID));
    expect(res.status).toBe(400);
  });

  it('returns 200 with running status when only progress file exists', async () => {
    // First call (output path) → false; second call (progress path) → true
    mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ completed: 3, total: 10 }),
    );

    const res = await GET(makeGetRequest(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('running');
    expect(body.completed).toBe(3);
    expect(body.total).toBe(10);
  });

  it('returns 200 with zero progress when progress file exists but is unreadable', async () => {
    mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const res = await GET(makeGetRequest(VALID_UUID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('running');
    expect(body.completed).toBe(0);
    expect(body.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/evaluations
// ---------------------------------------------------------------------------

describe('POST /api/evaluations', () => {
  const originalPythonPath = process.env.PYTHON_ENVIRONMENT_PATH;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PYTHON_ENVIRONMENT_PATH;
    // clearAllMocks wipes return values — restore the preflight success default.
    mockSpawnSync.mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    if (originalPythonPath === undefined) {
      delete process.env.PYTHON_ENVIRONMENT_PATH;
    } else {
      process.env.PYTHON_ENVIRONMENT_PATH = originalPythonPath;
    }
  });

  it('returns 400 when body is empty', async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when metrics array is missing', async () => {
    const { metrics: _, ...noMetrics } = validPayload;
    const res = await POST(makePostRequest(noMetrics));
    expect(res.status).toBe(400);
  });

  it('returns 400 when tasks array is empty', async () => {
    const res = await POST(makePostRequest({ ...validPayload, tasks: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 200 with evaluationID on success', async () => {
    const res = await POST(makePostRequest(validPayload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.evaluationID).toBe('test-uuid-1234');
  });

  it('writes the full experiment payload to /tmp/input_{uuid}.json', async () => {
    await POST(makePostRequest(validPayload));
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      '/tmp/input_test-uuid-1234.json',
      expect.any(String),
      'utf8',
    );
    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1]);
    expect(written).toEqual(validPayload);
  });

  it('returns 503 when the Python preflight fails', async () => {
    mockSpawnSync.mockReturnValue({ status: 1 });
    const res = await POST(makePostRequest(validPayload));
    expect(res.status).toBe(503);
    // The evaluator must not be spawned when the preflight fails.
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it('spawns the evaluation script with the correct paths', async () => {
    await POST(makePostRequest(validPayload));
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const cmd: string = mockSpawn.mock.calls[0][0];
    expect(cmd).toContain('input_test-uuid-1234.json');
    expect(cmd).toContain('output_test-uuid-1234.json');
    expect(cmd).toContain('evaluator.py');
  });

  it('spawns with --progress-path arg', async () => {
    await POST(makePostRequest(validPayload));
    const cmd: string = mockSpawn.mock.calls[0][0];
    expect(cmd).toContain('progress_test-uuid-1234.json');
  });

  it('spawns with shell=true and detached=true', async () => {
    await POST(makePostRequest(validPayload));
    const opts = mockSpawn.mock.calls[0][1];
    expect(opts.shell).toBe(true);
    expect(opts.detached).toBe(true);
  });

  it('prepends PYTHON_ENVIRONMENT_PATH when env var is set', async () => {
    process.env.PYTHON_ENVIRONMENT_PATH = '/opt/venv';
    await POST(makePostRequest(validPayload));
    const cmd: string = mockSpawn.mock.calls[0][0];
    expect(cmd).toContain('/opt/venv/bin');
  });

  it('does not prepend PATH when PYTHON_ENVIRONMENT_PATH is not set', async () => {
    await POST(makePostRequest(validPayload));
    const cmd: string = mockSpawn.mock.calls[0][0];
    expect(cmd).not.toContain('/bin:$PATH');
  });

  it('returns 400 when fs.writeFileSync throws', async () => {
    mockWriteFileSync.mockImplementation(() => {
      throw new Error('disk full');
    });
    const res = await POST(makePostRequest(validPayload));
    expect(res.status).toBe(400);
  });
});
