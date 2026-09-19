import { ResultDatabase } from '../../host/chrome/database';
import { createArchive } from '../../host/chrome/archive';
const db = new ResultDatabase('locus-bilibili-probe-v1');
let previewUrl: string | undefined;
addEventListener('pagehide', () => { if (previewUrl) URL.revokeObjectURL(previewUrl); void db.close(); });
Object.assign(globalThis, { probe: {
  assemble: (args: object) => chrome.runtime.sendMessage({ target: 'probe-offscreen', op: 'assemble', ...args }),
  cancel: () => chrome.runtime.sendMessage({ target: 'probe-offscreen', op: 'cancel' }),
  exists: async (id: string) => !!await db.metadata(id),
  async reopen(id: string, endpoint: string) {
    const snapshot = await db.read(id); if (!snapshot?.blobs.video) throw new Error('No retained complete video');
    const archive = await createArchive(snapshot); if (archive.partial) throw new Error('Unexpected partial archive');
    for (const [name, blob] of [['output.mp4', snapshot.blobs.video], ['export.zip', archive.blob]] as const) {
      const response = await fetch(`${endpoint}/${name}`, { method: 'POST', body: blob }); if (!response.ok) throw new Error('Artifact write failed');
    }
    const video = document.createElement('video'); video.controls = true; video.muted = true; video.style.width = '640px';
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(snapshot.blobs.video); video.src = previewUrl; document.body.replaceChildren(video);
    return { bytes: snapshot.blobs.video.size, retention: snapshot.result.retention, readErrors: snapshot.readErrors };
  },
} });
