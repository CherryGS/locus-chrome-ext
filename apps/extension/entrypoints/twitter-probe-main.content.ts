import { observeAuthenticatedSource } from '@/host/chrome/probe-observer';
export default defineContentScript({ registration:'runtime', world:'MAIN', runAt:'document_start', main:observeAuthenticatedSource });
