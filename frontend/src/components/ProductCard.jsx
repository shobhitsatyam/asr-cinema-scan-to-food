function ProductCard({ product, onAdd }) {
  const variantInfo = product.variants?.length ? `${product.variants[0].size}` : product.shortDescription;

  return (
    <article className="product-card">
      <img src={product.image} alt={product.name} className="product-image" />
      <div className="product-content">
        <div>
          <h3>{product.name}</h3>
          <p>{variantInfo}</p>
        </div>
        <div className="product-row">
          <span className="price">₹{product.basePrice}</span>
          <button type="button" className="add-button" onClick={() => onAdd(product)}>
            Add
          </button>
        </div>
      </div>
    </article>
  );
}

export default ProductCard;
