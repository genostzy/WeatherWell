/**
 * Whether `path` is inside the officials' `/admin` area — the area whose own
 * header (`AdminHeader`) already owns sign-out, and whose sign-in heading
 * differs from a resident's.
 *
 * A bare `path.startsWith("/admin")` also matches "/administration" and
 * "/admin-help" — neither is an admin route, just a string that happens to
 * share the prefix. Matching the segment exactly (`/admin` itself, or
 * `/admin/` followed by anything) avoids that.
 */
export function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}
