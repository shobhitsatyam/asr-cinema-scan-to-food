function ProductCard({ product, onAdd }) {
  const isUnavailable = product.isAvailable === false || product.inStock === false;
  const variantInfo = product.variants?.length ? `${product.variants[0].size}` : product.shortDescription;

  return (
    <article
      className={`product-card ${isUnavailable ? 'unavailable' : ''}`}
      style={isUnavailable ? { opacity: 0.65, filter: 'grayscale(1)', cursor: 'not-allowed' } : {}}
    >
      <img src={product.image} alt={product.name} className="product-image" />
      <div className="product-content">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <h3>{product.name}</h3>
            {isUnavailable && (
              <span style={{ backgroundColor: '#fee2e2', color: '#dc2626', fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                SOLD OUT
              </span>
            )}
          </div>
          <p>{variantInfo}</p>
        </div>
        <div className="product-row">
          <span className="price">₹{product.basePrice}</span>
          {isUnavailable ? (
            <button type="button" className="add-button" disabled style={{ opacity: 0.5, cursor: 'not-allowed', backgroundColor: '#9ca3af' }}>
              Sold Out
            </button>
          ) : (
            <button type="button" className="add-button" onClick={() => onAdd(product)}>
              Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default ProductCard;
