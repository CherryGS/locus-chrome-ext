import { useRef, type SyntheticEvent } from 'react';
import { Checkbox } from '@/components/ui/checkbox';

export function TrustedCheckbox({ id, checked, onChange }: { id: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const trustedDispatch = useRef(false);
  function remember(event: SyntheticEvent) {
    if (!event.nativeEvent.isTrusted) return;
    trustedDispatch.current = true;
    queueMicrotask(() => { trustedDispatch.current = false; });
  }
  return <Checkbox nativeButton render={<button type="button" />} id={id} checked={checked}
    onClick={remember}
    onCheckedChange={(next, details) => {
      // Base UI forwards even a real root click through a synthesized hidden-input
      // click. Accept only that same synchronous trusted dispatch, never a stored
      // user-activation flag or an arbitrary later script-generated change.
      const trusted = details.event.isTrusted || trustedDispatch.current;
      trustedDispatch.current = false;
      if (!trusted) { details.event.preventDefault(); details.cancel(); return; }
      onChange(next);
    }} />;
}
