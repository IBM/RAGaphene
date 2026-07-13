/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import classes from './Health.module.scss';

// ===================================================================================
//                               MAIN FUNCTION
// ===================================================================================
export default function Health() {
  return (
    <div className={classes.page}>
      <h1 className={classes.title}>
        Welcome to <br /> RAGaphene
      </h1>
    </div>
  );
}
