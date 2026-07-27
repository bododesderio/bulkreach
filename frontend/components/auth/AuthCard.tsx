import React from "react";
import AuthBrandPanel, { type AuthVariant } from "./AuthBrandPanel";
import AuthFormPanel from "./AuthFormPanel";

interface AuthCardProps {
  variant: AuthVariant;
  children: React.ReactNode;
}

export default function AuthCard({ variant, children }: AuthCardProps) {
  return (
    <div
      className="flex flex-row w-full overflow-hidden animate-fade-up"
      style={{
        borderRadius: "var(--auth-card-radius)",
        boxShadow: "var(--auth-card-shadow)",
      }}
    >
      <AuthBrandPanel variant={variant} />
      <AuthFormPanel>{children}</AuthFormPanel>
    </div>
  );
}
