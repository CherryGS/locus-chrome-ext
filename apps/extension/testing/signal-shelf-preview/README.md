# Production UI preview

Run `pnpm --dir apps/extension exec vite --config testing/signal-shelf-preview/vite.config.ts` and open http://127.0.0.1:5179/.

This loads production ResultsApp and its shared stylesheet against the existing
Inbox smoke test's disposable in-memory host fixture. It is not an extension
runtime or Locus server. Grants, export, clear and continuation are intercepted;
no user data, credentials, browser permission or network request is changed.
Every row is synthetic. Reload resets all mutations. This fixture is absent from
production entrypoints. Use the installed extension for final host verification.

## Toast resize regression

Open http://127.0.0.1:5179/toast.html. Add a short notification, then a long
notification. Repeat in the reverse order after reloading. Expand the stack by
hovering or focusing it, close its notifications, and resize to a narrow viewport.
The visible browser-error count must remain zero, each expanded notification must
fit its content, and closing the stack must restore access to the controls.

This fixture uses the production toast component and native ResizeObserver. It
records window errors without suppressing them and makes no host requests. Before
the fix, stacking notifications of unequal heights produced the same
`ResizeObserver loop completed with undelivered notifications.` error as the user
report. Content must retain its natural height rather than inherit the stack's
animated height. Actual extension reload remains a separate manual check.
