import type { Snapshot } from '@/core/results/model';
export function syntheticSnapshot(): Snapshot {
  const blob = new Blob(['synthetic bytes'], { type: 'image/jpeg' });
  return { result: { id: crypto.randomUUID(), site:'synthetic', label:'Disposable fixture', sourceUrl:'https://x.com/synthetic/status/1', createdAt:'2026-09-19T00:00:00Z', revision:1, retention:{ state:'pending', revision:0 }, records:[{ id:'record', assetIds:['file'], acquisition:{state:'acquired'}, payload:{ message:'Fixture' } }], assets:[{ id:'file', recordId:'record', description:{ sourceName:'../../unsafe.exe' }, acquisition:{state:'acquired'}, mime:blob.type, size:blob.size }] }, blobs:{file:blob}, readErrors:{} };
}
