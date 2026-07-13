/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  withErrorHandler,
  ExternalServiceError,
  assertExists,
} from '@/src/app/api/middleware/errorHandler';
import { validateBody } from '@/src/app/api/middleware/validation';
import { issuesPostSchema } from '@/src/app/api/schemas/issues.schema';

// forces the route handler to be dynamic
export const dynamic = 'force-dynamic';

export const POST = withErrorHandler(async (req: Request) => {
  // Step 1: Parse and validate request body
  const requestBody = await req.json();
  const { title, description, conversation } = validateBody(
    requestBody,
    issuesPostSchema,
  );

  // Validate environment configuration. GITHUB_REPO is the "owner/name" slug;
  // GITHUB_API_URL defaults to public github.com but can point at a GitHub
  // Enterprise instance (e.g. https://github.example.com/api/v3).
  assertExists(process.env.GITHUB_TOKEN, 'GitHub token not configured');
  assertExists(process.env.GITHUB_REPO, 'GitHub repository not configured');
  const apiUrl = (
    process.env.GITHUB_API_URL ?? 'https://api.github.com'
  ).replace(/\/$/, '');

  const issueBody =
    `## Description\n\n${description}\n\n## Conversation:\n\n` +
    '```json\n' +
    JSON.stringify(conversation, null, 2) +
    '\n```';

  try {
    const create_issue_request = await fetch(
      `${apiUrl}/repos/${process.env.GITHUB_REPO}/issues`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: title,
          body: issueBody,
        }),
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
        },
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!create_issue_request.ok) {
      throw new Error(`GitHub API returned ${create_issue_request.status}`);
    }

    const response = await create_issue_request.json();

    // html_url is the browser-facing issue page; number is the issue id.
    return Response.json({
      issueNumber: response.number,
      issueUrl: response.html_url,
    });
  } catch (error: any) {
    throw new ExternalServiceError('GitHub', 'Failed to create issue', {
      originalError: error.message,
    });
  }
});
