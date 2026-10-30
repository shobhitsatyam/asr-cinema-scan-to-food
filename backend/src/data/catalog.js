/**
 * Authoritative Menu & Pricing Catalog for ASR Cinemas
 *
 * Source of truth for server-side order validation.
 * Client-submitted prices and totals are NEVER trusted.
 */

const catalogProducts = [
  // Popcorn
  {
    id: 'large-popcorn',
    aliases: [
      'p1',
      'popcorn',
      'prod-1',
      'popcorn-large',
      'popcorn-medium',
      'popcorn-regular',
      'regular popcorn',
      'medium popcorn',
      'large popcorn',
    ],
    name: 'Large Popcorn',
    category: 'Popcorn',
    basePrice: 600,
    isVeg: true,
    variants: [
      { id: 'var-pop-reg', name: 'Regular', size: '170g', price: 400 },
      { id: 'var-pop-med', name: 'Medium', size: '300g', price: 500 },
      { id: 'var-pop-lrg', name: 'Large', size: '350g', price: 600 },
    ],
    addOns: [
      { id: 'popcorn-cheese', name: 'Cheese', price: 50 },
      { id: 'popcorn-butter', name: 'Butter', price: 30 },
      { id: 'popcorn-cheddar', name: 'Cheesy Cheddar Dust', price: 50 },
      { id: 'popcorn-extra-butter', name: 'Extra Butter Drizzle', price: 30 },
    ],
  },

  // Fries
  { id: 'french-fry', aliases: ['prod-2', 'fries-french', 'french-fries'], name: 'French Fry', category: 'Fries', basePrice: 240, isVeg: true },
  { id: 'cheesy-fries', aliases: ['prod-17', 'fries-cheesy'], name: 'Cheesy Fries', category: 'Fries', basePrice: 260, isVeg: true },
  { id: 'paneer-tikka-fries', aliases: ['fries-paneer-tikka'], name: 'Paneer Tikka Fries', category: 'Fries', basePrice: 280, isVeg: true },
  { id: 'masala-fries', aliases: ['fries-masala'], name: 'Masala Fries', category: 'Fries', basePrice: 250, isVeg: true },
  { id: 'peri-peri-fries', aliases: ['prod-18', 'fries-peri-peri'], name: 'Peri Peri Fries', category: 'Fries', basePrice: 250, isVeg: true },

  // Combos
  { id: 'family-combo', aliases: ['prod-6', 'fc-1'], name: 'Family Combo', category: 'Combos', basePrice: 1899, isVeg: true },
  { id: 'couple-combo', aliases: ['prod-20', 'cc-1'], name: 'Couple Combo', category: 'Combos', basePrice: 950, isVeg: true },

  // Sandwiches
  { id: 'veg-grilled-sandwich', aliases: ['prod-7', 'sandwich-veg-grilled'], name: 'Veg. Grilled Sandwich', category: 'Veg', basePrice: 260, isVeg: true },
  { id: 'paneer-grilled-sandwich', aliases: ['sandwich-paneer-grilled'], name: 'Paneer Grilled Sandwich', category: 'Veg', basePrice: 300, isVeg: true },
  { id: 'cheese-grilled-sandwich', aliases: ['sandwich-cheese-grilled'], name: 'Cheese Grilled Sandwich', category: 'Veg', basePrice: 280, isVeg: true },
  { id: 'corn-grilled-sandwich', aliases: ['sandwich-corn-grilled'], name: 'Corn Grilled Sandwich', category: 'Veg', basePrice: 280, isVeg: true },
  { id: 'chicken-grilled-sandwich', aliases: ['prod-8', 'sandwich-chicken-grilled'], name: 'Chicken Grilled Sandwich', category: 'Non-Veg', basePrice: 340, isVeg: false },

  // Momos
  { id: 'veg-fried-momos', aliases: ['prod-11', 'momos-veg-fried'], name: 'Veg Fried Momos', category: 'Veg', basePrice: 240, isVeg: true },
  { id: 'paneer-fried-momos', aliases: ['momos-paneer-fried'], name: 'Paneer Fried Momos', category: 'Veg', basePrice: 260, isVeg: true },
  { id: 'veg-steam-momo', aliases: ['momos-veg-steam'], name: 'Veg Steam Momo', category: 'Veg', basePrice: 220, isVeg: true },
  { id: 'paneer-steam-momos', aliases: ['momos-paneer-steam'], name: 'Paneer Steam Momos', category: 'Veg', basePrice: 240, isVeg: true },
  { id: 'lemon-corn-momo', aliases: ['momos-lemon-corn'], name: 'Lemon Corn Momo', category: 'Veg', basePrice: 260, isVeg: true },
  { id: 'masala-corn-momo', aliases: ['momos-masala-corn'], name: 'Masala Corn Momo', category: 'Veg', basePrice: 280, isVeg: true },
  { id: 'sweet-corn-momo', aliases: ['momos-sweet-corn'], name: 'Sweet Corn Momo', category: 'Veg', basePrice: 300, isVeg: true },
  { id: 'chicken-fried-momos', aliases: ['prod-12', 'momos-chicken-fried'], name: 'Chicken Fried Momos', category: 'Non-Veg', basePrice: 280, isVeg: false },

  // Burgers
  { id: 'veg-cheese-burger-grilled', aliases: ['prod-13', 'burger-veg-cheese'], name: 'Veg Cheese Burger Grilled', category: 'Veg', basePrice: 260, isVeg: true },
  { id: 'paneer-cheese-burger-grilled', aliases: ['burger-paneer-cheese'], name: 'Paneer Cheese Burger Grilled', category: 'Veg', basePrice: 280, isVeg: true },
  { id: 'aloo-tikka-burger', aliases: ['burger-aloo-tikka'], name: 'Aloo Tikka Burger', category: 'Veg', basePrice: 240, isVeg: true },
  { id: 'chicken-burger-grilled', aliases: ['prod-14', 'burger-chicken-grilled'], name: 'Chicken Burger Grilled', category: 'Non-Veg', basePrice: 260, isVeg: false },

  // Rolls
  { id: 'veg-spring-roll', aliases: ['roll-veg-spring'], name: 'Veg Spring Roll', category: 'Veg', basePrice: 220, isVeg: true },
  { id: 'cheese-corn-roll', aliases: ['roll-cheese-corn'], name: 'Cheese Corn Roll', category: 'Veg', basePrice: 240, isVeg: true },

  // Garlic Bread
  { id: 'garlic-bread', aliases: ['gb-garlic-bread'], name: 'Garlic Bread', category: 'Veg', basePrice: 160, isVeg: true },
  { id: 'cheese-garlic-bread', aliases: ['gb-cheese-garlic-bread'], name: 'Cheese Garlic Bread', category: 'Veg', basePrice: 200, isVeg: true },

  // Nuggets
  { id: 'veg-nuggets', aliases: ['prod-9', 'nuggets-veg'], name: 'Veg Nuggets', category: 'Veg', basePrice: 240, isVeg: true },
  { id: 'cheese-triangle', aliases: ['nuggets-cheese-triangle'], name: 'Cheese Triangle', category: 'Veg', basePrice: 240, isVeg: true },
  { id: 'chicken-nuggets', aliases: ['prod-10', 'nuggets-chicken'], name: 'Chicken Nuggets', category: 'Non-Veg', basePrice: 240, isVeg: false },

  // Samosa
  { id: 'samosa', aliases: ['prod-19', 'samosa-single'], name: 'Samosa', category: 'Fries', basePrice: 120, isVeg: true },

  // Beverages & Coffee
  { id: 'regular-cold-drink', aliases: ['prod-3', 'drink-regular-cold-drink'], name: 'Regular Cold Drink', category: 'Cold Beverages', basePrice: 250, isVeg: true },
  { id: 'water-bottle', aliases: ['prod-4', 'drink-water-bottle'], name: 'Water Bottle', category: 'Cold Beverages', basePrice: 30, isVeg: true },
  { id: 'cafe-latte', aliases: ['prod-5', 'drink-cafe-latte'], name: 'Cafe Latte', category: 'Coffee', basePrice: 280, isVeg: true },
  { id: 'cappuccino-coffee', aliases: ['prod-16', 'drink-cappuccino', 'cappuccino'], name: 'Cappuccino Coffee', category: 'Coffee', basePrice: 300, isVeg: true },
  { id: 'black-coffee', aliases: ['drink-black-coffee'], name: 'Black Coffee', category: 'Coffee', basePrice: 300, isVeg: true },
  { id: 'cafe-mocha', aliases: ['drink-cafe-mocha'], name: 'Cafe Mocha', category: 'Coffee', basePrice: 280, isVeg: true },
  { id: 'hot-chocolate', aliases: ['drink-hot-chocolate'], name: 'Hot Chocolate', category: 'Coffee', basePrice: 250, isVeg: true },
  { id: 'cold-coffee', aliases: ['drink-cold-coffee'], name: 'Cold Coffee', category: 'Cold Beverages', basePrice: 240, isVeg: true },
  { id: 'cold-chocolate', aliases: ['drink-cold-chocolate'], name: 'Cold Chocolate', category: 'Cold Beverages', basePrice: 280, isVeg: true },
  { id: 'cold-tea', aliases: ['drink-cold-tea'], name: 'Cold Tea', category: 'Cold Beverages', basePrice: 170, isVeg: true },
];

/**
 * Find a catalog product by ID, alias, slug, or name.
 */
function findCatalogProduct(itemIdentifier) {
  if (!itemIdentifier) return null;
  const target = String(itemIdentifier).trim().toLowerCase();

  return (
    catalogProducts.find((p) => {
      if (p.id.toLowerCase() === target) return true;
      if (p.name.toLowerCase() === target) return true;
      if (p.aliases && p.aliases.some((a) => a.toLowerCase() === target)) return true;
      return false;
    }) || null
  );
}

/**
 * Validate an order item and calculate authoritative prices on the server.
 */
function validateAndCalculateItem(rawItem, productOverride = null) {
  if (!rawItem || typeof rawItem !== 'object') {
    return { valid: false, error: 'Malformed item entry.' };
  }

  // 1. Quantity validation
  const quantity = Number(rawItem.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return {
      valid: false,
      error: `Invalid quantity '${rawItem.quantity}'. Must be an integer between 1 and 50.`,
    };
  }

  // 2. Identify Product (from override or catalog)
  const searchKey =
    rawItem.productId ||
    rawItem.id ||
    rawItem.slug ||
    rawItem.productName ||
    rawItem.name;

  const product = productOverride || findCatalogProduct(searchKey);
  if (!product) {
    return {
      valid: false,
      error: `Product '${searchKey || 'unknown'}' is not recognized or unavailable in cinema catalog.`,
    };
  }

  // 3. Availability & Stock Check (Enforce unavailable products cannot be ordered)
  if (product.isAvailable === false || product.inStock === false) {
    return {
      valid: false,
      error: `Product '${product.name}' is currently unavailable / sold out.`,
    };
  }

  // 4. Variant validation & base price
  let unitPrice = Number(product.price ?? product.basePrice ?? 0);
  let matchedVariant = null;

  if (rawItem.variant && typeof rawItem.variant === 'object') {
    const rawVar = rawItem.variant;
    const vId = (rawVar.id || rawItem.variantId || '').trim().toLowerCase();
    const vName = (rawVar.name || '').trim().toLowerCase();
    const vSize = (rawVar.size || '').trim().toLowerCase();

    if (product.variants && product.variants.length > 0) {
      matchedVariant = product.variants.find((v) => {
        if (vId && v.id && v.id.toLowerCase() === vId) return true;
        if (vName && v.name && v.name.toLowerCase() === vName) return true;
        if (vName && v.name && vName.includes(v.name.toLowerCase())) return true;
        if (vSize && v.size && v.size.toLowerCase() === vSize) return true;
        return false;
      });

      if (!matchedVariant) {
        return {
          valid: false,
          error: `Invalid variant '${rawVar.name || rawVar.size || rawVar.id}' for product '${product.name}'.`,
        };
      }
      unitPrice = Number(matchedVariant.price);
    }
  } else if (rawItem.variantId && product.variants && product.variants.length > 0) {
    const targetVarId = String(rawItem.variantId).trim().toLowerCase();
    matchedVariant = product.variants.find((v) => v.id && v.id.toLowerCase() === targetVarId);
    if (!matchedVariant) {
      return {
        valid: false,
        error: `Invalid variant ID '${rawItem.variantId}' for product '${product.name}'.`,
      };
    }
    unitPrice = Number(matchedVariant.price);
  } else if (product.variants && product.variants.length > 0) {
    // If client supplied variant in rawItem.size
    const sizeStr = (rawItem.size || '').trim().toLowerCase();
    if (sizeStr) {
      matchedVariant = product.variants.find((v) => v.size && v.size.toLowerCase() === sizeStr);
      if (matchedVariant) unitPrice = Number(matchedVariant.price);
    }
  }

  // 5. Add-on validation & add-on pricing
  const matchedAddOns = [];
  if (Array.isArray(rawItem.addOns) && rawItem.addOns.length > 0) {
    const allowedAddOns = product.addOns || [];
    for (const rawAddOn of rawItem.addOns) {
      const addOnKey = (rawAddOn.id || rawAddOn.name || '').trim().toLowerCase();
      const matched = allowedAddOns.find(
        (a) =>
          (a.id && a.id.toLowerCase() === addOnKey) ||
          (a.name && a.name.toLowerCase() === addOnKey)
      );

      if (!matched) {
        return {
          valid: false,
          error: `Add-on '${rawAddOn.name || rawAddOn.id}' is not allowed for product '${product.name}'.`,
        };
      }

      matchedAddOns.push({
        id: matched.id || addOnKey,
        name: matched.name,
        price: Number(matched.price),
      });
      unitPrice += Number(matched.price);
    }
  }

  // 6. Optional Water Bottle Selection (+₹30 flat per food line item, max 1 bottle per line)
  const hasWaterBottle = Boolean(rawItem.hasWaterBottle);
  const waterBottlePrice = hasWaterBottle ? 30 : 0;

  // 7. Authoritative Calculation
  const itemTotal = (unitPrice * quantity) + waterBottlePrice;

  return {
    valid: true,
    normalizedItem: {
      id: product.id || product.slug || String(product._id || ''),
      productId: product.id || product.slug || String(product._id || ''),
      name: product.name,
      productName: product.name,
      quantity,
      price: unitPrice, // Authoritative unit price
      total: itemTotal, // Authoritative item total
      variant: matchedVariant
        ? { id: matchedVariant.id, name: matchedVariant.name, size: matchedVariant.size, price: matchedVariant.price }
        : null,
      addOns: matchedAddOns,
      hasWaterBottle,
      waterBottlePrice,
      type: product.isVeg || product.type === 'Veg' ? 'Veg' : 'Non-Veg',
    },
  };
}

module.exports = {
  catalogProducts,
  findCatalogProduct,
  validateAndCalculateItem,
};
