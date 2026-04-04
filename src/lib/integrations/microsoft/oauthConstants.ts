export const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
export const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
export const MICROSOFT_GRAPH_ME = "https://graph.microsoft.com/v1.0/me";

/** Calendars.Read + identity; offline_access for refresh_token */
export const MICROSOFT_OAUTH_SCOPES = [
  "offline_access",
  "openid",
  "profile",
  "email",
  "User.Read",
  "Calendars.Read",
] as const;
