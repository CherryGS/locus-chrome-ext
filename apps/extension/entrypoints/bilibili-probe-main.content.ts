import { observeBilibiliSource } from '@/host/chrome/bilibili-observer';
export default defineContentScript({ registration: 'runtime', runAt: 'document_start', world: 'MAIN', main: observeBilibiliSource });
