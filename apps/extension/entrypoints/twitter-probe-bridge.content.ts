import { bridgeAuthenticatedSource } from '@/host/chrome/probe-bridge';
export default defineContentScript({ registration:'runtime', runAt:'document_start', main:bridgeAuthenticatedSource });
