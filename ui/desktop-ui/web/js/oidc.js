const TOKEN_KEY = "epydios.agentops.token";
const CLAIMS_KEY = "epydios.agentops.claims";
const OIDC_TXN_KEY = "epydios.agentops.oidc.txn";

function parseHashToken() {
  if (!window.location.hash || window.location.hash.length < 2) {
    return null;
  }
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  if (!accessToken) {
    return null;
  }
  const idToken = params.get("id_token");
  return { accessToken, idToken };
}

function parseCodeExchange() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description");
  if (error) {
    throw new Error(`${error}: ${errorDescription || "authorization failed"}`);
  }
  if (!code) {
    return null;
  }
  return { code, state };
}

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length < 2) {
    return {};
  }
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  try {
    const json = atob(padded);
    return JSON.parse(json);
  } catch (_) {
    return {};
  }
}

function tokenExpired(claims) {
  if (!claims.exp) {
    return false;
  }
  return Math.floor(Date.now() / 1000) >= claims.exp;
}

function persistToken(token, claims) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(CLAIMS_KEY, JSON.stringify(claims || {}));
}

function getOidcTransaction() {
  const raw = sessionStorage.getItem(OIDC_TXN_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function clearOidcTransaction() {
  sessionStorage.removeItem(OIDC_TXN_KEY);
}

function randomString(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  let out = "";
  for (const value of arr) {
    out += String.fromCharCode(97 + (value % 26));
  }
  return out;
}

function base64UrlEncode(bytes) {
  let raw = "";
  for (const byte of bytes) {
    raw += String.fromCharCode(byte);
  }
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(value) {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return base64UrlEncode(new Uint8Array(digest));
}

export function getSession() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    return { authenticated: false, token: null, claims: {} };
  }
  let claims = {};
  try {
    claims = JSON.parse(sessionStorage.getItem(CLAIMS_KEY) || "{}");
  } catch (_) {
    claims = {};
  }
  if (tokenExpired(claims)) {
    logout();
    return { authenticated: false, token: null, claims: {} };
  }
  return { authenticated: true, token, claims };
}

function mockLoginSession() {
  const claims = {
    sub: "agentops-demo-user",
    tenant_id: "tenant-demo",
    project_id: "project-core",
    client_id: "epydios-runtime-prod-client",
    roles: ["runtime.admin", "runtime.run.read", "runtime.run.create"],
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  persistToken("mock-token", claims);
  return { authenticated: true, token: "mock-token", claims };
}

export async function beginLogin(config) {
  const auth = config.auth || {};
  if (config.mockMode || auth.mockLogin) {
    mockLoginSession();
    return;
  }

  const usePkce = auth.usePkce !== false && String(auth.responseType || "code").includes("code");
  const authorizeURLBase = auth.authorizationEndpoint || new URL("authorize", auth.issuer).toString();
  const authorizeUrl = new URL(authorizeURLBase);

  const responseType = usePkce ? "code" : auth.responseType || "token";
  authorizeUrl.searchParams.set("response_type", responseType);
  authorizeUrl.searchParams.set("client_id", auth.clientId || "");
  authorizeUrl.searchParams.set("redirect_uri", auth.redirectUri || window.location.href);
  authorizeUrl.searchParams.set("scope", auth.scopes || "openid profile email");

  if (usePkce) {
    const codeVerifier = randomString(48);
    const state = randomString(24);
    const nonce = randomString(24);
    const startedAt = Date.now();
    const codeChallenge = await sha256Base64Url(codeVerifier);
    sessionStorage.setItem(
      OIDC_TXN_KEY,
      JSON.stringify({
        codeVerifier,
        state,
        nonce,
        startedAt
      })
    );
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("nonce", nonce);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    if (auth.audience) {
      authorizeUrl.searchParams.set("audience", auth.audience);
    }
    window.location.assign(authorizeUrl.toString());
    return;
  }

  if (auth.audience) {
    authorizeUrl.searchParams.set("audience", auth.audience);
  }
  window.location.assign(authorizeUrl.toString());
}

async function exchangeAuthorizationCode(config, codePayload) {
  const auth = config.auth || {};
  const tokenEndpoint = auth.tokenEndpoint || new URL("oauth/token", auth.issuer).toString();
  const txn = getOidcTransaction();

  if (!txn?.codeVerifier || !txn?.state) {
    throw new Error("missing OIDC transaction state");
  }
  if (codePayload.state !== txn.state) {
    throw new Error("OIDC state mismatch");
  }
  if (Date.now() - (txn.startedAt || 0) > 10 * 60 * 1000) {
    throw new Error("OIDC transaction expired");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("client_id", auth.clientId || "");
  body.set("code", codePayload.code);
  body.set("redirect_uri", auth.redirectUri || `${window.location.origin}${window.location.pathname}`);
  body.set("code_verifier", txn.codeVerifier);
  if (auth.audience) {
    body.set("audience", auth.audience);
  }

  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });
  if (!response.ok) {
    throw new Error(`token exchange failed: HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!payload?.access_token) {
    throw new Error("token exchange response missing access_token");
  }

  const claims = payload.id_token ? decodeJwtPayload(payload.id_token) : decodeJwtPayload(payload.access_token);
  persistToken(payload.access_token, claims);
  clearOidcTransaction();
  history.replaceState(null, "", window.location.pathname);
}

export async function bootstrapAuth(config) {
  if (!config.auth?.enabled) {
    return { authenticated: true, token: null, claims: {} };
  }

  const incoming = parseHashToken();
  if (incoming?.accessToken) {
    const claims = incoming.idToken ? decodeJwtPayload(incoming.idToken) : decodeJwtPayload(incoming.accessToken);
    persistToken(incoming.accessToken, claims);
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  const codePayload = parseCodeExchange();
  if (codePayload) {
    await exchangeAuthorizationCode(config, codePayload);
  }

  return getSession();
}

export function logout() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(CLAIMS_KEY);
  clearOidcTransaction();
}
