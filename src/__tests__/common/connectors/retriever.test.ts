/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for src/common/connectors/retriever.ts
 *
 * All SDK clients are mocked — no live Elasticsearch / MongoDB / Cloudant needed.
 *
 * Design note: The Elastic class uses a static `_instance` singleton that reads
 * `_instance.connection.connectionPool` on every construction. To keep tests
 * simple and isolated we bypass the constructor for the method-level tests by
 * creating a plain object that has the same public interface, then directly
 * invoking the prototype methods on it via `call`. This avoids all singleton
 * complications without needing to modify production code.
 */

// ---------------------------------------------------------------------------
// Module-level mocks (must be declared before imports)
// ---------------------------------------------------------------------------

jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connectionPool: { connections: [{ url: 'http://mock-elastic:9200/' }] },
    cat: { indices: jest.fn() },
    search: jest.fn(),
  })),
  errors: {
    ResponseError: class ResponseError extends Error {
      constructor(public meta: any) {
        super('ResponseError');
        this.name = 'ResponseError';
      }
    },
  },
}));

jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => ({
    db: jest.fn().mockReturnValue({}),
  })),
}));

jest.mock('@ibm-cloud/cloudant', () => ({
  CloudantV1: jest.fn().mockImplementation(() => ({
    setServiceUrl: jest.fn(),
    getAllDbs: jest.fn().mockResolvedValue({ result: ['db1', 'db2'] }),
    postDbsInfo: jest.fn().mockResolvedValue({
      result: [
        { info: { dbName: 'db1', docCount: 42 } },
        { info: { dbName: 'db2', docCount: 10 } },
      ],
    }),
  })),
}));

jest.mock('ibm-cloud-sdk-core', () => ({
  BasicAuthenticator: jest.fn(),
  IamAuthenticator: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------
import { getRetriever } from '@/src/common/connectors/retriever';
import { errors as ElasticErrors } from '@elastic/elasticsearch';

// ---------------------------------------------------------------------------
// getRetriever — factory
// ---------------------------------------------------------------------------

describe('getRetriever — factory', () => {
  it('creates an ElasticSearch retriever', () => {
    const r = getRetriever('ElasticSearch', 'http://localhost:9200', {
      apiKey: 'key',
    });
    expect(r).toBeDefined();
  });

  it('creates an ElasticSearch retriever with basic auth', () => {
    const r = getRetriever('ElasticSearch', 'http://localhost:9200', {
      username: 'user',
      password: 'pass',
    });
    expect(r).toBeDefined();
  });

  it('creates a MongoDB retriever', () => {
    const r = getRetriever('MongoDB', 'localhost:27017', {
      username: 'user',
      password: 'pass',
      database: 'mydb',
    });
    expect(r).toBeDefined();
  });

  it('creates a Cloudant retriever', () => {
    const r = getRetriever('Cloudant', 'https://cloudant.example.com', {
      username: 'user',
      password: 'pass',
    });
    expect(r).toBeDefined();
  });

  it('throws for an unsupported engine name', () => {
    expect(() => getRetriever('UnknownDB', '', {})).toThrow(
      'Unsupported engine (UnknownDB) for retriever.',
    );
  });
});

// ---------------------------------------------------------------------------
// Elastic — getCollections()
//
// We get the one instance that the factory created above (the singleton) and
// patch its connection for these tests.
// ---------------------------------------------------------------------------

describe('Elastic — getCollections()', () => {
  // Grab the singleton instance created by the factory tests above
  const r = getRetriever('ElasticSearch', 'http://localhost:9200', {
    apiKey: 'k',
  }) as any;

  it('returns only green/open non-system indices sorted by name', async () => {
    r.connection = {
      cat: {
        indices: jest.fn().mockResolvedValue([
          {
            health: 'green',
            status: 'open',
            index: 'corpus',
            'docs.count': 100,
            uuid: 'aaa',
          },
          {
            health: 'yellow',
            status: 'open',
            index: 'other',
            'docs.count': 5,
            uuid: 'bbb',
          },
          {
            health: 'green',
            status: 'open',
            index: '.kibana',
            'docs.count': 1,
            uuid: 'ccc',
          },
          {
            health: 'green',
            status: 'close',
            index: 'closed',
            'docs.count': 0,
            uuid: 'ddd',
          },
        ]),
      },
    };

    const cols = await r.getCollections();
    expect(cols).toHaveLength(1);
    expect(cols[0].name).toBe('corpus');
    expect(cols[0].size).toBe(100);
    expect(cols[0].uuid).toBe('aaa');
  });
});

// ---------------------------------------------------------------------------
// Elastic — retrieve()
//
// Same instance, patch connection in each test.
// ---------------------------------------------------------------------------

describe('Elastic — retrieve()', () => {
  const r = getRetriever('ElasticSearch', 'http://localhost:9200', {
    apiKey: 'k',
  }) as any;
  let mockSearch: jest.Mock;

  beforeEach(() => {
    mockSearch = jest.fn();
    r.connection = { search: mockSearch };
  });

  it('returns projected documents from search hits', async () => {
    mockSearch.mockResolvedValue({
      hits: {
        hits: [
          {
            _id: 'doc1',
            _score: 0.9,
            _source: {
              text: 'Hello world',
              title: 'My Doc',
              url: 'http://example.com',
            },
          },
        ],
      },
    });

    const docs = await r.retrieve(
      'my-index',
      { query: { match_all: {} } },
      3,
      '${text}',
      '**${title}**\n${text}',
    );

    expect(docs).toHaveLength(1);
    expect(docs[0].type).toBe('DOCUMENT');
    expect(docs[0].document_id).toBe('doc1');
    expect(docs[0].text).toBe('Hello world');
    expect(docs[0].formatted_text).toBe('**My Doc**\nHello world');
    expect(docs[0].score).toBe(0.9);
    expect(docs[0].title).toBe('My Doc');
    expect(docs[0].url).toBe('http://example.com');
  });

  it('throws ProjectionError when a required template variable is missing from hit', async () => {
    mockSearch.mockResolvedValue({
      hits: {
        hits: [
          {
            _id: 'doc2',
            _score: 0.5,
            _source: { body: 'some text' }, // missing 'text'
          },
        ],
      },
    });

    await expect(
      r.retrieve('idx', {}, 1, '${text}', '${text}'),
    ).rejects.toMatchObject({ name: 'ProjectionError' });
  });

  it('re-throws Elasticsearch ResponseError with the root_cause reason', async () => {
    const { ResponseError } = ElasticErrors as any;
    const elasticErr = new ResponseError({
      body: {
        error: { root_cause: [{ reason: 'index_not_found_exception' }] },
      },
    });
    mockSearch.mockRejectedValue(elasticErr);

    await expect(
      r.retrieve('bad-index', {}, 1, '${text}', '${text}'),
    ).rejects.toMatchObject({
      name: 'ResponseError',
      message: 'index_not_found_exception',
    });
  });

  it('passes other errors through unchanged', async () => {
    mockSearch.mockRejectedValue(new TypeError('network failure'));
    await expect(
      r.retrieve('idx', {}, 1, '${text}', '${text}'),
    ).rejects.toThrow('network failure');
  });
});

// ---------------------------------------------------------------------------
// Cloudant — getCollections()
// ---------------------------------------------------------------------------

describe('Cloudant — getCollections()', () => {
  it('returns databases sorted by name', async () => {
    const r = getRetriever('Cloudant', 'https://cloudant.example.com', {
      username: 'u',
      password: 'p',
    }) as any;

    r.connection = {
      getAllDbs: jest.fn().mockResolvedValue({ result: ['zebra', 'alpha'] }),
      postDbsInfo: jest.fn().mockResolvedValue({
        result: [
          { info: { dbName: 'zebra', docCount: 5 } },
          { info: { dbName: 'alpha', docCount: 99 } },
        ],
      }),
    };

    const cols = await r.getCollections();
    expect(cols).toHaveLength(2);
    expect(cols[0].name).toBe('alpha');
    expect(cols[1].name).toBe('zebra');
  });
});
