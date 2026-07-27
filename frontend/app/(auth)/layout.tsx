import AuthBackground from "@/components/auth/AuthBackground";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <AuthBackground />
      {/* z-10 lifts the card above the fixed background */}
      <div
        className="relative z-10 w-full"
        style={{ maxWidth: "min(900px, 92vw)" }}
      >
        {children}
      </div>
    </div>
  );
}
