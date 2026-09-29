function Header({ title, subtitle, badge }) {
  return (
    <header className="app-header">
      <div className="brand-block">
        <div className="brand-mark">ASR</div>
        <div>
          <p className="eyebrow">ASR CINEMAS</p>
          <h1>{title}</h1>
        </div>
      </div>
      {subtitle && <p className="seat-summary">{subtitle}</p>}
      {badge && <span className="status-badge">{badge}</span>}
    </header>
  );
}

export default Header;
