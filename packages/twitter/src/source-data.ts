/** Shared source values; normalization does not depend on JavaScript syntax parsing. */
export type Data = null | undefined | boolean | number | string | Data[] | { [key: string]: Data };
export type DataObject = { [key: string]: Data };

export function object(value: Data): DataObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
