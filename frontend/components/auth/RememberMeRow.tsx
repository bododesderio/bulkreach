/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import Link from "next/link";

/**
 * Session note + forgot-password link. There is no "remember me" toggle: the
 * refresh session always lasts 30 days (REFRESH_TOKEN_EXPIRE_DAYS), so an
 * interactive checkbox would have controlled nothing — we state the real
 * behaviour instead.
 */
export default function RememberMeRow() {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-text-muted">Stays signed in for 30 days</span>
      <Link
        href="/forgot-password"
        className="text-[13px] font-medium text-teal hover:opacity-80 transition-opacity"
      >
        Forgot password?
      </Link>
    </div>
  );
}
