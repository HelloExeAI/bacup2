<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Bacup-2 Next.js 16.2.1 App Router project. The integration covers client-side initialization via `instrumentation-client.ts`, server-side tracking via `posthog-node`, a reverse proxy through Next.js rewrites, user identification on login/signup, error tracking, and 10 events across 5 files.

| Event | Description | File |
|---|---|---|
| `user_signed_up` | User successfully completed sign up | `src/modules/auth/AuthForm.tsx` |
| `user_logged_in` | User successfully logged in | `src/modules/auth/AuthForm.tsx` |
| `task_completed` | User marked a task as done in the Watch List | `src/modules/tasks/WatchList.tsx` |
| `task_reopened` | User marked a completed task back to pending | `src/modules/tasks/WatchList.tsx` |
| `task_edited` | User saved edits to a task | `src/modules/tasks/WatchList.tsx` |
| `task_deleted` | User deleted a task | `src/modules/tasks/WatchList.tsx` |
| `voice_note_started` | User started a voice recording session | `src/modules/scratchpad/VoiceInput.tsx` |
| `voice_note_saved` | Voice recording stopped and transcript saved | `src/modules/scratchpad/VoiceInput.tsx` |
| `today_focus_opened` | User opened the Today's Focus expanded panel | `src/modules/tasks/TodayFocus.tsx` |
| `voice_note_created` | Server: voice transcript saved and tasks extracted | `src/app/api/voice/save/route.ts` |

### Files created or modified

- **`instrumentation-client.ts`** (new) — Client-side PostHog initialization with error tracking and reverse proxy
- **`src/lib/posthog-server.ts`** (new) — Server-side PostHog Node.js client singleton
- **`next.config.ts`** (modified) — Added `/ingest` reverse proxy rewrites and `skipTrailingSlashRedirect`
- **`.env.local`** (modified) — Added `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST`
- **`src/modules/auth/AuthForm.tsx`** (modified) — `posthog.identify`, `user_signed_up`, `user_logged_in`, `posthog.captureException`
- **`src/modules/tasks/WatchList.tsx`** (modified) — `task_completed`, `task_reopened`, `task_edited`, `task_deleted`
- **`src/modules/scratchpad/VoiceInput.tsx`** (modified) — `voice_note_started`, `voice_note_saved`
- **`src/modules/tasks/TodayFocus.tsx`** (modified) — `today_focus_opened`
- **`src/app/api/voice/save/route.ts`** (modified) — Server-side `voice_note_created` via posthog-node

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics**: https://us.posthog.com/project/368139/dashboard/1428775
- **Signup to Login Conversion Funnel**: https://us.posthog.com/project/368139/insights/q3oI6A8Q
- **Voice Note Start to Save Funnel**: https://us.posthog.com/project/368139/insights/lIiWVNcB
- **Sign-ups & Daily Active Users**: https://us.posthog.com/project/368139/insights/fC6Uub9w
- **Task Completion vs Deletion**: https://us.posthog.com/project/368139/insights/dTCwCXFo
- **Voice Notes Created per Day**: https://us.posthog.com/project/368139/insights/sb5MGe5h

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
