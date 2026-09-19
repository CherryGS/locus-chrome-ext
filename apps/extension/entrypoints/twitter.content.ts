import { mountTwitterControls } from '@/ui/twitter/mount';
import { outsideAuthenticatedProbe } from '@/host/chrome/probe-protocol';
export default defineContentScript({
  registration: 'runtime',
  main: outsideAuthenticatedProbe(mountTwitterControls),
});
