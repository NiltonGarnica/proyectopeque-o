# Angular Frontend TODO

## Plan Breakdown (Approved)
1. ✅ [Complete] Create TODO.md
2. [Pending] Execute `npx @angular/cli@latest new frontend --routing=false --style=css --ssr=false --standalone=false` to scaffold base project
3. [Pending] Install Angular Material? No, simple UI - skip
4. [Pending] Edit main.ts: bootstrap HttpClient
5. [Pending] Create app.config.ts: provide HttpClient
6. [Pending] Create app.routes.ts: routes + simple auth guard
7. [Pending] Generate LoginComponent (ng g c login --standalone)
8. [Pending] Implement login.component.ts/html: form, POST /login, localStorage, navigate
9. [Pending] Generate DashboardComponent (ng g c dashboard --standalone)
10. [Pending] Implement dashboard: input, POST /actividad, GET /actividades/:userId
11. [Pending] Create auth.service.ts (ng g s auth)
12. [Pending] Create activity.service.ts (ng g s activity)
13. [Pending] Update app.component.html: router-outlet
14. [Pending] Test: cd frontend && npm install && ng serve --port 4201
15. [Pending] [Complete] attempt_completion
