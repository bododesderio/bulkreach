import React from "react";

interface AuthFormPanelProps {
  children: React.ReactNode;
}

// Mobile-only wordmark — shown when brand panel is hidden
function MiniWordmark() {
  return (
    <div className="flex items-center gap-2.5 mb-7 md:hidden">
      <div
        className="w-[28px] h-[28px] flex items-center justify-center shrink-0"
        style={{ borderRadius: "7px", background: "#1B1F4A" }}
      >
        <svg width="16" height="12" fill="none" viewBox="0 0 17 13" aria-hidden="true">
          <rect x=".5" y=".5" width="16" height="12" rx="2.5" fill="#00D4AA" />
          <path d="M.5 3.5L8.5 8l8-4.5" stroke="#0D0F2E" strokeWidth="1.5" />
        </svg>
      </div>
      <span className="font-display font-extrabold text-[20px] text-navy leading-none">
        BulkReach
      </span>
    </div>
  );
}

export default function AuthFormPanel({ children }: AuthFormPanelProps) {
  return (
    <div
      className="flex-1 flex flex-col justify-center bg-white px-6 py-8 md:px-11 md:py-12 md:min-h-[560px]"
    >
      <MiniWordmark />
      {children}
    </div>
  );
}
