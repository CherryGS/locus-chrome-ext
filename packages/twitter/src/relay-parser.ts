import { parse, type Node } from 'acorn';
import { object, type Data, type DataObject } from './source-data';

/** Read only the relayRecords data expression. Surrounding site code is never run. */
export function parseRelay(source: string): Record<string, DataObject> {
  if (source.length > 8_000_000) throw new Error('Source script exceeds the 8 MB capability limit');
  const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
  const slots = new Map<number, Data>();
  let budget = 250_000;
  type Ast = Node & Record<string, any>;
  const slot = (node: Ast): number => {
    if (node?.type !== 'MemberExpression' || !node.computed || node.object.type !== 'Identifier' || node.object.name !== '$R' || node.property.type !== 'Literal' || !Number.isSafeInteger(node.property.value) || node.property.value < 0) throw new Error('Unsupported data reference');
    return node.property.value;
  };
  function read(node: Ast, depth = 0): Data {
    if (--budget < 0 || depth > 80) throw new Error('Source data complexity limit exceeded');
    switch (node.type) {
      case 'Literal':
        if (node.regex || node.bigint || (typeof node.value === 'number' && (!Number.isFinite(node.value) || (Number.isInteger(node.value) && !Number.isSafeInteger(node.value))))) throw new Error('Unsupported data literal');
        return node.value;
      case 'UnaryExpression': {
        if (node.operator === 'void' && node.argument.type === 'Literal' && node.argument.value === 0) return undefined;
        const value = read(node.argument, depth + 1);
        if (node.operator === '!' && (value === 0 || value === 1)) return !value;
        if (node.operator === '-' && typeof value === 'number') return -value;
        throw new Error('Unsupported data operator');
      }
      case 'AssignmentExpression': {
        if (node.operator !== '=') throw new Error('Unsupported assignment');
        const key = slot(node.left);
        if (slots.has(key)) throw new Error('Duplicate data reference assignment');
        const value = read(node.right, depth + 1); slots.set(key, value); return value;
      }
      case 'MemberExpression': {
        const key = slot(node); if (!slots.has(key)) throw new Error('Unresolved data reference'); return slots.get(key);
      }
      case 'ArrayExpression': return node.elements.map((element: Ast) => { if (!element) throw new Error('Sparse data array'); return read(element, depth + 1); });
      case 'ObjectExpression': {
        const value: DataObject = Object.create(null);
        for (const property of node.properties) {
          if (property.type !== 'Property' || property.computed || property.method || property.shorthand || property.kind !== 'init') throw new Error('Executable data property');
          const key = property.key.type === 'Identifier' ? property.key.name : property.key.value;
          if (typeof key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(key) || Object.hasOwn(value, key)) throw new Error('Unsafe or duplicate data key');
          value[key] = read(property.value, depth + 1);
        }
        return value;
      }
      default: throw new Error(`Executable or unsupported data expression: ${node.type}`);
    }
  }
  const queue: Ast[] = [ast as Ast];
  let found: DataObject | undefined;
  let walked = 0;
  while (queue.length) {
    if (++walked > 500_000) throw new Error('Source syntax complexity limit exceeded');
    const node = queue.pop()!;
    if (node.type === 'Property' && !node.computed && (node.key.name === 'relayRecords' || node.key.value === 'relayRecords')) {
      if (found) throw new Error('Ambiguous source records');
      found = object(read(node.value)); continue;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) for (const item of value) { if (item && typeof item.type === 'string') queue.push(item); }
      else if (value && typeof value === 'object' && 'type' in value) queue.push(value as Ast);
    }
  }
  if (!found || !Object.keys(found).length) throw new Error('Recognized Twitter source records unavailable');
  const records: Record<string, DataObject> = Object.create(null);
  for (const [id, value] of Object.entries(found)) { const record = object(value); if (record.__id !== id || typeof record.__typename !== 'string') throw new Error('Invalid source record binding'); records[id] = record; }
  return records;
}
