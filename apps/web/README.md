# apps/web: phone PWA

Live: https://gottawatch.example (also https://gottawatch.example) · Spec: [docs/specs/web-app.md](../../docs/specs/web-app.md) · Tasks: [docs/tasks/web-tasks.md](../../docs/tasks/web-tasks.md)

```bash
npm run dev -w apps/web                          # live API (CORS only allows the CloudFront origin, so local dev → use mock)
VITE_API_MODE=mock npm run dev -w apps/web       # mock data, DEMO DATA badge (dev server only); ?scenario=offline|invalid|search-error|send-error
npm test -w apps/web && npm run typecheck -w apps/web
npm run build -w apps/web                        # dist/ (deployed by the deploy-api workflow)
```
Profile links (`/u/<token>`) are moved into localStorage and removed from the URL before the first render (`src/main.tsx`). Live e2e: `services/api/scripts/web-e2e.ts`.
