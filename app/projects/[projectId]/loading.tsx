export default function ProjectLoading() {
  return (
    <div className="page-container">
      <div className="skeleton skeleton-kicker" />
      <div className="skeleton skeleton-title" />
      <div className="loading-signal-grid">
        <div className="skeleton skeleton-signal" />
        <div className="skeleton skeleton-signal" />
        <div className="skeleton skeleton-signal" />
      </div>
      <div className="skeleton skeleton-wide" />
    </div>
  );
}
