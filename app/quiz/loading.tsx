export default function QuizLoading() {
  return (
    <div className="min-h-screen p-6 space-y-6">
      <div className="h-5 w-24 bg-slate-800/50 rounded animate-pulse" />
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="h-10 w-48 bg-slate-800/50 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-24 bg-slate-800/30 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-48 bg-slate-800/30 rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
