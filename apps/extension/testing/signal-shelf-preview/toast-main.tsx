import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Button } from '@/components/ui/button';
import { Toaster, toast } from '@/components/ui/toast';
import '@/assets/tailwind.css';

// Exercise real toast geometry with the native ResizeObserver. Errors are
// displayed without preventing or filtering their browser error events.
function ToastResizeFixture() {
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    const recordError = (event: ErrorEvent) => {
      setErrors(previous => [...previous, event.message]);
    };
    window.addEventListener('error', recordError);
    return () => window.removeEventListener('error', recordError);
  }, []);

  return (
    <Toaster>
      <main className="flex flex-col gap-4 p-6">
        <h1>Toast resize regression fixture</h1>
        <p>Disposable notifications only. No extension host or user data.</p>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => toast.add({ title: 'Short notification', timeout: 0 })}>
            Add short notification
          </Button>
          <Button onClick={() => toast.add({
            title: 'Synthetic extension connection failure',
            description: 'The extension was reloaded while this result page was open. This synthetic diagnostic text is intentionally longer than the first notification so their natural heights differ. Open the result page again to reconnect.',
            type: 'error',
            timeout: 0,
          })}>
            Add long notification
          </Button>
        </div>
        <output aria-label="Browser errors" aria-live="polite">
          {errors.length ? `${errors.length} browser errors: ${errors.join('; ')}` : '0 browser errors'}
        </output>
      </main>
    </Toaster>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<ToastResizeFixture />);
