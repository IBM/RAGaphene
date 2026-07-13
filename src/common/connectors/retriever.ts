/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import 'server-only';
import { Collection, Document } from '@/types/custom';
import { VARIABLE } from '@/src/common/constants';
import * as localIndex from '@/src/common/utilities/localIndex';

const {
  Client: ElasticClient,
  errors: ElasticErrors,
} = require('@elastic/elasticsearch');
const { MongoClient } = require('mongodb');
import { CloudantV1 } from '@ibm-cloud/cloudant';
import { BasicAuthenticator } from 'ibm-cloud-sdk-core';

/**
 * Abstract Class ActiveRetriever.
 *
 * @class ActiveRetriever
 */
class ActiveRetriever {
  constructor() {
    if (this.constructor === ActiveRetriever) {
      throw new Error("Abstract classes can't be instantiated.");
    }
  }

  /**
   * Fetch collections
   * @returns
   */
  async getCollections(): Promise<Collection[]> {
    throw new Error("Method 'getCollections()' must be implemented.");
  }

  /**
   * Fetch documents matching query from the given collection
   * @param collection to search against
   * @param query
   * @param count number of documents to return
   * @param projection_template template instructing document's text field construction
   * @param display_template template instructing document's rendered view construction
   * @returns
   */
  async retrieve(
    collection: string,
    query: {},
    count: number,
    projection_template: string,
    display_template: string,
  ): Promise<Document[]> {
    throw new Error("Method 'retrieve()' must be implemented.");
  }
}

/**
 * Elastic ActiveRetriever
 *
 * @class Elastic
 * @extends {ActiveRetriever}
 */
class Elastic extends ActiveRetriever {
  // class variables
  private static _instance;
  connection;

  constructor(
    endpoint: string,
    credentials: {
      username?: string;
      password?: string;
      apiKey?: string;
    },
  ) {
    // Step 1: Return existing, if endpoint is same
    if (
      Elastic._instance &&
      Elastic._instance.connection &&
      `${Elastic._instance.connection.connectionPool.connections[0].url}`.slice(
        0,
        -1,
      ) === endpoint
    ) {
      return Elastic._instance;
    } else {
      // Step 2: Initialize parent
      super();

      // Step 3: Establish connection, if none existing
      this.connection = new ElasticClient({
        node: endpoint,
        ...(credentials.username && credentials.password
          ? {
              auth: {
                username: credentials.username,
                password: credentials.password,
              },
            }
          : {
              auth: {
                apiKey: credentials.apiKey,
              },
            }),
        tls: {
          // Required due to a self-signed certificate
          rejectUnauthorized: false,
        },
      });

      // Step 4: Set instance
      Elastic._instance = this;
    }
  }

  /**
   * Fetch collections
   * @returns
   */
  async getCollections(): Promise<Collection[]> {
    const result = await this.connection.cat.indices({ format: 'json' });
    const indices = result
      .filter(
        (entry) =>
          entry.health === 'green' &&
          entry.status === 'open' &&
          !entry.index.startsWith('.'),
      )
      .toSorted((a, b) => a.index.localeCompare(b.index));

    return indices.map((index) => {
      return { name: index.index, size: index['docs.count'], uuid: index.uuid };
    });
  }

  /**
   * Fetch documents matching query from the given collection
   * @param collection to search against
   * @param query
   * @param count number of documents to return
   * @param projection_template template instructing document's text field construction
   * @param display_template template instructing document's rendered view construction
   * @returns
   */
  async retrieve(
    collection: string,
    query: {},
    count: number,
    projection_template: string,
    display_template: string,
  ): Promise<Document[]> {
    const documents: Document[] = [];

    try {
      const results = await this.connection.search({
        index: collection,
        ...query,
        size: count,
      });

      // Identify necessary variables from the projection template
      const variablesInProjectionTemplate: string[] = [];
      let mProjection;
      while ((mProjection = VARIABLE.exec(projection_template))) {
        variablesInProjectionTemplate.push(mProjection[1]);
      }

      // Identify necessary variables from the display template
      const variablesInDisplayTemplate: string[] = [];
      let mDisplay;
      while ((mDisplay = VARIABLE.exec(display_template))) {
        variablesInDisplayTemplate.push(mDisplay[1]);
      }

      // Process hits
      results.hits.hits.forEach((hit) => {
        // Step 1: Verify all requested variables exist in the search result
        const missingVariables: string[] = [];
        variablesInProjectionTemplate.forEach((variable) => {
          if (!hit._source.hasOwnProperty(variable)) {
            missingVariables.push(variable);
          }
        });
        variablesInDisplayTemplate.forEach((variable) => {
          if (!hit._source.hasOwnProperty(variable)) {
            missingVariables.push(variable);
          }
        });

        // Step 2: Raise exception if any missing variables found
        if (missingVariables.length > 0) {
          throw {
            name: 'ProjectionError',
            message: `Missing "${missingVariables.join('", "')}" field${missingVariables.length > 1 ? 's' : ''} in the search results.`,
          };
        } else {
          // Step 2: Generate text field
          // Step 2.a: Copy over text template
          let projected: string = projection_template;

          // Step 2.b: Iteratively replace each variable with a value from the search result
          variablesInProjectionTemplate.forEach((variable) => {
            projected = projected.replaceAll(
              `\${${variable}}`,
              hit._source[variable],
            );
          });

          // Step 3: Generate formatted_text field
          // Step 3.a: Copy over format template
          let formatted: string = display_template;

          // Step 3.b: Iteratively replace each variable with a value from the search result
          variablesInDisplayTemplate.forEach((variable) => {
            formatted = formatted.replaceAll(
              `\${${variable}}`,
              hit._source[variable],
            );
          });

          // Step 4: Prepare 'DOCUMENT' type evidence
          documents.push({
            type: 'DOCUMENT',
            document_id: hit._id,
            text: projected,
            formatted_text: formatted,
            score: hit._score,
            query: query,
            ...(hit._source['title'] && {
              title: hit._source['title'],
            }),
            ...(hit._source['url'] && {
              url: hit._source['url'],
            }),
          });
        }
      });
    } catch (exception) {
      if (exception instanceof ElasticErrors.ResponseError) {
        throw {
          name: 'ResponseError',
          //@ts-ignore
          message: exception.meta.body.error.root_cause[0].reason,
        };
      }

      // Raise other exceptions as it is
      throw exception;
    }

    return documents;
  }
}

/**
 * MongoDB ActiveRetriever
 *
 * @class MongoDB
 * @extends {ActiveRetriever}
 */
class MongoDB extends ActiveRetriever {
  //class variables
  private static _instance;
  client;
  database;

  constructor(
    endpoint: string,
    credentials: {
      username: string;
      password: string;
      database: string;
    },
  ) {
    // Step 1: Return existing, if endpoint is same
    if (
      MongoDB._instance &&
      MongoDB._instance.client &&
      MongoDB._instance.database
    ) {
      return MongoDB._instance;
    } else {
      // Step 2: Initialize parent
      super();

      // Step 3: Establish connection, if none existing
      // Step 3.a: Setup client
      this.client = new MongoClient(
        `mongodb://${credentials.username}:${credentials.password}@${endpoint}`,
        { ssl: false },
      );

      // Step 3.b: Establish connection to database
      this.database = this.client.db(credentials.database);

      // Step 4: Set instance
      MongoDB._instance = this;
    }
  }

  /**
   * Fetch collections
   * @returns
   */
  async getCollections(): Promise<Collection[]> {
    throw new Error("Method 'getCollections()' must be implemented.");
  }

  /**
   * Fetch documents matching query from the given collection
   * @param collection to search against
   * @param query
   * @param count number of documents to return
   * @param projection_template template instructing document's text field construction
   * @param display_template template instructing document's rendered view construction
   * @returns
   */
  async retrieve(
    collection: string,
    query: {},
    count: number,
    projection_template: string,
    display_template: string,
  ): Promise<Document[]> {
    throw new Error("Method 'retrieve()' must be implemented.");
  }
}

/**
 * Cloudant ActiveRetriever
 *
 * @class Cloudant
 * @extends {ActiveRetriever}
 */
class Cloudant extends ActiveRetriever {
  //class variables
  private static _instance;
  connection;

  constructor(
    endpoint: string,
    credentials: {
      username: string;
      password: string;
    },
  ) {
    // Step 1: Return existing, if endpoint is same
    if (Cloudant._instance && Cloudant._instance.connection) {
      return Cloudant._instance;
    } else {
      // Step 2: Initialize parent
      super();

      // Step 3: Establish connection, if none existing
      // Step 3.a: Setup authenticator
      const authenticator = new BasicAuthenticator({
        username: credentials.username,
        password: credentials.password,
      });

      // Step 3.b.: Create connection
      this.connection = new CloudantV1({
        authenticator: authenticator,
      });

      // Step 3.c: Set URL
      this.connection.setServiceUrl(endpoint);

      // Step 4: Set instance
      Cloudant._instance = this;
    }
  }

  /**
   * Fetch collections
   * @returns
   */
  async getCollections(): Promise<Collection[]> {
    const getAllDbsResponse = await this.connection.getAllDbs();

    const databaseInfos = await this.connection.postDbsInfo({
      keys: getAllDbsResponse.result,
    });

    return databaseInfos.result
      .map((entry) => {
        return { name: entry.info.dbName, size: entry.info.docCount };
      })
      .toSorted((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Fetch documents matching query from the given collection
   * @param collection to search against
   * @param query
   * @param count number of documents to return
   * @param projection_template template instructing document's text field construction
   * @param display_template template instructing document's rendered view construction
   * @returns
   */
  async retrieve(
    collection: string,
    query: {},
    count: number,
    projection_template: string,
    display_template: string,
  ): Promise<Document[]> {
    throw new Error("Method 'retrieve()' must be implemented.");
  }
}

/**
 * MongoDB ActiveRetriever
 *
 * @class MongoDB
 * @extends {ActiveRetriever}
 */
class Local extends ActiveRetriever {
  private username: string;

  // endpoint is repurposed as the username carrier — routes pass
  // session.user.username there since Local needs no network endpoint.
  constructor(username: string) {
    super();
    this.username = username;
  }

  async getCollections(): Promise<Collection[]> {
    return localIndex.getCollections(this.username);
  }

  async retrieve(
    collection: string,
    query: {},
    count: number,
    projection_template: string,
    display_template: string,
  ): Promise<Document[]> {
    return localIndex.retrieve(
      collection,
      query as { query?: string } & Record<string, unknown>,
      count,
      projection_template,
      display_template,
    );
  }
}

export function getRetriever(
  name: string,
  endpoint: string,
  credentials: {
    username?: string;
    password?: string;
    apiKey?: string;
    [key: string]: any;
  },
) {
  if (name === 'ElasticSearch') {
    return new Elastic(endpoint, credentials);
  } else if (name === 'MongoDB') {
    //@ts-ignore
    return new MongoDB(endpoint, credentials);
  } else if (name === 'Cloudant') {
    //@ts-ignore
    return new Cloudant(endpoint, credentials);
  } else if (name === 'Local Documents') {
    // endpoint carries session.user.username for per-user index isolation.
    return new Local(endpoint);
  } else {
    throw new Error(`Unsupported engine (${name}) for retriever.`);
  }
}
