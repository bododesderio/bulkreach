interface FormGridProps {
  children: React.ReactNode;
  columns?: 1 | 2;
}

export default function FormGrid({ children, columns = 1 }: FormGridProps) {
  return (
    <div
      className={`grid gap-4 ${columns === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}
    >
      {children}
    </div>
  );
}

export function FormActions({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 justify-end mt-4">{children}</div>;
}

export function FormCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-[11px] p-6">{children}</div>
  );
}
