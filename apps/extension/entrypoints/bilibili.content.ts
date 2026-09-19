import { mountBilibiliControls } from '@/ui/bilibili/mount';
export default defineContentScript({ registration: 'runtime', main: mountBilibiliControls });
