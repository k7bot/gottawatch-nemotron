import { captureToken } from './token';

// MUST run before React renders or any request is made (web-app.md §3).
const captured = captureToken({
  location: window.location,
  storage: window.localStorage,
  replaceState: (url) => window.history.replaceState(null, '', url),
});

void import('./boot').then((m) => m.boot(captured));
