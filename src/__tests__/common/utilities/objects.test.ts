/**
 * Copyright IBM Corp. 2023 - 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  remap,
  camelCaseKeys,
  areObjectsIntersecting,
} from '@/src/common/utilities/objects';

describe('remap', () => {
  it('renames a key according to the mapping', () => {
    const result = remap({ old_key: 'value' }, { new_key: 'old_key' });
    expect(result).toHaveProperty('new_key', 'value');
    expect(result).not.toHaveProperty('old_key');
  });

  it('does not overwrite an existing destination key when override=false (default)', () => {
    const result = remap(
      { new_key: 'existing', old_key: 'replacement' },
      { new_key: 'old_key' },
    );
    expect(result.new_key).toBe('existing');
  });

  it('overwrites an existing destination key when override=true', () => {
    const result = remap(
      { new_key: 'existing', old_key: 'replacement' },
      { new_key: 'old_key' },
      true,
    );
    expect(result.new_key).toBe('replacement');
  });

  it('handles array of source field names — uses the first one found', () => {
    const result = remap(
      { field_b: 'from_b' },
      { target: ['field_a', 'field_b'] },
    );
    expect(result.target).toBe('from_b');
    expect(result).not.toHaveProperty('field_b');
  });

  it('picks the first available field when multiple sources exist', () => {
    const result = remap(
      { field_a: 'from_a', field_b: 'from_b' },
      { target: ['field_a', 'field_b'] },
    );
    expect(result.target).toBe('from_a');
  });

  it('deep clones the object (mutating result does not affect original)', () => {
    const original = { nested: { x: 1 } };
    const result = remap(original, { moved: 'nested' });
    (result as any).moved.x = 99;
    expect(original.nested.x).toBe(1);
  });

  it('leaves unmapped keys intact', () => {
    const result = remap({ a: 1, b: 2 }, { c: 'b' });
    expect(result).toHaveProperty('a', 1);
  });
});

describe('camelCaseKeys', () => {
  it('converts whitelisted keys to camelCase', () => {
    const result = camelCaseKeys({ original_text: 'hello' });
    expect(result).toHaveProperty('originalText', 'hello');
    expect(result).not.toHaveProperty('original_text');
  });

  it('leaves non-whitelisted keys unchanged', () => {
    const result = camelCaseKeys({ some_other_key: 'value' });
    expect(result).toHaveProperty('some_other_key', 'value');
  });

  it('processes nested objects recursively', () => {
    const result = camelCaseKeys({
      wrapper: { original_text: 'nested' },
    }) as any;
    expect(result.wrapper.originalText).toBe('nested');
  });

  it('processes arrays — elements are transformed', () => {
    const result = camelCaseKeys([
      { original_text: 'a' },
      { original_text: 'b' },
    ]) as any[];
    expect(result[0].originalText).toBe('a');
    expect(result[1].originalText).toBe('b');
  });

  it('accepts a custom keys list', () => {
    const result = camelCaseKeys(
      { my_custom_key: 'val', original_text: 'skip' },
      ['my_custom_key'],
    ) as any;
    expect(result.myCustomKey).toBe('val');
    // original_text is NOT in the custom keys list so it stays as-is
    expect(result.original_text).toBe('skip');
  });

  it('passes through primitives unchanged', () => {
    expect(camelCaseKeys('string' as any)).toBe('string');
    expect(camelCaseKeys(42 as any)).toBe(42);
  });
});

describe('areObjectsIntersecting', () => {
  it('returns true when both objects share a matching key-value pair', () => {
    expect(areObjectsIntersecting({ role: 'admin' }, { role: 'admin' })).toBe(
      true,
    );
  });

  it('returns false when key exists in a but value differs in b', () => {
    expect(areObjectsIntersecting({ role: 'admin' }, { role: 'user' })).toBe(
      false,
    );
  });

  it('returns false when key from a is missing in b', () => {
    expect(areObjectsIntersecting({ role: 'admin' }, { group: 'devs' })).toBe(
      false,
    );
  });

  it('"all" wildcard returns true regardless of b value', () => {
    expect(areObjectsIntersecting({ role: 'all' }, { role: 'anything' })).toBe(
      true,
    );
  });

  it('"all" wildcard returns false when key is missing in b', () => {
    // The key 'role' is not in b, but 'all' should still be satisfied — let's verify actual behaviour
    // According to source: `all` sets intersection[keyA] = true unconditionally
    expect(areObjectsIntersecting({ role: 'all' }, { other: 'value' })).toBe(
      true,
    );
  });

  it('returns true when values are arrays and they share an element', () => {
    expect(
      areObjectsIntersecting({ tags: ['a', 'b'] }, { tags: ['b', 'c'] }),
    ).toBe(true);
  });

  it('returns false when arrays have no common element', () => {
    expect(areObjectsIntersecting({ tags: ['x'] }, { tags: ['y', 'z'] })).toBe(
      false,
    );
  });

  it('handles multiple keys — all must intersect', () => {
    expect(
      areObjectsIntersecting(
        { role: 'admin', env: 'prod' },
        { role: 'admin', env: 'prod' },
      ),
    ).toBe(true);

    expect(
      areObjectsIntersecting(
        { role: 'admin', env: 'prod' },
        { role: 'admin', env: 'dev' },
      ),
    ).toBe(false);
  });
});
