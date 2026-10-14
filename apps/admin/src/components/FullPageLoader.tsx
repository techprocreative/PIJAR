export default function FullPageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-pijar-200 border-t-pijar-600" />
        <span className="text-sm">Memuat…</span>
      </div>
    </div>
  );
}
