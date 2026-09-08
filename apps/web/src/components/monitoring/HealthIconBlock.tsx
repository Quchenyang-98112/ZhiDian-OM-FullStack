import { ShieldAlert, ShieldCheck } from 'lucide-react';

export function HealthIconBlock({ error }: { error: string | null }) {
  return error ? (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15">
      <ShieldAlert size={24} className="text-red-400" />
    </div>
  ) : (
    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
      <ShieldCheck size={24} className="text-emerald-400" />
    </div>
  );
}
