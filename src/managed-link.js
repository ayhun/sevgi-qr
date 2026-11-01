const managedPath = /^\/api\/r\/(?:[A-Za-z0-9_-]{3,43}\/[A-Za-z0-9_-]{6}|[a-f0-9]{16}\/[a-f0-9]{12}|[a-f0-9]{24}\/[a-f0-9]{20})$/;

export function managedUrlOf(parameter, origin) {
  if (!parameter) return null;
  try {
    const candidate = new URL(parameter);
    return candidate.origin === origin && managedPath.test(candidate.pathname) && !candidate.search && !candidate.hash ? candidate.href : null;
  } catch { return null; }
}
