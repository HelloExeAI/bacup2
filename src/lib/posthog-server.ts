import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function isPostHogServerEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim());
}

export function getPostHogClient() {
  if (!posthogClient) {
    posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

/**
 * Fire-and-forget safe capture for API routes (flushes so serverless handlers don’t drop events).
 */
export async function capturePostHogServerEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  if (!isPostHogServerEnabled()) return;
  try {
    const posthog = getPostHogClient();
    posthog.capture({ distinctId, event, properties: properties ?? {} });
    await posthog.flush();
  } catch (e) {
    console.warn("[posthog] capture failed", e);
  }
}
