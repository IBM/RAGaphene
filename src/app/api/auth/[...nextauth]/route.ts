/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import NextAuth from 'next-auth';
import { authOptions } from './options';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
