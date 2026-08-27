export default function DashboardLoading() {
  return (
    <main className="loading-screen">
      <div className="loading-wrap">
        <div className="skeleton skeleton-kicker" />
        <div className="skeleton skeleton-title" />
        <div className="loading-stat-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
        <div className="skeleton skeleton-section" />
        <div className="loading-project-grid">
          <div className="skeleton skeleton-project" />
          <div className="skeleton skeleton-project" />
        </div>
      </div>
    </main>
  );
}
