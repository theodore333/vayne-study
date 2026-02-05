export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="h-8 w-48 bg-slate-800/50 rounded animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-slate-800/30 rounded-xl animate-pulse" />
        ))}
      </div>
      <div className="h-64 bg-slate-800/30 rounded-xl animate-pulse" />
    </div>
  );
}
