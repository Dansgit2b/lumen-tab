import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import dnsCb from "node:dns";
import net from "node:net";
import { Agent, fetch as ufetch } from "undici";
import ipaddr from "ipaddr.js";

export const BRAND = "Lumenworks";
const MAX_HTML_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT = `${BRAND}/1.0 (url-to-markdown extractor; LumenTab demo)`;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

export function isPrivateOrReserved(ip) {
  try {
    const parsed = ipaddr.parse(ip);
    const range = parsed.range();
    const bad = new Set([
      "unspecified",
      "broadcast",
      "loopback",
      "linkLocal",
      "uniqueLocal",
      "private",
      "carrierGradeNat",
      "reserved",
      "rfc6598",
      "benchmarking",
      "discard",
      "ipv4Mapped",
    ]);
    if (bad.has(range)) return true;
    // IPv6 specials
    if (parsed.kind() === "ipv6") {
      const s = parsed.toNormalizedString();
      if (s === "::" || s === "::1") return true;
      if (s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80")) return true;
    }
    return false;
  } catch {
    return true;
  }
}

// ---- Egress-aware DNS safety ----------------------------------------------
// This box sits behind a transparent egress proxy that answers every public
// hostname with a "fake IP" in 198.18.0.0/15. So we (1) validate the REAL public
// addresses via DNS-over-HTTPS (Cloudflare, fallback Google) and (2) at connect
// time only permit fake-IP addresses (which can only reach the public internet
// through the proxy) or genuinely public addresses. Loopback/private/link-local
// are always refused at connect time.
const FAKE_IP_RANGE = ipaddr.parseCIDR("198.18.0.0/15");
function isFakeEgressIp(ip) {
  try {
    const p = ipaddr.parse(ip);
    return p.kind() === "ipv4" && p.match(FAKE_IP_RANGE);
  } catch {
    return false;
  }
}

const dohCache = new Map(); // host -> { ok, reason, exp }
async function dohResolve(host, type) {
  const urls = [
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
    `https://dns.google/resolve?name=${encodeURIComponent(host)}&type=${type}`,
  ];
  let lastErr;
  for (const u of urls) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await ufetch(u, { headers: { accept: "application/dns-json" }, signal: ctrl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error(`DoH HTTP ${r.status}`);
      const j = await r.json();
      const want = type === "A" ? 1 : 28;
      return (j.Answer || []).filter((a) => a.type === want).map((a) => a.data);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("DoH failed");
}

async function validateHostPublic(host) {
  const c = dohCache.get(host);
  if (c && c.exp > Date.now()) {
    if (!c.ok) throw Object.assign(new Error(c.reason), { status: 400 });
    return;
  }
  let addrs = [];
  try {
    const [a, aaaa] = await Promise.all([dohResolve(host, "A"), dohResolve(host, "AAAA").catch(() => [])]);
    addrs = [...a, ...aaaa];
  } catch {
    throw Object.assign(new Error("DNS resolution failed"), { status: 400 });
  }
  let reason = null;
  if (!addrs.length) reason = "DNS resolution returned no addresses";
  else if (addrs.some((ip) => isPrivateOrReserved(ip))) reason = "Resolved address is private/reserved (SSRF blocked)";
  dohCache.set(host, { ok: !reason, reason, exp: Date.now() + 60_000 });
  if (reason) throw Object.assign(new Error(reason), { status: 400 });
}

function safeLookup(hostname, options, cb) {
  dnsCb.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return cb(err);
    const list = Array.isArray(addrs) ? addrs : [{ address: addrs, family: 4 }];
    const okAddr = (a) => isFakeEgressIp(a.address) || !isPrivateOrReserved(a.address);
    if (!list.length || !list.every(okAddr)) {
      return cb(Object.assign(new Error("SSRF blocked: private/reserved address"), { code: "ESSRF" }));
    }
    if (options && options.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}
const safeAgent = new Agent({
  connect: { lookup: safeLookup, timeout: 8000 },
  headersTimeout: 10_000,
  bodyTimeout: 10_000,
});

export async function assertSafePublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw Object.assign(new Error("Invalid URL"), { status: 400 });
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw Object.assign(new Error("Only http/https URLs are allowed"), { status: 400 });
  }
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port)) {
    throw Object.assign(new Error("Port not allowed"), { status: 400 });
  }
  if (u.username || u.password) {
    throw Object.assign(new Error("URLs with credentials are not allowed"), { status: 400 });
  }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || BLOCKED_HOSTNAMES.has(host) || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    throw Object.assign(new Error("Hostname not allowed"), { status: 400 });
  }
  if (net.isIP(host)) {
    if (isPrivateOrReserved(host)) {
      throw Object.assign(new Error("Private/reserved IP addresses are blocked"), { status: 400 });
    }
    return u;
  }
  await validateHostPublic(host);
  return u;
}

function buildTurndown() {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  td.use(gfm);
  td.remove(["script", "style", "noscript", "iframe", "svg", "form"]);
  return td;
}

export async function fetchHtml(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await ufetch(url.href, {
      dispatcher: safeAgent,
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.8",
      },
    });
    // Follow up to 3 redirects, re-validating each hop
    let current = res;
    let finalUrl = url;
    for (let i = 0; i < 3 && [301, 302, 303, 307, 308].includes(current.status); i++) {
      const loc = current.headers.get("location");
      if (!loc) break;
      finalUrl = await assertSafePublicUrl(new URL(loc, finalUrl).href);
      current = await ufetch(finalUrl.href, {
        dispatcher: safeAgent,
        method: "GET",
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        },
      });
    }
    if (!current.ok) {
      throw Object.assign(new Error(`Upstream HTTP ${current.status}`), { status: 502 });
    }
    const ctype = (current.headers.get("content-type") || "").toLowerCase();
    if (!ctype.includes("html") && !ctype.includes("xml") && !ctype.includes("text/plain")) {
      throw Object.assign(new Error(`Unsupported content-type: ${ctype || "unknown"}`), {
        status: 415,
      });
    }
    const len = Number(current.headers.get("content-length") || 0);
    if (len > MAX_HTML_BYTES) {
      throw Object.assign(new Error("Document too large"), { status: 413 });
    }
    const buf = Buffer.from(await current.arrayBuffer());
    if (buf.length > MAX_HTML_BYTES) {
      throw Object.assign(new Error("Document too large"), { status: 413 });
    }
    return { html: buf.toString("utf8"), finalUrl: finalUrl.href, status: current.status };
  } finally {
    clearTimeout(t);
  }
}

export function extractArticle(html, pageUrl) {
  const dom = new JSDOM(html, { url: pageUrl });
  const doc = dom.window.document;
  const meta = {
    title:
      doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
      doc.querySelector("title")?.textContent?.trim() ||
      null,
    description:
      doc.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
      doc.querySelector('meta[name="description"]')?.getAttribute("content") ||
      null,
    siteName:
      doc.querySelector('meta[property="og:site_name"]')?.getAttribute("content") || null,
    image: doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || null,
    language: doc.documentElement?.lang || null,
    canonical:
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href") ||
      doc.querySelector('meta[property="og:url"]')?.getAttribute("content") ||
      pageUrl,
  };
  const reader = new Readability(doc);
  const article = reader.parse();
  const td = buildTurndown();
  let markdown;
  let byline = article?.byline || null;
  let excerpt = article?.excerpt || meta.description;
  if (article?.content) {
    markdown = td.turndown(article.content);
    if (!meta.title && article.title) meta.title = article.title;
  } else {
    // Fallback: body text via turndown of main/body
    const main = doc.querySelector("main, article, [role=main], body");
    markdown = main ? td.turndown(main.innerHTML) : "";
  }
  return { meta, markdown, byline, excerpt };
}


export const DEFAULT_MAX_CHARS = 50_000;

// ---- robots.txt (good-faith compliance; on-demand single-page fetches) ----
const robotsCache = new Map(); // origin -> { rules, exp }
function parseRobots(txt) {
  const groups = [];
  let cur = null;
  let lastWasUA = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase();
    const v = line.slice(i + 1).trim();
    if (k === "user-agent") {
      if (!cur || !lastWasUA) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      lastWasUA = true;
    } else {
      lastWasUA = false;
      if (!cur) continue;
      if (k === "allow" || k === "disallow") cur.rules.push({ allow: k === "allow", path: v });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a.includes("lumenworks") || a.includes("lumen works")));
  const star = groups.filter((g) => g.agents.includes("*"));
  return (mine.length ? mine : star).flatMap((g) => g.rules);
}
function robotsMatch(pattern, path) {
  if (!pattern) return false;
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const re = esc.endsWith("\\$") ? new RegExp("^" + esc.slice(0, -2) + "$") : new RegExp("^" + esc);
  return re.test(path);
}
async function robotsAllowed(u) {
  const origin = u.origin;
  let c = robotsCache.get(origin);
  if (!c || c.exp < Date.now()) {
    let rules = [];
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 4000);
      const r = await ufetch(origin + "/robots.txt", { dispatcher: safeAgent, signal: ctrl.signal, headers: { "user-agent": USER_AGENT }, redirect: "follow" });
      clearTimeout(t);
      if (r.ok) rules = parseRobots((await r.text()).slice(0, 200_000));
    } catch {}
    c = { rules, exp: Date.now() + 3600_000 };
    robotsCache.set(origin, c);
  }
  const path = u.pathname + (u.search || "");
  let best = null;
  for (const rule of c.rules) {
    if (rule.path === "" ) continue;
    if (robotsMatch(rule.path, path) && (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow))) best = rule;
  }
  return !best || best.allow;
}

/** Full pipeline: validate → fetch (SSRF-safe) → readability → markdown. */
export async function extractUrl(urlRaw, maxCharsIn) {
  if (!urlRaw || typeof urlRaw !== "string" || urlRaw.length > 2048) {
    throw Object.assign(new Error("Provide 'url' (string, max 2048 chars)"), { status: 400 });
  }
  let maxChars = Number(maxCharsIn ?? DEFAULT_MAX_CHARS);
  if (!Number.isFinite(maxChars) || maxChars < 1000) maxChars = DEFAULT_MAX_CHARS;
  if (maxChars > 100_000) maxChars = 100_000;
  const safeUrl = await assertSafePublicUrl(urlRaw);
  if (!(await robotsAllowed(safeUrl))) {
    throw Object.assign(new Error("Disallowed by the site's robots.txt (not fetched, not charged)"), { status: 403 });
  }
  const { html, finalUrl } = await fetchHtml(safeUrl);
  const { meta, markdown: rawMd, byline, excerpt } = extractArticle(html, finalUrl);
  let markdown = (rawMd || "").trim();
  let truncated = false;
  if (markdown.length > maxChars) {
    markdown = markdown.slice(0, maxChars) + "\n\n…[truncated]";
    truncated = true;
  }
  const wordCount = markdown ? markdown.split(/\s+/).filter(Boolean).length : 0;
  return {
    brand: BRAND,
    title: meta.title,
    url: finalUrl,
    canonical: meta.canonical,
    description: excerpt || meta.description,
    siteName: meta.siteName,
    byline,
    language: meta.language,
    image: meta.image,
    wordCount,
    readingTimeMin: Math.max(1, Math.round(wordCount / 230)),
    truncated,
    markdown,
    fetchedAt: new Date().toISOString(),
  };
}
