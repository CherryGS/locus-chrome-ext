# Production UI preview

Run `pnpm --dir apps/extension exec vite --config testing/signal-shelf-preview/vite.config.ts` and open http://127.0.0.1:5179/.

This loads production ResultsApp and its shared stylesheet against the existing
Inbox smoke test's disposable in-memory host fixture. It is not an extension
runtime or Locus server. Grants, export, clear and continuation are intercepted;
no user data, credentials, browser permission or network request is changed.
Every row is synthetic. Reload resets all mutations. This fixture is absent from
production entrypoints. Use the installed extension for final host verification.
