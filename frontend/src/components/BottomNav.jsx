function BottomNav({ activeTab = 'menu' }) {
  const tabs = [
    { key: 'menu', label: 'Menu' },
    { key: 'combos', label: 'Combos' },
    { key: 'cart', label: 'Cart' },
    { key: 'orders', label: 'Orders' },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`nav-button ${activeTab === tab.key ? 'active' : ''}`}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export default BottomNav;
