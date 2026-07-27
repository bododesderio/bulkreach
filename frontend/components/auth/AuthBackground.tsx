// Full-screen navy gradient with subtle teal glow — no remote images
export default function AuthBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none"
      style={{
        background: [
          "radial-gradient(ellipse 55% 45% at 80% 20%, rgba(0,212,170,0.1) 0%, transparent 65%)",
          "linear-gradient(135deg, #0D0F2E 0%, #1B1F4A 100%)",
        ].join(", "),
      }}
    />
  );
}
