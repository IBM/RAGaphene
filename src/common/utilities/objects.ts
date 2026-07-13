/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelCase, isPlainObject, isArray, isEmpty, cloneDeep } from 'lodash';

export function camelCaseKeys(
  obj: { [key: string]: any },
  keys: string[] = ['original_text'],
) {
  if (isArray(obj)) {
    return obj.map((v) => camelCaseKeys(v));
  } else if (isPlainObject(obj)) {
    return Object.keys(obj).reduce(
      (result, key) => ({
        ...result,
        ...(keys.includes(key)
          ? { [camelCase(key)]: camelCaseKeys(obj[key]) }
          : { [key]: camelCaseKeys(obj[key]) }),
      }),
      {},
    );
  }
  return obj;
}

function areArraysIntersecting(
  a: string | string[],
  b: string | string[],
): boolean {
  const arrayA: any[] = Array.isArray(a) ? a : [a];
  const arrayB: any[] = Array.isArray(b) ? b : [b];

  for (var i = 0; i < arrayA.length; i++) {
    if (arrayB.includes(arrayA[i])) {
      return true;
    }
  }
  return false;
}

// returns true if there exist a key:value pair that is the same for both objects
// does not account for nesting
// value of 'all' is always satisfied, unless the key does not appear in object b
// there is a match between missing value and an empty value or empty key
export function areObjectsIntersecting(
  a: { [key: string]: string | string[] },
  b: { [key: string]: string | string[] },
): boolean {
  var intersection: { [key: string]: boolean } = {};

  for (const [keyA, valuesA] of Object.entries(a)) {
    if (valuesA === 'all') {
      intersection[keyA] = true;
    } else {
      var isBempty: boolean =
        !b || !Object.keys(b).includes(keyA) || isEmpty(b[keyA]);

      if (!isEmpty(valuesA) && isBempty) {
        intersection[keyA] = false;
      } else {
        intersection[keyA] = isBempty
          ? false
          : areArraysIntersecting(valuesA, b[keyA]);
      }
    }
  }
  return Object.values(intersection).reduce((acc, ele) => acc && ele);
}

/**
 * Remaps key in the object with new keys provided in the mappings
 * @param obj - object to be remap
 * @param mappings
 * @param override
 * @returns
 */
export function remap(
  obj: { [key: string]: any },
  mappings: { [key: string]: string | string[] },
  override: boolean = false,
) {
  // Create a deep copyt of the originial object
  const remapped_obj = cloneDeep(obj);

  // Iterate over mappings
  for (const [to_field, from_fields] of Object.entries(mappings)) {
    // Skip remapping, if the to_field already exists in the dictionary and override is set to false
    if (remapped_obj.hasOwnProperty(to_field) && !override) {
      continue;
    }

    // Remap to first from_field and remove other from_fields
    let remapped: boolean = false;
    if (Array.isArray(from_fields)) {
      from_fields.forEach((from_field) => {
        if (remapped_obj.hasOwnProperty(from_field)) {
          const value_to_remap = cloneDeep(remapped_obj[from_field]);
          delete remapped_obj[from_field];

          if (!remapped) {
            remapped_obj[to_field] = value_to_remap;
            remapped = true;
          }
        }
      });
    } else {
      remapped_obj[to_field] = cloneDeep(remapped_obj[from_fields]);
      delete remapped_obj[from_fields];
    }
  }

  // Return
  return remapped_obj;
}
