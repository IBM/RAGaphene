/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import 'server-only';
import { CloudantV1 } from '@ibm-cloud/cloudant';
import { IamAuthenticator } from 'ibm-cloud-sdk-core';

/**
 * Abstract Class Database.
 *
 * @class ActiveGenerator
 */
class Database {
  constructor() {
    if (this.constructor === Database) {
      throw new Error("Abstract classes can't be instantiated.");
    }
  }

  /**
   * Save
   * @returns
   */
  async save(data: {}): Promise<string> {
    throw new Error("Method 'save(data: {})' must be implemented.");
  }
}

/**
 * IBM Cloudant Database
 *
 * @class IBMCloudant
 * @extends {Database}
 */
class IBMCloudant extends Database {
  // Class variables
  service;
  endpoint;
  api_key;

  constructor(endpoint: string, api_key: string) {
    // Step 1: Initialize parent
    super();

    // Step 2: Initalize a service, if none existing
    if (this.service) {
      // Step 2.a: Initalize new service instance if the endpoint or api_key is different
      if (this.endpoint !== endpoint || this.api_key !== api_key) {
        // Step 2.a.i: Create authenticator
        const authenticator = new IamAuthenticator({
          apikey: api_key,
        });

        // Step 2.a.ii: Create service instance
        this.service = new CloudantV1({
          authenticator: authenticator,
        });

        // Step 2.a.iii: Set service endpoint
        this.service.setServiceUrl(endpoint);
      }
    } else {
      // Step 2.a: Initialize a new service instance
      // Step 2.a.i: Create authenticator
      const authenticator = new IamAuthenticator({
        apikey: api_key,
      });

      // Step 2.a.ii: Create service instance
      this.service = new CloudantV1({
        authenticator: authenticator,
      });

      // Step 2.a.iii: Set service endpoint
      this.service.setServiceUrl(endpoint);
    }

    // Step 3: Update endpoint, api key and version
    this.endpoint = endpoint;
    this.api_key = api_key;
  }

  /**
   * Fetch models
   * @returns
   */
  async save(data: CloudantV1.Document): Promise<string> {
    const save_response = await this.service.postDocument({
      db: 'conversations',
      document: data,
    });

    return save_response.result['id'];
  }
}

export function getDatabase(endpoint: string, api_key: string): Database {
  return new IBMCloudant(endpoint, api_key);
}
