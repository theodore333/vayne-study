export default function SubjectsLoading() {
  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-slate-800/50 rounded animate-pulse" />
        <div className="h-10 w-40 bg-slate-800/50 rounded-lg animate-pulse" />
      </div>
      <div className="flex gap-6">
        <div className="w-72 space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-12 bg-slate-800/30 rounded-lg animate-pulse" />
          ))}
        </div>
        <div className="flex-1 space-y-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-16 bg-slate-800/30 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
