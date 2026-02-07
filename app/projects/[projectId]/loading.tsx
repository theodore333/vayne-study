export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto">
      <div className="animate-pulse">
        <div className="h-8 bg-slate-800 rounded w-64 mb-2" />
        <div className="h-4 bg-slate-800 rounded w-96 mb-8" />
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-48 bg-slate-800/50 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
