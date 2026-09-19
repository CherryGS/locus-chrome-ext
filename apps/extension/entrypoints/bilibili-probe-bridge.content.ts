import { bridgeAuthenticatedSource } from '@/host/chrome/probe-bridge';
import { BILI_CHANNEL, biliIdentity } from '@/host/chrome/bilibili-protocol';
import { BILIBILI_SOURCE_LIMIT } from '@locus/bilibili/projection';
export default defineContentScript({ registration: 'runtime', runAt: 'document_start', main: () => bridgeAuthenticatedSource({ identity: biliIdentity, channel: BILI_CHANNEL, ready: 'bilibili-ready', data: 'bilibili-data', limit: BILIBILI_SOURCE_LIMIT }) });
