import { useMemo, useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import Loader from './components/Loader';
import { useSeat } from './hooks/useSeat';
import { useMenu } from './hooks/useMenu';
import api from './services/api';
import cinemaHeroImg from './assets/cinema-hero.jpg';
import popcornImg from './assets/popcorn.jpg';
import cheesyFriesImg from './assets/cheesy-fries.jpg';
import coldDrinkImg from './assets/cold-drink.jpg';
import deliveryGuaranteeImg from './assets/delivery-guarantee.jpg';
import './App.css';

const categoryIcons = {
  Popcorn: '🍿',
  Fries: '🍟',
  'Cold Beverages': '🥤',
  Coffee: '☕',
  Combos: '🎁',
  Veg: '🥪',
  'Non-Veg': '🍗',
};

const stitchProductData = {
  'Large Popcorn': {
    name: 'Cinepop Butter Popcorn',
    subtitle: 'Customizable • 350g Tub',
    modalSubtitle: 'Fresh cinema tub • Coconut & rich butter',
    image: popcornImg,
    badge: 'Bestseller',
    isVeg: true,
    weight: '350g',
    variantsTitle: 'Choose Tub Size',
    variants: [
      { name: 'Large', size: '350g', price: 600 },
      { name: 'Medium', size: '300g', price: 500 },
      { name: 'Regular', size: '170g', price: 400 },
    ],
    addOnsTitle: 'Cinema Toppings & Drizzles',
    addOns: [
      { id: 'popcorn-cheese', name: 'Cheesy Cheddar Dust', price: 50, defaultSelected: true },
      { id: 'popcorn-butter', name: 'Extra Butter Drizzle', price: 30 },
    ],
  },
  'Cinepop Butter Popcorn': {
    name: 'Cinepop Butter Popcorn',
    subtitle: 'Customizable • 350g Tub',
    modalSubtitle: 'Fresh cinema tub • Coconut & rich butter',
    image: popcornImg,
    badge: 'Bestseller',
    isVeg: true,
    weight: '350g',
    variantsTitle: 'Choose Tub Size',
    variants: [
      { name: 'Large', size: '350g', price: 600 },
      { name: 'Medium', size: '300g', price: 500 },
      { name: 'Regular', size: '170g', price: 400 },
    ],
    addOnsTitle: 'Cinema Toppings & Drizzles',
    addOns: [
      { id: 'popcorn-cheese', name: 'Cheesy Cheddar Dust', price: 50, defaultSelected: true },
      { id: 'popcorn-butter', name: 'Extra Butter Drizzle', price: 30 },
    ],
  },
  'Cheesy Fries': {
    name: 'Cheesy Fries',
    subtitle: 'Warm cheddar drizzle',
    modalSubtitle: 'Crispy golden fries smothered with rich melted cheddar sauce',
    image: cheesyFriesImg,
    isVeg: true,
    weight: '200g',
    variantsTitle: 'Choose Portion Size',
    variants: [
      { name: 'Large Tub', size: '280g', price: 320 },
      { name: 'Regular Box', size: '200g', price: 260 },
    ],
    addOnsTitle: 'Extra Dips & Seasoning',
    addOns: [
      { id: 'fries-cheese', name: 'Extra Cheddar Cheese Dip', price: 40, defaultSelected: true },
      { id: 'fries-peri', name: 'Spicy Peri Peri Sprinkler', price: 25 },
      { id: 'fries-jalapeno', name: 'Jalapeno Poppers Cup', price: 35 },
    ],
  },
  'French Fry': {
    name: 'French Fry Classic',
    subtitle: 'Salted golden crunch',
    modalSubtitle: 'Golden fried imported potatoes tossed with fine sea salt',
    emoji: '🍟',
    bgColor: '#fdf6e7',
    isVeg: true,
    weight: '200g',
    variantsTitle: 'Choose Portion Size',
    variants: [
      { name: 'Large Tub', size: '280g', price: 290 },
      { name: 'Regular Box', size: '200g', price: 240 },
    ],
    addOnsTitle: 'Cinema Dips & Seasonings',
    addOns: [
      { id: 'ff-peri', name: 'Peri Peri Shake Dust', price: 25, defaultSelected: true },
      { id: 'ff-cheddar', name: 'Warm Cheddar Dip', price: 40 },
      { id: 'ff-mayo', name: 'Roasted Garlic Mayo', price: 30 },
    ],
  },
  'Chicken Tikka Fries': {
    name: 'Chicken Tikka Fries',
    subtitle: 'Loaded spiced chicken',
    modalSubtitle: 'Crispy fries topped with smoky chicken tikka chunks and mint mayo',
    emoji: '🍗🍟',
    bgColor: '#fdeeed',
    isVeg: false,
    weight: '200g',
    variantsTitle: 'Choose Portion Size',
    variants: [
      { name: 'Mega Box', size: '300g', price: 380 },
      { name: 'Regular Box', size: '200g', price: 300 },
    ],
    addOnsTitle: 'Tikka Extras & Toppings',
    addOns: [
      { id: 'ctf-cheese', name: 'Melted Mozzarella Cheese', price: 45, defaultSelected: true },
      { id: 'ctf-extra-tikka', name: 'Extra Shredded Tikka', price: 60 },
      { id: 'ctf-mint', name: 'Spicy Mint Chutney Cup', price: 25 },
    ],
  },
  'Couple Combo': {
    name: 'Couple Combo',
    subtitle: '1 Large Popcorn + 2 Cold Drinks',
    modalSubtitle: 'Designed for two • 1 Large tub popcorn with 2 chilled beverages',
    badge: 'Save 20%',
    badgeType: 'amber',
    emoji: '🎁',
    bgColor: '#fbf0e4',
    isVeg: true,
    variantsTitle: 'Choose Combo Size',
    variants: [
      { name: 'Grand Duo', size: '1 Jumbo + 2x 500ml', price: 1120 },
      { name: 'Classic Duo', size: '1 Large + 2x 350ml', price: 950 },
    ],
    addOnsTitle: 'Combo Upgrades',
    addOns: [
      { id: 'cc-cheese', name: 'Warm Cheese Dip Tub', price: 40, defaultSelected: true },
      { id: 'cc-caramel', name: 'Caramel Gourmet Popcorn Upgrade', price: 60 },
    ],
  },
  'Family Combo': {
    name: 'Family Mega Combo',
    subtitle: '2 Med Popcorn + 2 Drinks + 2 Coffees',
    modalSubtitle: 'Family feast • 2 Medium popcorns, 2 cold beverages & 2 barista coffees',
    badge: 'Family 4x',
    emoji: '🍿🥤☕',
    bgColor: '#fbeeed',
    isVeg: true,
    variantsTitle: 'Choose Feast Size',
    variants: [
      { name: 'Mega Feast', size: 'Serves 5-6', price: 2399 },
      { name: 'Family Pack', size: 'Serves 4', price: 1899 },
    ],
    addOnsTitle: 'Snack Additions',
    addOns: [
      { id: 'fmc-cheese', name: 'Double Cheese Dust for Both Tubs', price: 60, defaultSelected: true },
      { id: 'fmc-nachos', name: 'Crispy Cinema Nachos with Salsa', price: 160 },
    ],
  },
  'Regular Cold Drink': {
    name: 'Regular Cold Drink',
    subtitle: 'Fountain soda on ice',
    modalSubtitle: 'Chilled refreshing fountain soda served with ice cubes',
    emoji: '🥤',
    bgColor: '#f1f2f5',
    isVeg: true,
    weight: '350ml',
    variantsTitle: 'Choose Drink Size',
    variants: [
      { name: 'Large Cup', size: '500ml', price: 310 },
      { name: 'Regular Cup', size: '350ml', price: 250 },
    ],
    addOnsTitle: 'Beverage Customization',
    addOns: [
      { id: 'rcd-ice', name: 'Extra Chilled with Ice', price: 0, defaultSelected: true },
      { id: 'rcd-lemon', name: 'Fresh Lemon & Mint Twist', price: 25 },
    ],
  },
  'Water Bottle': {
    name: 'Water Bottle',
    subtitle: 'Chilled natural mineral water',
    modalSubtitle: '100% natural pure mountain mineral water, served chilled',
    emoji: '💧',
    bgColor: '#eef5fb',
    isVeg: true,
    weight: '1L',
    variantsTitle: 'Bottle Size',
    variants: [
      { name: '1 Litre Chilled', size: '1000ml', price: 30 },
    ],
    addOnsTitle: 'Serving Preference',
    addOns: [
      { id: 'wb-cups', name: 'Eco Paper Cup with Ice', price: 0, defaultSelected: true },
    ],
  },
  'Cappuccino Coffee': {
    name: 'Cappuccino Coffee',
    subtitle: 'Artisanal dense foam roast',
    modalSubtitle: 'Freshly brewed espresso topped with thick velvety milk foam',
    emoji: '☕',
    bgColor: '#f3f2ef',
    isVeg: true,
    weight: 'Barista',
    variantsTitle: 'Choose Cup Size',
    variants: [
      { name: 'Grande', size: '350ml', price: 350 },
      { name: 'Regular', size: '250ml', price: 300 },
    ],
    addOnsTitle: 'Barista Extras',
    addOns: [
      { id: 'cap-caramel', name: 'Caramel Flavor Drizzle', price: 40, defaultSelected: true },
      { id: 'cap-shot', name: 'Double Espresso Shot', price: 50 },
      { id: 'cap-whip', name: 'Fresh Whipped Cream Topping', price: 35 },
    ],
  },
  'Cafe Latte': {
    name: 'Cafe Latte',
    subtitle: 'Silky smooth espresso roast',
    modalSubtitle: 'Mild double espresso shot blended with velvety steamed whole milk',
    emoji: '☕',
    bgColor: '#f3f2ef',
    isVeg: true,
    weight: 'Barista',
    variantsTitle: 'Choose Cup Size',
    variants: [
      { name: 'Grande', size: '350ml', price: 330 },
      { name: 'Regular', size: '250ml', price: 280 },
    ],
    addOnsTitle: 'Barista Extras',
    addOns: [
      { id: 'lat-hazel', name: 'Roasted Hazelnut Flavor', price: 40, defaultSelected: true },
      { id: 'lat-vanilla', name: 'Vanilla Syrup Shot', price: 35 },
    ],
  },
  'Veg. Grilled Sandwich': {
    name: 'Veg Grilled Sandwich',
    subtitle: 'Crisp toasted spiced veg',
    modalSubtitle: 'Grilled buttered bread with bell peppers, corn, cucumber & mint sauce',
    emoji: '🥪',
    bgColor: '#ecf8f1',
    isVeg: true,
    weight: '1 pc',
    variantsTitle: 'Choose Portion',
    variants: [
      { name: 'Double Deluxe', size: '2 pcs', price: 340 },
      { name: 'Single Sandwich', size: '1 pc', price: 260 },
    ],
    addOnsTitle: 'Sandwich Extras',
    addOns: [
      { id: 'vgs-cheese', name: 'Melted Cheddar Cheese Slice', price: 35, defaultSelected: true },
      { id: 'vgs-chutney', name: 'Extra Mint Green Chutney Dip', price: 20 },
    ],
  },
  'Chicken Grilled Sandwich': {
    name: 'Chicken Grilled Sandwich',
    subtitle: 'Spiced chicken breast & herbs',
    modalSubtitle: 'Grilled whole wheat sourdough with herb marinated chicken & cheese',
    emoji: '🥪',
    bgColor: '#fdeeed',
    isVeg: false,
    weight: '1 pc',
    variantsTitle: 'Choose Portion',
    variants: [
      { name: 'Double Deluxe', size: '2 pcs', price: 420 },
      { name: 'Single Sandwich', size: '1 pc', price: 340 },
    ],
    addOnsTitle: 'Sandwich Extras',
    addOns: [
      { id: 'cgs-cheese', name: 'Double Cheese Layer', price: 40, defaultSelected: true },
      { id: 'cgs-chipotle', name: 'Smoked Chipotle Dressing', price: 35 },
    ],
  },
  'Veg Fried Momos': {
    name: 'Veg Fried Momos',
    subtitle: 'Crispy exterior & spicy dip',
    modalSubtitle: '7 crispy fried dumplings stuffed with shredded vegetables & herbs',
    emoji: '🥟',
    bgColor: '#ecf8f1',
    isVeg: true,
    weight: '7 pcs',
    variantsTitle: 'Choose Portion',
    variants: [
      { name: 'Party Platter', size: '12 pcs', price: 360 },
      { name: 'Regular Box', size: '7 pcs', price: 240 },
    ],
    addOnsTitle: 'Signature Dips',
    addOns: [
      { id: 'vfm-chilli', name: 'Extra Fiery Red Garlic Dip', price: 30, defaultSelected: true },
      { id: 'vfm-mayo', name: 'Creamy Sesame Mayo Dip', price: 25 },
    ],
  },
  'Chicken Fried Momos': {
    name: 'Chicken Fried Momos',
    subtitle: 'Crispy chicken dumplings',
    modalSubtitle: 'Crispy fried dumplings loaded with juicy spiced minced chicken',
    emoji: '🥟',
    bgColor: '#fdeeed',
    isVeg: false,
    weight: '7 pcs',
    variantsTitle: 'Choose Portion',
    variants: [
      { name: 'Party Platter', size: '12 pcs', price: 420 },
      { name: 'Regular Box', size: '7 pcs', price: 280 },
    ],
    addOnsTitle: 'Signature Dips',
    addOns: [
      { id: 'cfm-chilli', name: 'Hot Schezwan Chilli Dip', price: 30, defaultSelected: true },
      { id: 'cfm-mayo', name: 'Garlic Herb Mayo', price: 25 },
    ],
  },
  'Chicken Popcorn': {
    name: 'Chicken Popcorn',
    subtitle: 'Crunchy bite-sized chicken',
    modalSubtitle: 'Crisp golden bite-sized chicken pops seasoned with house spice mix',
    emoji: '🍗',
    bgColor: '#fdeeed',
    isVeg: false,
    weight: '150g',
    variantsTitle: 'Choose Tub Size',
    variants: [
      { name: 'Mega Tub', size: '250g', price: 360 },
      { name: 'Regular Tub', size: '150g', price: 280 },
    ],
    addOnsTitle: 'Seasoning & Dips',
    addOns: [
      { id: 'cp-peri', name: 'Peri Peri Shake Seasoning', price: 25, defaultSelected: true },
      { id: 'cp-cheese', name: 'Warm Cheesy Jalapeno Sauce', price: 40 },
    ],
  },
  'Chicken Burger Grilled': {
    name: 'Chicken Burger Grilled',
    subtitle: 'Grilled fillet & garlic mayo',
    modalSubtitle: 'Grilled seasoned chicken fillet, crisp lettuce, tomato & garlic mayo',
    emoji: '🍔',
    bgColor: '#fdeeed',
    isVeg: false,
    weight: '1 pc',
    variantsTitle: 'Choose Burger Size',
    variants: [
      { name: 'Double Patty', size: 'Double Fillet', price: 340 },
      { name: 'Single Patty', size: 'Single Fillet', price: 260 },
    ],
    addOnsTitle: 'Burger Extras',
    addOns: [
      { id: 'cbg-cheese', name: 'Imported Melted Cheddar Slice', price: 35, defaultSelected: true },
      { id: 'cbg-onion', name: 'Crispy Fried Egg / Caramelized Onions', price: 30 },
    ],
  },
  'Veg Cheese Burger Grilled': {
    name: 'Veg Cheese Burger Grilled',
    subtitle: 'Crispy spiced vegetable patty',
    modalSubtitle: 'Crispy spiced vegetable patty topped with melted cheddar & tomato',
    emoji: '🍔',
    bgColor: '#ecf8f1',
    isVeg: true,
    weight: '1 pc',
    variantsTitle: 'Choose Burger Size',
    variants: [
      { name: 'Double Cheese', size: 'Double Patty', price: 310 },
      { name: 'Classic Single', size: 'Single Patty', price: 240 },
    ],
    addOnsTitle: 'Burger Extras',
    addOns: [
      { id: 'vcbg-cheese', name: 'Extra Cheddar Cheese Slice', price: 35, defaultSelected: true },
      { id: 'vcbg-jalapeno', name: 'Pickled Jalapenos & Salsa', price: 25 },
    ],
  },
  'Veg Nuggets': {
    name: 'Veg Nuggets',
    subtitle: 'Crunchy golden crumbed veg',
    modalSubtitle: '9 pcs crunchy golden crumbed vegetable nuggets served with dip',
    emoji: '🍘',
    bgColor: '#ecf8f1',
    isVeg: true,
    weight: '9 pcs',
    variantsTitle: 'Choose Portion',
    variants: [
      { name: 'Party Box', size: '14 pcs', price: 320 },
      { name: 'Standard Box', size: '9 pcs', price: 240 },
    ],
    addOnsTitle: 'Cinema Dips',
    addOns: [
      { id: 'vn-mustard', name: 'Honey Mustard Dip', price: 30, defaultSelected: true },
      { id: 'vn-mint', name: 'Spicy Mint Chutney', price: 20 },
    ],
  },
  'Chicken Nuggets': {
    name: 'Chicken Nuggets',
    subtitle: 'Juicy tempura chicken bites',
    modalSubtitle: '9 pcs tender chicken nuggets wrapped in golden crisp tempura batter',
    emoji: '🍗',
    bgColor: '#fdeeed',
    isVeg: false,
    weight: '9 pcs',
    variantsTitle: 'Choose Portion',
    variants: [
      { name: 'Party Box', size: '14 pcs', price: 330 },
      { name: 'Standard Box', size: '9 pcs', price: 240 },
    ],
    addOnsTitle: 'Cinema Dips',
    addOns: [
      { id: 'cn-bbq', name: 'Smoky Sweet BBQ Sauce', price: 30, defaultSelected: true },
      { id: 'cn-cheese', name: 'Warm Cheddar Cheese Dip', price: 40 },
    ],
  },
};

function formatSeatLabel(seat) {
  if (!seat) return 'Seat';
  return `${seat.auditorium} • Seat ${seat.seatNumber}`;
}

const defaultSampleCartItems = [];

function resolveItemImage(item) {
  if (item.image) return item.image;
  const name = (item.productName || '').toLowerCase();
  if (name.includes('fries')) return cheesyFriesImg;
  if (name.includes('drink') || name.includes('cola') || name.includes('coke') || name.includes('beverage')) return coldDrinkImg;
  return popcornImg;
}

function resolveItemSubtitle(item) {
  const addOnText = item.addOns?.length
    ? `${item.addOns.map((a) => a.name).join(', ')} (+₹${item.addOns.reduce((sum, a) => sum + (Number(a.price) || 0), 0)})`
    : null;

  if (item.servingSize) {
    return {
      serving: item.servingSize,
      addOnBadge: addOnText || item.addOnBadge || null,
    };
  }
  const name = (item.productName || '').toLowerCase();
  if (name.includes('popcorn')) {
    return {
      serving: item.variant?.size || '350gm',
      addOnBadge: addOnText || null,
    };
  }
  if (name.includes('fries')) {
    return {
      serving: item.variant?.size || '200gm',
      addOnBadge: addOnText || null,
    };
  }
  if (name.includes('drink') || name.includes('cola') || name.includes('coffee') || name.includes('latte') || name.includes('tea')) {
    return {
      serving: item.variant?.size || 'Chilled beverage',
      addOnBadge: addOnText || null,
    };
  }
  return {
    serving: item.variant ? `${item.variant.name}${item.variant.size ? ` • ${item.variant.size}` : ''}` : 'Standard serving',
    addOnBadge: addOnText || null,
  };
}

function getCartItems() {
  try {
    const raw = localStorage.getItem('asr-cart');
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch {
    return [];
  }
}

function Header({ title, subtitle, badge, compact }) {
  return (
    <header className={`asr-header ${compact ? 'compact' : ''}`}>
      <div className="asr-brand-wrap">
        <div className="asr-brand-mark">ASR</div>
        <div>
          <p className="asr-kicker">ASR CINEMAS</p>
          <h1>{title}</h1>
        </div>
      </div>
      {subtitle && <p className="asr-subtitle">{subtitle}</p>}
      {badge && <span className="asr-badge">{badge}</span>}
    </header>
  );
}

function SearchBar({ value, onChange }) {
  return (
    <div className="asr-search">
      <span className="asr-search-icon">⌕</span>
      <input
        value={value}
        onChange={onChange}
        placeholder="Search snacks, popcorn, beverages..."
      />
    </div>
  );
}

function SeatBadge({ seat }) {
  return (
    <div className="asr-seat-card">
      <div>
        <p className="asr-seat-label">Direct-to-seat delivery</p>
        <strong>{formatSeatLabel(seat)}</strong>
      </div>
      <span className="asr-seat-confirmed">✓ Confirmed</span>
    </div>
  );
}

function CategoryChips({ categories, activeCategory, onSelect }) {
  const chipLabels = { 'Cold Beverages': 'Drinks' };
  const allCategories = ['All', ...categories.map((c) => c.name)];

  return (
    <div className="asr-menu-chips-scroll">
      {allCategories.map((category) => {
        const isActive = activeCategory === category;
        const label = chipLabels[category] || category;
        const icon = category === 'All' ? '' : categoryIcons[category] || '';

        return (
          <button
            key={category}
            type="button"
            className={`asr-menu-filter-chip ${isActive ? 'active' : ''}`}
            onClick={() => onSelect(category)}
          >
            {icon && <span className="asr-chip-emoji">{icon}</span>}
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function FoodCard({ product, quantity, onDecrease, onOpen }) {
  const data = stitchProductData[product.name] || stitchProductData[product.slug] || {};
  const displayName = data.name || product.name;
  const displayDesc = data.subtitle || product.shortDescription;
  const isNonVeg = product.category === 'Non-Veg' || product.name.toLowerCase().includes('chicken');
  const imgSrc = data.image || (data.emoji ? null : product.image);
  const emoji = data.emoji || categoryIcons[product.category] || '🍿';
  const bgColor = data.bgColor || '#f3f4f6';
  const badge = data.badge || (product.name === 'Large Popcorn' ? 'Bestseller' : product.name === 'Family Combo' ? 'Family 4x' : null);
  const weightTag = data.weight || product.shortDescription;

  const startingPrice = product.variants?.length
    ? Math.min(...product.variants.map((v) => Number(v.price)))
    : data.variants?.length
    ? Math.min(...data.variants.map((v) => Number(v.price)))
    : product.basePrice;

  return (
    <article
      className="asr-food-card-modern"
      onClick={() => onOpen(product)}
    >
      <div className="asr-food-img-container" style={{ backgroundColor: bgColor }}>
        {imgSrc ? (
          <img src={imgSrc} alt={displayName} className="asr-food-img" />
        ) : (
          <div className="asr-food-emoji-wrap">
            <span>{emoji}</span>
          </div>
        )}

        {/* Dietary indicator dot in top-left */}
        <div className="asr-dietary-badge">
          <span className={`asr-dietary-dot ${isNonVeg ? 'non-veg' : 'veg'}`} />
        </div>

        {/* Badge in top-right */}
        {badge && (
          <span className={`asr-food-badge ${data.badgeType === 'amber' ? 'amber' : 'red'}`}>
            {badge}
          </span>
        )}

        {/* Weight tag in bottom-right */}
        {weightTag && !badge && (
          <span className="asr-weight-tag">{weightTag}</span>
        )}
      </div>

      <div className="asr-food-info">
        <h3 className="asr-food-name">{displayName}</h3>
        <p className="asr-food-desc">{displayDesc}</p>

        <div className="asr-food-price-row">
          <div className="asr-food-price-col">
            <span className="asr-price-from-label">from</span>
            <span className="asr-food-price-val">₹{startingPrice}</span>
          </div>

          {quantity > 0 ? (
            <div className="asr-stepper-modern" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => onDecrease(product)}
                aria-label={`Decrease ${displayName}`}
              >
                <span className="material-symbols-outlined">remove</span>
              </button>
              <span>{quantity}</span>
              <button
                type="button"
                onClick={() => onOpen(product)}
                aria-label={`Customize ${displayName}`}
              >
                <span className="material-symbols-outlined">add</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="asr-add-custom-btn"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(product);
              }}
            >
              <span>Add</span>
              <span className="material-symbols-outlined">tune</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function CartBar({ count, total, auditorium, seatNumber, onOpen }) {
  return (
    <aside className="asr-sticky-cart-bar-wrap">
      <div className="asr-sticky-cart-pill" onClick={onOpen}>
        <div className="asr-cart-pill-left">
          <div className="asr-cart-pill-icon">
            <span className="material-symbols-outlined">shopping_bag</span>
          </div>
          <div className="asr-cart-pill-text">
            <span className="asr-cart-pill-count">
              {count} {count === 1 ? 'Item' : 'Items'} • {auditorium}, {seatNumber}
            </span>
            <span className="asr-cart-pill-total">₹{total}</span>
          </div>
        </div>
        <button type="button" className="asr-cart-pill-action" onClick={onOpen}>
          <span>View Cart</span>
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>
    </aside>
  );
}

function BottomNav({ activeTab = 'menu', onTabChange, seatToken }) {
  const navigate = useNavigate();

  return (
    <nav className="asr-modern-bottom-nav">
      <button
        type="button"
        className={`asr-nav-tab ${activeTab === 'menu' ? 'active' : ''}`}
        onClick={() => {
          onTabChange?.('menu');
          if (seatToken) navigate(`/order/${seatToken}/menu`);
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontVariationSettings: activeTab === 'menu' ? "'FILL' 1" : "'FILL' 0" }}
        >
          fastfood
        </span>
        <span>Menu</span>
      </button>

      <button
        type="button"
        className={`asr-nav-tab ${activeTab === 'combos' ? 'active' : ''}`}
        onClick={() => {
          onTabChange?.('combos');
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontVariationSettings: activeTab === 'combos' ? "'FILL' 1" : "'FILL' 0" }}
        >
          local_movies
        </span>
        <span>Combos</span>
      </button>

      <button
        type="button"
        className={`asr-nav-tab ${activeTab === 'cart' ? 'active' : ''}`}
        onClick={() => {
          if (seatToken) navigate(`/order/${seatToken}/cart`);
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontVariationSettings: activeTab === 'cart' ? "'FILL' 1" : "'FILL' 0" }}
        >
          shopping_cart
        </span>
        <span>Cart</span>
      </button>

      <button
        type="button"
        className={`asr-nav-tab ${activeTab === 'orders' ? 'active' : ''}`}
        onClick={() => {
          if (seatToken) navigate(`/order/${seatToken}/success`);
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontVariationSettings: activeTab === 'orders' ? "'FILL' 1" : "'FILL' 0" }}
        >
          receipt_long
        </span>
        <span>Orders</span>
      </button>
    </nav>
  );
}

function MenuCustomizationSheet({ product, onClose, onAdded }) {
  const data = stitchProductData[product.name] || stitchProductData[product.slug] || {};
  const displayName = data.name || product.name;
  const displaySubtitle = data.modalSubtitle || data.subtitle || product.shortDescription;
  const isNonVeg = product.category === 'Non-Veg' || product.name.toLowerCase().includes('chicken');
  const imgSrc = data.image || (data.emoji ? null : product.image);

  // Fallback variants if product from DB does not have any
  const variants = useMemo(() => {
    if (product.variants?.length) {
      return [...product.variants].sort((a, b) => b.price - a.price);
    }
    if (data.variants?.length) {
      return [...data.variants];
    }
    return [
      { name: 'Standard', size: data.weight || product.shortDescription || '1 Portion', price: product.basePrice }
    ];
  }, [product.variants, product.basePrice, product.shortDescription, data.variants, data.weight]);

  const addOnsList = useMemo(() => {
    if (product.addOns?.length) {
      return product.addOns;
    }
    if (data.addOns?.length) {
      return data.addOns;
    }
    return [];
  }, [product.addOns, data.addOns]);

  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState(() => variants[0] || null);
  const [selectedAddOns, setSelectedAddOns] = useState(() => {
    return addOnsList.filter((a) => a.defaultSelected);
  });

  useEffect(() => {
    if (variants.length > 0) {
      setSelectedVariant(variants[0]);
    }
    setSelectedAddOns(addOnsList.filter((a) => a.defaultSelected));
    setQuantity(1);
  }, [product, variants, addOnsList]);

  const basePrice = selectedVariant ? Number(selectedVariant.price) : Number(product.basePrice);
  const addOnTotal = selectedAddOns.reduce((sum, addOn) => sum + Number(addOn.price || 0), 0);
  const total = (basePrice + addOnTotal) * quantity;

  const toggleAddOn = (addOn) => {
    setSelectedAddOns((current) => {
      const match = (item) =>
        (item.id && item.id === addOn.id) ||
        (item._id && item._id === addOn._id) ||
        item.name === addOn.name;
      return current.some(match)
        ? current.filter((item) => !match(item))
        : [...current, addOn];
    });
  };

  const isAddOnChecked = (addOn) => {
    return selectedAddOns.some(
      (item) =>
        (item.id && item.id === addOn.id) ||
        (item._id && item._id === addOn._id) ||
        item.name === addOn.name
    );
  };

  const addToCart = () => {
    const parentId = product.id || product.slug || String(product._id || '');
    const variantId = selectedVariant?.id || null;
    const item = {
      id: `${parentId}-${variantId || selectedVariant?.name || 'std'}-${Date.now()}`,
      productId: parentId,
      variantId,
      productName: selectedVariant ? `${selectedVariant.name} ${displayName}` : displayName,
      variant: selectedVariant ? {
        id: selectedVariant.id,
        name: selectedVariant.name,
        size: selectedVariant.size,
        price: selectedVariant.price,
      } : null,
      addOns: selectedAddOns,
      quantity,
      unitPrice: basePrice,
      total,
      image: imgSrc,
    };
    localStorage.setItem('asr-cart', JSON.stringify([...getCartItems(), item]));
    onAdded();
  };

  const variantsTitle =
    data.variantsTitle ||
    (product.category === 'Popcorn'
      ? 'Choose Tub Size'
      : product.category === 'Cold Beverages' || product.category === 'Coffee'
      ? 'Choose Cup Size'
      : product.category === 'Combos'
      ? 'Choose Feast Size'
      : 'Choose Portion Size');

  const addOnsTitle =
    data.addOnsTitle ||
    (product.category === 'Popcorn'
      ? 'Cinema Toppings & Drizzles'
      : product.category === 'Cold Beverages' || product.category === 'Coffee'
      ? 'Beverage Extras'
      : product.category === 'Combos'
      ? 'Combo Upgrades'
      : 'Cinema Toppings & Extras');

  return (
    <div className="asr-customizer-overlay" onClick={onClose} aria-modal="true" role="dialog">
      <div className="asr-customizer-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="asr-sheet-drag-handle" />

        <div className="asr-customizer-head">
          <div className="asr-customizer-head-left">
            <div className="asr-customizer-thumb">
              {imgSrc ? (
                <img src={imgSrc} alt={displayName} />
              ) : (
                <span className="asr-thumb-emoji">{data.emoji || categoryIcons[product.category] || '🍿'}</span>
              )}
            </div>
            <div className="asr-customizer-title-wrap">
              <div className="asr-customizer-title-row">
                <h2>{displayName}</h2>
                <span className={`asr-dietary-dot ${isNonVeg ? 'non-veg' : 'veg'}`} />
              </div>
              <span className="asr-customizer-subtitle">{displaySubtitle}</span>
            </div>
          </div>
          <button type="button" className="asr-customizer-close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {variants.length > 0 && (
          <div className="asr-customizer-section">
            <span className="asr-customizer-section-title">
              {variantsTitle}
            </span>
            <div className="asr-size-grid">
              {variants.map((variant) => {
                const isSelected = selectedVariant?.name === variant.name;
                return (
                  <div
                    key={variant.name}
                    className={`asr-size-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedVariant(variant)}
                  >
                    <div className={`asr-radio-dot ${isSelected ? 'selected' : ''}`}>
                      {isSelected && <span className="asr-radio-inner" />}
                    </div>
                    <strong className="asr-size-name">{variant.name}</strong>
                    <span className="asr-size-weight">{variant.size}</span>
                    <span className={`asr-size-price ${isSelected ? 'selected' : ''}`}>₹{variant.price}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {addOnsList.length > 0 && (
          <div className="asr-customizer-section">
            <span className="asr-customizer-section-title">
              {addOnsTitle}
            </span>
            <div className="asr-addons-list">
              {addOnsList.map((addOn) => {
                const isChecked = isAddOnChecked(addOn);
                const addonLabel = addOn.name;
                return (
                  <div
                    key={addOn.id || addOn._id || addOn.name}
                    className={`asr-addon-row ${isChecked ? 'selected' : ''}`}
                    onClick={() => toggleAddOn(addOn)}
                  >
                    <div className="asr-addon-left">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="asr-addon-checkbox"
                      />
                      <span>{addonLabel}</span>
                    </div>
                    <span className="asr-addon-price">{addOn.price > 0 ? `+₹${addOn.price}` : 'Free'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="asr-customizer-foot">
          <div className="asr-quantity-pill">
            <button
              type="button"
              onClick={() => setQuantity((v) => Math.max(1, v - 1))}
              aria-label="Decrease"
            >
              <span className="material-symbols-outlined">remove</span>
            </button>
            <span className="asr-quantity-num">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((v) => v + 1)}
              aria-label="Increase"
            >
              <span className="material-symbols-outlined">add</span>
            </button>
          </div>

          <button type="button" className="asr-add-cart-cta" onClick={addToCart}>
            <span>Add to Seat Cart</span>
            <strong>₹{total}</strong>
          </button>
        </div>
      </div>
    </div>
  );
}

function SeatConfirmationScreen() {
  const { seatToken } = useParams();
  const { seat, loading, error, isRetrying, errorStatus } = useSeat(seatToken);
  const navigate = useNavigate();

  // Retrieve any existing customer details from sessionStorage
  const [customerName, setCustomerName] = useState(() => {
    try {
      const saved = sessionStorage.getItem('asr-customer');
      return saved ? JSON.parse(saved).name || '' : '';
    } catch {
      return '';
    }
  });

  const [customerPhone, setCustomerPhone] = useState(() => {
    try {
      const saved = sessionStorage.getItem('asr-customer');
      return saved ? JSON.parse(saved).phone || '' : '';
    } catch {
      return '';
    }
  });

  const [touched, setTouched] = useState({ name: false, phone: false });
  const [formErrors, setFormErrors] = useState({ name: '', phone: '' });

  // Clean phone input handler (digits only, max 10 digits, strip leading 91/0 if pasted)
  const handlePhoneChange = (e) => {
    const rawVal = e.target.value;
    const digitsOnly = rawVal.replace(/\D/g, '');
    let cleanVal = digitsOnly;
    if (cleanVal.length > 10 && cleanVal.startsWith('91')) {
      cleanVal = cleanVal.slice(2);
    } else if (cleanVal.length > 10 && cleanVal.startsWith('0')) {
      cleanVal = cleanVal.slice(1);
    }
    cleanVal = cleanVal.slice(0, 10);
    setCustomerPhone(cleanVal);

    if (touched.phone) {
      if (!cleanVal) {
        setFormErrors((prev) => ({ ...prev, phone: 'Mobile number is required.' }));
      } else if (!/^[6-9]\d{9}$/.test(cleanVal)) {
        setFormErrors((prev) => ({
          ...prev,
          phone: 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
        }));
      } else {
        setFormErrors((prev) => ({ ...prev, phone: '' }));
      }
    }
  };

  const handleNameChange = (e) => {
    const val = e.target.value;
    setCustomerName(val);
    if (touched.name) {
      if (!val.trim()) {
        setFormErrors((prev) => ({ ...prev, name: 'Customer name is required.' }));
      } else if (val.trim().length < 2) {
        setFormErrors((prev) => ({ ...prev, name: 'Name must be at least 2 characters.' }));
      } else {
        setFormErrors((prev) => ({ ...prev, name: '' }));
      }
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setTouched({ name: true, phone: true });

    let hasError = false;
    const errors = { name: '', phone: '' };

    const trimmedName = customerName.trim();
    if (!trimmedName) {
      errors.name = 'Customer name is required.';
      hasError = true;
    } else if (trimmedName.length < 2) {
      errors.name = 'Name must be at least 2 characters.';
      hasError = true;
    }

    const cleanPhone = customerPhone.replace(/\D/g, '');
    if (!cleanPhone) {
      errors.phone = 'Mobile number is required.';
      hasError = true;
    } else if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      errors.phone = 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.';
      hasError = true;
    }

    setFormErrors(errors);

    if (hasError) {
      if (errors.name) {
        document.getElementById('customerNameInput')?.focus();
      } else if (errors.phone) {
        document.getElementById('customerPhoneInput')?.focus();
      }
      return;
    }

    // Persist customer details in sessionStorage (clears on session close, survives refresh)
    try {
      sessionStorage.setItem('asr-customer', JSON.stringify({
        name: trimmedName,
        phone: cleanPhone,
      }));
    } catch (storageErr) {
      console.warn('Could not save customer details to sessionStorage:', storageErr);
    }

    navigate(`/order/${seatToken}/menu`);
  };

  if (loading) return <Loader message={isRetrying ? 'Connecting to cinema server...' : 'Verifying your seat...'} />;
  if (error || !seat) {
    const isServiceDown = errorStatus === 503 || errorStatus >= 500;
    return (
      <div className="asr-screen asr-state-screen">
        <div className="asr-panel asr-error-panel">
          <h2>{isServiceDown ? 'Service Temporarily Unavailable' : 'Seat Not Available'}</h2>
          <p>
            {isServiceDown
              ? 'Our ordering service is temporarily connecting. Please tap retry or ask cinema staff for assistance.'
              : "We couldn't verify this seat. Please scan the QR code again or contact cinema staff."}
          </p>
          {isServiceDown && (
            <button
              type="button"
              className="asr-screen-one-rescan"
              style={{ marginTop: '16px', display: 'inline-flex', padding: '10px 16px', cursor: 'pointer' }}
              onClick={() => window.location.reload()}
            >
              <span className="material-symbols-outlined">refresh</span>
              <span>Tap to retry</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const formattedAudi = seat.auditorium
    ? seat.auditorium.replace(/(\d+)/, (m) => m.padStart(2, '0'))
    : 'Audi 02';

  return (
    <div className="asr-screen asr-screen-one">
      <header className="asr-screen-one-header">
        <div className="asr-screen-one-brand">
          <div className="asr-screen-one-logo-icon">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              movie
            </span>
          </div>
          <div className="asr-screen-one-brand-text">
            <strong>ASR CINEMAS</strong>
            <span>IN-SEAT DINING</span>
          </div>
        </div>
        <div className="asr-live-badge">
          <span className="asr-live-dot" />
          <span>LIVE AUDI</span>
        </div>
      </header>

      <main className="asr-screen-one-content">
        <section className="asr-screen-one-hero-container">
          <div className="asr-screen-one-hero-banner">
            <img
              src={cinemaHeroImg}
              alt="Cinema auditorium with recliner seating"
              className="asr-screen-one-hero-img"
            />
            <div className="asr-screen-one-hero-overlay" />
          </div>
          <div className="asr-screen-one-hero-badge">
            <div className="asr-screen-one-hero-badge-inner">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                table_restaurant
              </span>
            </div>
          </div>
        </section>

        <section className="asr-screen-one-welcome">
          <h1>Welcome to ASR Cinemas</h1>
          <p>Confirm your seat &amp; patron details below. We'll deliver your snacks straight to your seat during the show.</p>
        </section>

        {/* 1. SEAT CONFIRMATION CARD */}
        <section className="asr-screen-one-seat-card">
          <div className="asr-card-ambient-glow" />

          <div className="asr-screen-one-seat-topline">
            <span className="asr-your-seat-tag">YOUR SEAT</span>
            <div className="asr-seat-confirmed-pill">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                check_circle
              </span>
              <span>Seat Confirmed</span>
            </div>
          </div>

          <div className="asr-screen-one-seat-main-box">
            <div className="asr-screen-one-seat-copy">
              <div className="asr-screen-one-auditorium">
                <span className="material-symbols-outlined">theaters</span>
                <span>{formattedAudi}</span>
              </div>
              <div className="asr-screen-one-seat-number-row">
                <strong>Seat {seat.seatNumber}</strong>
                <span className="asr-vip-badge">{seat.section ? seat.section.toUpperCase() : 'SEAT'}</span>
              </div>
            </div>
            <div className="asr-screen-one-seat-icon-box">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                airline_seat_recline_extra
              </span>
            </div>
          </div>

          <div className="asr-screen-one-delivery-note">
            <span className="material-symbols-outlined">room_service</span>
            <p>Your entire food &amp; drinks order will be hand-delivered to this seat.</p>
          </div>

          <div className="asr-screen-one-rescan-wrap">
            <button
              type="button"
              className="asr-screen-one-rescan"
              onClick={() => window.location.reload()}
            >
              <span className="material-symbols-outlined">help</span>
              <span>Wrong seat or auditorium? Tap to rescan</span>
            </button>
          </div>
        </section>

        {/* 2. CUSTOMER DETAILS FORM */}
        <form onSubmit={handleSubmit} className="asr-customer-details-card" noValidate>
          <div className="asr-form-header">
            <div className="asr-form-header-left">
              <span className="material-symbols-outlined asr-form-header-icon">badge</span>
              <span className="asr-form-title">Patron Details</span>
            </div>
            <span className="asr-form-subtitle-tag">Required for delivery</span>
          </div>

          <div className="asr-form-group">
            <label htmlFor="customerNameInput" className="asr-form-label">
              Full Name <span className="asr-required-star">*</span>
            </label>
            <div className={`asr-input-container ${formErrors.name ? 'asr-input-error' : ''}`}>
              <span className="material-symbols-outlined asr-field-icon">person</span>
              <input
                id="customerNameInput"
                type="text"
                className="asr-text-input"
                placeholder="e.g. Aryan Sharma"
                value={customerName}
                onChange={handleNameChange}
                onBlur={() => setTouched((p) => ({ ...p, name: true }))}
                autoComplete="name"
                maxLength={60}
              />
            </div>
            {formErrors.name && (
              <p className="asr-field-error" role="alert">
                <span className="material-symbols-outlined">error</span>
                <span>{formErrors.name}</span>
              </p>
            )}
          </div>

          <div className="asr-form-group">
            <label htmlFor="customerPhoneInput" className="asr-form-label">
              Indian Mobile Number <span className="asr-required-star">*</span>
            </label>
            <div className={`asr-input-container asr-phone-container ${formErrors.phone ? 'asr-input-error' : ''}`}>
              <span className="asr-phone-country-code">+91</span>
              <input
                id="customerPhoneInput"
                type="tel"
                inputMode="numeric"
                className="asr-text-input asr-phone-input"
                placeholder="98765 43210"
                value={customerPhone}
                onChange={handlePhoneChange}
                onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
                autoComplete="tel-national"
                maxLength={10}
              />
            </div>
            {formErrors.phone && (
              <p className="asr-field-error" role="alert">
                <span className="material-symbols-outlined">error</span>
                <span>{formErrors.phone}</span>
              </p>
            )}
            <span className="asr-field-hint">
              Used strictly for in-hall seat delivery notification. Never shared.
            </span>
          </div>

          <div className="asr-screen-one-action-group">
            <button
              type="submit"
              id="viewMenuBtn"
              className="asr-screen-one-cta"
            >
              <span>Confirm Seat &amp; View Menu</span>
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
            <p className="asr-screen-one-supporting">
              Order snacks, meals &amp; artisanal beverages without leaving your seat
            </p>
          </div>
        </form>

        <section className="asr-screen-one-service-strip">
          <div className="asr-screen-one-service-pill">
            <div className="asr-service-item">
              <span className="material-symbols-outlined">schedule</span>
              <span>Fast in-hall delivery</span>
            </div>
            <span className="asr-service-dot" />
            <div className="asr-service-item">
              <span className="material-symbols-outlined">volume_off</span>
              <span>Silent tray service</span>
            </div>
          </div>
          <p className="asr-screen-one-footer-note">
            Service available throughout the screening duration.
          </p>
        </section>
      </main>
    </div>
  );
}

const MENU_CATEGORIES = [
  {
    id: 'cat-family-combo',
    name: 'Family Combo',
    subtitle: '2 Med Popcorn + 2 Drinks + 2 Coffees',
    emoji: '🍿🥤☕',
    bgColor: '#fbeeed',
    badge: 'Family 4x',
    badgeType: 'red',
    startingPrice: 1899,
    isVeg: true,
    productSlug: 'family-combo',
  },
  {
    id: 'cat-couple-combo',
    name: 'Couple Combo',
    subtitle: '1 Large Popcorn + 2 Cold Drinks',
    emoji: '🎁',
    bgColor: '#fbf0e4',
    badge: 'Save 20%',
    badgeType: 'amber',
    startingPrice: 950,
    isVeg: true,
    productSlug: 'couple-combo',
  },
  {
    id: 'cat-popcorn',
    name: 'Popcorn',
    subtitle: 'Butter, cheese & gourmet tubs',
    image: popcornImg,
    emoji: '🍿',
    bgColor: '#fdf6e7',
    badge: 'Bestseller',
    badgeType: 'red',
    startingPrice: 400,
    isVeg: true,
    productSlug: 'large-popcorn',
  },
  {
    id: 'cat-fries',
    name: 'Fries',
    subtitle: 'French fry, cheesy & peri peri',
    image: cheesyFriesImg,
    emoji: '🍟',
    bgColor: '#fdf6e7',
    startingPrice: 240,
    isVeg: true,
    productSlug: 'french-fry',
  },
  {
    id: 'cat-sandwiches',
    name: 'Sandwiches',
    subtitle: 'Veg & grilled chicken toasties',
    emoji: '🥪',
    bgColor: '#ecf8f1',
    startingPrice: 260,
    isVeg: true,
    productSlug: 'veg-grilled-sandwich',
  },
  {
    id: 'cat-momos',
    name: 'Momos',
    subtitle: 'Crispy veg & chicken dumplings',
    emoji: '🥟',
    bgColor: '#ecf8f1',
    startingPrice: 240,
    isVeg: true,
    productSlug: 'veg-fried-momos',
  },
  {
    id: 'cat-burger',
    name: 'Burger',
    subtitle: 'Grilled veg cheese & chicken',
    emoji: '🍔',
    bgColor: '#ecf8f1',
    startingPrice: 240,
    isVeg: true,
    productSlug: 'veg-cheese-burger-grilled',
  },
  {
    id: 'cat-roll',
    name: 'Roll',
    subtitle: 'Fresh wraps & kathi rolls',
    emoji: '🌯',
    bgColor: '#fff4eb',
    startingPrice: 220,
    isVeg: true,
    productSlug: null,
  },
  {
    id: 'cat-garlic-bread',
    name: 'Garlic Bread',
    subtitle: 'Herb butter toasted slices',
    emoji: '🥖',
    bgColor: '#fef7e6',
    startingPrice: 180,
    isVeg: true,
    productSlug: null,
  },
  {
    id: 'cat-nuggets',
    name: 'Nuggets',
    subtitle: 'Crispy veg & tempura chicken',
    emoji: '🍘',
    bgColor: '#ecf8f1',
    startingPrice: 240,
    isVeg: true,
    productSlug: 'veg-nuggets',
  },
  {
    id: 'cat-samosa',
    name: 'Samosa',
    subtitle: 'Crispy cinema samosa 2 pcs',
    emoji: '🥟',
    bgColor: '#fdf6e7',
    startingPrice: 120,
    isVeg: true,
    productSlug: 'samosa',
  },
  {
    id: 'cat-drinks',
    name: 'Drinks',
    subtitle: 'Chilled sodas, water & coffee',
    image: coldDrinkImg,
    emoji: '🥤',
    bgColor: '#f1f2f5',
    startingPrice: 30,
    isVeg: true,
    productSlug: 'regular-cold-drink',
  },
];

function CategoryCard({ category, onOpen }) {
  return (
    <article
      className="asr-food-card-modern asr-category-card"
      onClick={() => onOpen(category)}
    >
      <div className="asr-food-img-container" style={{ backgroundColor: category.bgColor || '#f3f4f6' }}>
        {category.image ? (
          <img
            src={category.image}
            alt={category.name}
            className="asr-food-img"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="asr-food-emoji-wrap">
            <span>{category.emoji || '🍿'}</span>
          </div>
        )}

        {/* Dietary indicator dot in top-left */}
        <div className="asr-dietary-badge">
          <span className={`asr-dietary-dot ${category.isVeg ? 'veg' : 'non-veg'}`} />
        </div>

        {/* Badge in top-right */}
        {category.badge && (
          <span className={`asr-food-badge ${category.badgeType === 'amber' ? 'amber' : 'red'}`}>
            {category.badge}
          </span>
        )}
      </div>

      <div className="asr-food-info">
        <h3 className="asr-food-name">{category.name}</h3>
        <p className="asr-food-desc">{category.subtitle}</p>

        <div className="asr-food-price-row">
          <div className="asr-food-price-col">
            {category.startingPrice ? (
              <>
                <span className="asr-price-from-label">from</span>
                <span className="asr-food-price-val">₹{category.startingPrice}</span>
              </>
            ) : (
              <span className="asr-price-from-label">Explore</span>
            )}
          </div>

          <button
            type="button"
            className="asr-add-custom-btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(category);
            }}
          >
            <span>Add</span>
            <span className="material-symbols-outlined">tune</span>
          </button>
        </div>
      </div>
    </article>
  );
}

const CATEGORY_PRODUCTS = {
  'Family Combo': {
    subtitle: '2 Med Popcorn + 2 Drinks + 2 Coffees',
    sectionTitle: 'Combo Selection',
    products: [
      {
        id: 'fc-1',
        name: '2 Medium Popcorn (300gm) + 2 Cold Drink 350ml + 2 Cappuccino Coffee',
        price: 1899,
        isVeg: true,
      },
    ],
  },
  'Couple Combo': {
    subtitle: '1 Large Popcorn + 2 Cold Drinks',
    sectionTitle: 'Combo Selection',
    products: [
      {
        id: 'cc-1',
        name: '1 Large Popcorn (350gm) + 2 Cold Drink 350ml',
        price: 950,
        isVeg: true,
      },
    ],
  },
  'Popcorn': {
    subtitle: 'Butter, cheese & gourmet tubs',
    sectionTitle: 'Choose Tub Size',
    isPopcorn: true,
    products: [
      {
        id: 'popcorn-large',
        name: 'Large Popcorn',
        variantName: 'Large',
        variantId: 'var-pop-lrg',
        parentProductId: 'large-popcorn',
        size: '350gm',
        price: 600,
        isVeg: true,
      },
      {
        id: 'popcorn-medium',
        name: 'Medium Popcorn',
        variantName: 'Medium',
        variantId: 'var-pop-med',
        parentProductId: 'large-popcorn',
        size: '300gm',
        price: 500,
        isVeg: true,
      },
      {
        id: 'popcorn-regular',
        name: 'Regular Popcorn',
        variantName: 'Regular',
        variantId: 'var-pop-reg',
        parentProductId: 'large-popcorn',
        size: '170gm',
        price: 400,
        isVeg: true,
      },
    ],
    addOns: [
      { id: 'popcorn-cheese', name: 'Add-on Cheese', price: 50 },
      { id: 'popcorn-butter', name: 'Add-on Butter', price: 30 },
    ],
  },
  'Fries': {
    subtitle: 'French fry, cheesy & peri peri',
    sectionTitle: 'Choose Fries',
    products: [
      { id: 'fries-french', name: 'French Fries', size: '200gm', price: 240, isVeg: true },
      { id: 'fries-cheesy', name: 'Cheesy Fries', size: '200gm', price: 260, isVeg: true },
      { id: 'fries-paneer-tikka', name: 'Paneer Tikka Fries', size: '200gm', price: 280, isVeg: true },
      { id: 'fries-masala', name: 'Masala Fries', size: '200gm', price: 250, isVeg: true },
      { id: 'fries-peri-peri', name: 'Peri Peri Fries', size: '200gm', price: 250, isVeg: true },
    ],
  },
  'Sandwiches': {
    subtitle: 'Veg & grilled chicken toasties',
    sectionTitle: 'Choose Sandwich',
    products: [
      { id: 'sandwich-veg-grilled', name: 'Veg Grilled Sandwich', price: 260, isVeg: true },
      { id: 'sandwich-paneer-grilled', name: 'Paneer Grilled Sandwich', price: 300, isVeg: true },
      { id: 'sandwich-cheese-grilled', name: 'Cheese Grilled Sandwich', price: 280, isVeg: true },
      { id: 'sandwich-corn-grilled', name: 'Corn Grilled Sandwich', price: 280, isVeg: true },
    ],
  },
  'Momos': {
    subtitle: 'Crispy veg & chicken dumplings',
    sectionTitle: 'Choose Momos',
    products: [
      { id: 'momos-veg-fried', name: 'Veg Fried Momos', price: 240, isVeg: true },
      { id: 'momos-paneer-fried', name: 'Paneer Fried Momos', price: 260, isVeg: true },
      { id: 'momos-veg-steam', name: 'Veg Steam Momo', price: 220, isVeg: true },
      { id: 'momos-paneer-steam', name: 'Paneer Steam Momos', price: 240, isVeg: true },
      { id: 'momos-lemon-corn', name: 'Lemon Corn Momo', price: 260, isVeg: true },
      { id: 'momos-masala-corn', name: 'Masala Corn Momo', price: 280, isVeg: true },
      { id: 'momos-sweet-corn', name: 'Sweet Corn Momo', price: 300, isVeg: true },
    ],
  },
  'Burger': {
    subtitle: 'Grilled veg cheese & chicken',
    sectionTitle: 'Choose Burger',
    products: [
      { id: 'burger-veg-cheese', name: 'Veg Cheese Burger Grilled', price: 260, isVeg: true },
      { id: 'burger-paneer-cheese', name: 'Paneer Cheese Burger Grilled', price: 280, isVeg: true },
      { id: 'burger-aloo-tikka', name: 'Aloo Tikka Burger', price: 240, isVeg: true },
    ],
  },
  'Roll': {
    subtitle: 'Fresh wraps & kathi rolls',
    sectionTitle: 'Choose Roll',
    products: [
      { id: 'roll-veg-spring', name: 'Veg Spring Roll', price: 220, isVeg: true },
      { id: 'roll-cheese-corn', name: 'Cheese Corn Roll', price: 240, isVeg: true },
    ],
  },
  'Garlic Bread': {
    subtitle: 'Herb butter toasted slices',
    sectionTitle: 'Choose Garlic Bread',
    products: [
      { id: 'gb-garlic-bread', name: 'Garlic Bread', price: 160, isVeg: true },
      { id: 'gb-cheese-garlic-bread', name: 'Cheese Garlic Bread', price: 200, isVeg: true },
    ],
  },
  'Nuggets': {
    subtitle: 'Crispy veg & tempura chicken',
    sectionTitle: 'Choose Nuggets',
    products: [
      { id: 'nuggets-veg', name: 'Veg Nuggets', price: 240, isVeg: true },
      { id: 'nuggets-cheese-triangle', name: 'Cheese Triangle', price: 240, isVeg: true },
    ],
  },
  'Samosa': {
    subtitle: 'Crispy cinema samosa 2 pcs',
    sectionTitle: 'Product',
    products: [
      { id: 'samosa-single', name: 'Samosa', price: 120, isVeg: true },
    ],
  },
  'Drinks': {
    subtitle: 'Chilled sodas, water & coffee',
    sectionTitle: 'Choose Drink',
    products: [
      { id: 'drink-cafe-latte', name: 'Cafe Latte', price: 280, isVeg: true },
      { id: 'drink-cappuccino', name: 'Cappuccino Coffee', price: 300, isVeg: true },
      { id: 'drink-black-coffee', name: 'Black Coffee', price: 300, isVeg: true },
      { id: 'drink-cafe-mocha', name: 'Cafe Mocha', price: 280, isVeg: true },
      { id: 'drink-hot-chocolate', name: 'Hot Chocolate', price: 250, isVeg: true },
      { id: 'drink-cold-coffee', name: 'Cold Coffee', price: 240, isVeg: true },
      { id: 'drink-cold-chocolate', name: 'Cold Chocolate', price: 280, isVeg: true },
      { id: 'drink-cold-tea', name: 'Cold Tea', price: 170, isVeg: true },
      { id: 'drink-regular-cold-drink', name: 'Regular Cold Drink', price: 250, isVeg: true },
    ],
  },
};

function CategoryBottomSheet({ category, onClose, onAdded, menuProducts = [] }) {
  if (!category) return null;

  const categoryInfo = useMemo(() => {
    const catName = (category.name || '').trim().toLowerCase();
    const dbProds = (menuProducts || []).filter(
      (p) => (p.category || '').trim().toLowerCase() === catName
    );

    const staticInfo = CATEGORY_PRODUCTS[category.name] || CATEGORY_PRODUCTS[category.id] || {
      products: [],
    };

    if (category.name === 'Popcorn') {
      const popcornDoc = dbProds.find((p) => p.variants && p.variants.length > 0) || dbProds[0];
      if (popcornDoc && popcornDoc.variants && popcornDoc.variants.length > 0) {
        return {
          subtitle: staticInfo.subtitle || 'Butter, cheese & gourmet tubs',
          sectionTitle: 'Choose Tub Size',
          isPopcorn: true,
          products: popcornDoc.variants.map((v) => ({
            id: v.id || `popcorn-${v.name.toLowerCase()}`,
            name: `${v.name} Popcorn`,
            variantName: v.name,
            variantId: v.id,
            parentProductId: popcornDoc.id || 'large-popcorn',
            parentProductName: popcornDoc.name,
            size: v.size || '',
            price: v.price,
            isVeg: true,
            isAvailable: popcornDoc.isAvailable !== false && popcornDoc.inStock !== false,
          })),
          addOns: popcornDoc.addOns?.length ? popcornDoc.addOns : (staticInfo.addOns || []),
        };
      }
    } else if (dbProds.length > 0) {
      return {
        subtitle: staticInfo.subtitle || `${category.name} selection`,
        sectionTitle: staticInfo.sectionTitle || `Choose ${category.name}`,
        products: dbProds.map((p) => ({
          id: p.id || p.slug,
          name: p.name,
          size: p.shortDescription || p.size || '',
          price: p.price ?? p.basePrice,
          isVeg: p.isVeg || p.type === 'Veg',
          isAvailable: p.isAvailable !== false && p.inStock !== false,
        })),
        addOns: staticInfo.addOns || [],
      };
    }

    return staticInfo;
  }, [category, menuProducts]);

  const products = categoryInfo.products || [];
  const addOnsList = categoryInfo.addOns || [];
  const isPopcorn = category.name === 'Popcorn';

  const [selectedProduct, setSelectedProduct] = useState(() => {
    return products.find((p) => p.isAvailable !== false && p.inStock !== false) || products[0] || null;
  });
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (products.length > 0) {
      setSelectedProduct(products.find((p) => p.isAvailable !== false && p.inStock !== false) || products[0]);
    } else {
      setSelectedProduct(null);
    }
    setSelectedAddOns([]);
    setQuantity(1);
  }, [category.name, categoryInfo]);

  const basePrice = selectedProduct ? Number(selectedProduct.price || 0) : 0;
  const addOnsTotal = selectedAddOns.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const total = (basePrice + addOnsTotal) * quantity;

  const toggleAddOn = (addOn) => {
    setSelectedAddOns((current) => {
      const exists = current.some((a) => a.id === addOn.id || a.name === addOn.name);
      return exists
        ? current.filter((a) => a.id !== addOn.id && a.name !== addOn.name)
        : [...current, addOn];
    });
  };

  const isAddOnChecked = (addOn) => {
    return selectedAddOns.some((a) => a.id === addOn.id || a.name === addOn.name);
  };

  const addToCart = () => {
    if (!selectedProduct || selectedProduct.isAvailable === false || selectedProduct.inStock === false) return;

    const isVariantProduct = Boolean(selectedProduct.parentProductId);
    const resolvedProductId = selectedProduct.parentProductId || selectedProduct.id || category.id;
    const resolvedVariant = isVariantProduct
      ? {
          id: selectedProduct.variantId || selectedProduct.id,
          name: selectedProduct.variantName || selectedProduct.name,
          size: selectedProduct.size,
          price: selectedProduct.price,
        }
      : (selectedProduct.size
          ? { name: selectedProduct.name, size: selectedProduct.size, price: selectedProduct.price }
          : { name: selectedProduct.name, price: selectedProduct.price });

    const item = {
      id: `${category.id || 'cat'}-${selectedProduct.id || 'prod'}-${Date.now()}`,
      productId: resolvedProductId,
      variantId: selectedProduct.variantId || null,
      productName: selectedProduct.name,
      variant: resolvedVariant,
      servingSize: selectedProduct.size || (isPopcorn ? 'Cinema Tub' : 'Standard Serving'),
      addOns: selectedAddOns,
      quantity,
      unitPrice: selectedProduct.price,
      total,
      image: category.image || resolveItemImage({ productName: selectedProduct.name }),
    };

    localStorage.setItem('asr-cart', JSON.stringify([...getCartItems(), item]));
    if (onAdded) {
      onAdded();
    } else if (onClose) {
      onClose();
    }
  };

  const displaySubtitle = categoryInfo.subtitle || category.subtitle;

  return (
    <div className="asr-customizer-overlay" onClick={onClose} aria-modal="true" role="dialog">
      <div className="asr-customizer-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="asr-sheet-drag-handle" />

        <div className="asr-customizer-head">
          <div className="asr-customizer-head-left">
            <div className="asr-customizer-thumb" style={{ backgroundColor: category.bgColor || '#f3f4f6' }}>
              {category.image ? (
                <img src={category.image} alt={category.name} />
              ) : (
                <span className="asr-thumb-emoji">{category.emoji || '🍿'}</span>
              )}
            </div>
            <div className="asr-customizer-title-wrap">
              <div className="asr-customizer-title-row">
                <h2>{category.name}</h2>
                <span className={`asr-dietary-dot ${category.isVeg !== false ? 'veg' : 'non-veg'}`} />
              </div>
              <span className="asr-customizer-subtitle">{displaySubtitle}</span>
            </div>
          </div>
          <button type="button" className="asr-customizer-close-btn" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Popcorn Tub Sizes (3 Cards) */}
        {isPopcorn && products.length > 0 && (
          <div className="asr-customizer-section">
            <span className="asr-customizer-section-title">
              {categoryInfo.sectionTitle || 'Choose Tub Size'}
            </span>
            <div className="asr-size-grid">
              {products.map((item) => {
                const isSelected = selectedProduct?.name === item.name;
                const isUnavailable = item.isAvailable === false || item.inStock === false;
                return (
                  <div
                    key={item.name}
                    className={`asr-size-card ${isSelected ? 'selected' : ''} ${isUnavailable ? 'unavailable' : ''}`}
                    onClick={() => {
                      if (!isUnavailable) setSelectedProduct(item);
                    }}
                    style={isUnavailable ? { opacity: 0.55, cursor: 'not-allowed' } : {}}
                  >
                    <div className={`asr-radio-dot ${isSelected ? 'selected' : ''}`}>
                      {isSelected && <span className="asr-radio-inner" />}
                    </div>
                    <strong className="asr-size-name">{item.name}</strong>
                    <span className="asr-size-weight">{item.size}</span>
                    <span className={`asr-size-price ${isSelected ? 'selected' : ''}`}>
                      {isUnavailable ? 'Sold Out' : `₹${item.price}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Other Categories: Product Selection List */}
        {!isPopcorn && products.length > 0 && (
          <div className="asr-customizer-section">
            <span className="asr-customizer-section-title">
              {categoryInfo.sectionTitle || 'Select Product'}
            </span>
            <div className="asr-product-select-list">
              {products.map((item) => {
                const isSelected = selectedProduct?.name === item.name;
                const isUnavailable = item.isAvailable === false || item.inStock === false;
                return (
                  <div
                    key={item.name}
                    className={`asr-product-select-row ${isSelected ? 'selected' : ''} ${isUnavailable ? 'unavailable' : ''}`}
                    onClick={() => {
                      if (!isUnavailable) setSelectedProduct(item);
                    }}
                    style={isUnavailable ? { opacity: 0.55, cursor: 'not-allowed' } : {}}
                  >
                    <div className="asr-product-select-left">
                      <div className={`asr-radio-dot ${isSelected ? 'selected' : ''}`}>
                        {isSelected && <span className="asr-radio-inner" />}
                      </div>
                      <div className="asr-product-select-text">
                        <span className="asr-product-select-name">{item.name}</span>
                        {item.size && <span className="asr-product-select-size">{item.size}</span>}
                        {isUnavailable && (
                          <span style={{ fontSize: '11px', color: '#dc2626', fontWeight: 600, marginLeft: '6px' }}>
                            (Sold Out)
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`asr-product-select-price ${isSelected ? 'selected' : ''}`}>
                      {isUnavailable ? 'Unavailable' : `₹${item.price}`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Popcorn Optional Add-ons */}
        {isPopcorn && addOnsList.length > 0 && (
          <div className="asr-customizer-section">
            <span className="asr-customizer-section-title">
              Cinema Toppings &amp; Drizzles
            </span>
            <div className="asr-addons-list">
              {addOnsList.map((addOn) => {
                const isChecked = isAddOnChecked(addOn);
                return (
                  <div
                    key={addOn.id || addOn.name}
                    className={`asr-addon-row ${isChecked ? 'selected' : ''}`}
                    onClick={() => toggleAddOn(addOn)}
                  >
                    <div className="asr-addon-left">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="asr-addon-checkbox"
                      />
                      <span>{addOn.name}</span>
                    </div>
                    <span className="asr-addon-price">+₹{addOn.price}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer: Quantity Stepper & Add to Cart CTA */}
        <div className="asr-customizer-foot">
          <div className="asr-quantity-pill">
            <button
              type="button"
              onClick={() => setQuantity((v) => Math.max(1, v - 1))}
              aria-label="Decrease"
            >
              <span className="material-symbols-outlined">remove</span>
            </button>
            <span className="asr-quantity-num">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((v) => v + 1)}
              aria-label="Increase"
            >
              <span className="material-symbols-outlined">add</span>
            </button>
          </div>

          <button
            type="button"
            className="asr-add-cart-cta"
            onClick={addToCart}
            disabled={!selectedProduct}
          >
            <span>Add to Seat Cart</span>
            <strong>₹{total}</strong>
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuScreen() {
  const { seatToken } = useParams();
  const { seat, loading: seatLoading, error: seatError } = useSeat(seatToken);
  const { menu, loading, error } = useMenu();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [cartItems, setCartItems] = useState(() => getCartItems());
  const [activeCategorySheet, setActiveCategorySheet] = useState(null);

  useEffect(() => {
    setCartItems(getCartItems());
  }, []);

  const categoriesWithImages = useMemo(() => {
    const products = menu.products || [];
    return MENU_CATEGORIES.map((cat) => {
      if (cat.image) return cat;
      const prod = products.find(
        (p) =>
          (cat.productSlug && p.slug === cat.productSlug) ||
          p.name.toLowerCase().includes(cat.name.toLowerCase())
      );
      return {
        ...cat,
        image: prod?.image || null,
      };
    });
  }, [menu.products]);

  const filteredCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return categoriesWithImages;
    return categoriesWithImages.filter(
      (cat) =>
        cat.name.toLowerCase().includes(query) ||
        cat.subtitle.toLowerCase().includes(query)
    );
  }, [search, categoriesWithImages]);

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cartItems.reduce((sum, item) => sum + item.total, 0);

  const handleCategoryClick = (category) => {
    setActiveCategorySheet(category);
  };

  if (seatLoading || loading) return <Loader message="Loading menu..." />;
  if (seatError || error || !seat) {
    return (
      <div className="asr-screen asr-state-screen">
        <div className="asr-panel asr-error-panel">
          <h2>Food menu is temporarily unavailable.</h2>
        </div>
      </div>
    );
  }

  const audiLabel = seat.auditorium || 'Audi 2';
  const seatLabel = seat.seatNumber ? `Seat ${seat.seatNumber}` : 'Seat B16';

  return (
    <div className="asr-menu-screen-modern">
      {/* Fixed Glassmorphic Top Header */}
      <header className="asr-menu-top-header">
        <div className="asr-menu-brand-wrap">
          <div className="asr-menu-logo-box">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              movie
            </span>
          </div>
          <div className="asr-menu-brand-text">
            <span className="asr-brand-title">ASR CINEMAS</span>
            <span className="asr-brand-subtitle">Menu Catalog</span>
          </div>
        </div>

        <div className="asr-header-seat-pill">
          <span className="asr-seat-audi">{audiLabel}</span>
          <span className="asr-seat-sep">•</span>
          <span className="asr-seat-num">{seatLabel}</span>
          <span className="material-symbols-outlined asr-seat-check" style={{ fontVariationSettings: "'FILL' 1" }}>
            check_circle
          </span>
        </div>

        <div className="asr-header-actions">
          <button
            type="button"
            className="asr-header-cart-btn"
            onClick={() => navigate(`/order/${seatToken}/cart`)}
            aria-label="Cart"
          >
            <span className="material-symbols-outlined">shopping_bag</span>
            {totalItems > 0 && <span className="asr-cart-badge">{totalItems}</span>}
          </button>
          <div className="asr-header-profile-btn" aria-label="Profile">
            <span className="material-symbols-outlined">person</span>
          </div>
        </div>
      </header>

      {/* Sub-header Delivery Banner */}
      <div className="asr-delivery-banner-wrap">
        <div className="asr-delivery-banner-card">
          <div className="asr-delivery-banner-left">
            <div className="asr-delivery-seat-icon">
              <span className="material-symbols-outlined">event_seat</span>
            </div>
            <div className="asr-delivery-info">
              <div className="asr-delivery-seat-line">
                <span className="asr-delivery-seat-name">{audiLabel} • {seatLabel}</span>
                <span className="asr-delivery-confirmed-tag">✓ Confirmed</span>
              </div>
              <span className="asr-delivery-sub-line">
                <span className="asr-delivery-pulse-dot" />
                Direct in-seat delivery
              </span>
            </div>
          </div>
          <div className="asr-delivery-banner-right">
            <span className="asr-delivery-interval-pill">Interval in 18m</span>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="asr-menu-search-wrap">
        <div className="asr-menu-search-box">
          <span className="material-symbols-outlined asr-search-icon">search</span>
          <input
            id="menu-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search categories..."
            type="text"
          />
          {search && (
            <button
              type="button"
              className="asr-search-clear-btn"
              onClick={() => setSearch('')}
              aria-label="Clear search"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          )}
        </div>
      </div>

      {/* 2-Column Category Grid */}
      <main className="asr-food-grid-container">
        {filteredCategories.length ? (
          filteredCategories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onOpen={handleCategoryClick}
            />
          ))
        ) : (
          <div className="asr-empty-search-state">
            <div className="asr-empty-icon-wrap">
              <span className="material-symbols-outlined">search_off</span>
            </div>
            <h3>No categories found</h3>
            <p>Try searching for popcorn, fries, combos or drinks</p>
          </div>
        )}
      </main>

      {/* Floating Sticky Cart Bar */}
      {cartItems.length > 0 && (
        <CartBar
          count={totalItems}
          total={totalPrice}
          auditorium={audiLabel}
          seatNumber={seatLabel}
          onOpen={() => navigate(`/order/${seatToken}/cart`)}
        />
      )}

      {/* Modern 4-Tab Bottom Navigation */}
      <BottomNav activeTab="menu" seatToken={seatToken} />

      {/* Category Bottom Sheet (reusable for all 12 categories) */}
      {activeCategorySheet && (
        <CategoryBottomSheet
          category={activeCategorySheet}
          menuProducts={menu.products || []}
          onClose={() => setActiveCategorySheet(null)}
          onAdded={() => {
            setCartItems(getCartItems());
            setActiveCategorySheet(null);
          }}
        />
      )}
    </div>
  );
}

function ProductScreen() {
  const { seatToken, productId } = useParams();
  const { seat, loading } = useSeat(seatToken);
  const { menu } = useMenu();
  const navigate = useNavigate();
  const product = (menu.products || []).find(
    (item) => item._id === productId || item.id === productId || item.slug === productId
  );
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState(product?.variants?.[0] || null);
  const [selectedAddOns, setSelectedAddOns] = useState([]);

  useEffect(() => {
    setSelectedVariant(product?.variants?.[0] || null);
    setSelectedAddOns([]);
    setQuantity(1);
  }, [productId, product]);

  if (loading) return <Loader message="Preparing your order..." />;
  if (!seat || !product || product.isAvailable === false || product.inStock === false) {
    return (
      <div className="asr-screen asr-state-screen">
        <div className="asr-panel asr-error-panel">
          <h2>Product unavailable.</h2>
        </div>
      </div>
    );
  }

  const basePrice = selectedVariant ? selectedVariant.price : product.basePrice;
  const addOnTotal = selectedAddOns.reduce((sum, addOn) => sum + Number(addOn.price), 0);
  const total = (basePrice + addOnTotal) * quantity;

  const toggleAddOn = (addOn) => {
    setSelectedAddOns((current) =>
      current.some((item) => item._id === addOn._id)
        ? current.filter((item) => item._id !== addOn._id)
        : [...current, addOn]
    );
  };

  const handleAddToCart = () => {
    const parentId = product.id || product.slug || String(product._id || '');
    const variantId = selectedVariant?.id || null;
    const newItem = {
      id: `${parentId}-${variantId || selectedVariant?.name || 'std'}-${Date.now()}`,
      productId: parentId,
      variantId,
      productName: selectedVariant ? `${selectedVariant.name} ${product.name}` : product.name,
      image: product.image,
      variant: selectedVariant ? {
        id: selectedVariant.id,
        name: selectedVariant.name,
        size: selectedVariant.size,
        price: selectedVariant.price,
      } : null,
      addOns: selectedAddOns,
      quantity,
      unitPrice: basePrice,
      total,
    };

    const existing = getCartItems();
    localStorage.setItem('asr-cart', JSON.stringify([...existing, newItem]));
    navigate(`/order/${seatToken}/menu`);
  };

  return (
    <div className="asr-sheet-overlay" aria-modal="true" role="dialog">
      <button type="button" className="asr-sheet-backdrop" onClick={() => navigate(`/order/${seatToken}/menu`)} aria-label="Close" />
      <div className="asr-product-sheet">
        <div className="asr-sheet-handle" />
        <div className="asr-sheet-header">
          <div>
            <p className="asr-kicker">Customise your item</p>
            <h3>{product.name}</h3>
          </div>
        </div>
        <img src={product.image} alt={product.name} className="asr-product-image-large" />

        <div className="asr-option-group">
          <h4>Choose Size</h4>
          <div className="asr-option-list">
            {(product.variants?.length ? product.variants : [{ name: 'Standard', size: product.shortDescription, price: product.basePrice }]).map((variant) => (
              <button
                type="button"
                key={variant._id || variant.name}
                className={`asr-option-card ${selectedVariant?.name === variant.name ? 'selected' : ''}`}
                onClick={() => setSelectedVariant(variant)}
              >
                <div>
                  <strong>{variant.name}</strong>
                  <small>{variant.size}</small>
                </div>
                <span>₹{variant.price}</span>
              </button>
            ))}
          </div>
        </div>

        {product.addOns?.length > 0 && (
          <div className="asr-option-group">
            <h4>Cinema Toppings &amp; Extras</h4>
            <div className="asr-option-list asr-option-list-stack">
              {product.addOns.map((addOn) => (
                <button
                  type="button"
                  key={addOn._id || addOn.name}
                  className={`asr-option-card ${selectedAddOns.some((item) => item._id === addOn._id) ? 'selected' : ''}`}
                  onClick={() => toggleAddOn(addOn)}
                >
                  <div>
                    <strong>{addOn.name}</strong>
                  </div>
                  <span>+₹{addOn.price}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="asr-quantity-row">
          <h4>Quantity</h4>
          <div className="asr-quantity-control">
            <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
            <span>{quantity}</span>
            <button type="button" onClick={() => setQuantity((value) => value + 1)}>+</button>
          </div>
        </div>

        <button type="button" className="asr-primary-button asr-sheet-button" onClick={handleAddToCart}>
          Add to Cart • ₹{total}
        </button>
      </div>
    </div>
  );
}

function CartScreen() {
  const { seatToken } = useParams();
  const { seat, loading } = useSeat(seatToken);
  const navigate = useNavigate();
  const [items, setItems] = useState(() => getCartItems());

  const total = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (loading) return <Loader message="Preparing your cart..." />;
  if (!seat) {
    return (
      <div className="asr-screen asr-state-screen">
        <div className="asr-panel asr-error-panel">
          <h2>Seat invalid.</h2>
        </div>
      </div>
    );
  }

  const updateQuantity = (id, delta) => {
    const nextItems = items
      .map((item) => {
        if (item.id !== id) return item;
        const updatedQuantity = item.quantity + delta;
        if (updatedQuantity <= 0) return null;
        const addedPrice = (item.addOns || []).reduce((sum, addOn) => sum + Number(addOn.price || 0), 0);
        const perUnit = Number(item.unitPrice || 0) + addedPrice;
        return {
          ...item,
          quantity: updatedQuantity,
          total: perUnit * updatedQuantity,
        };
      })
      .filter(Boolean);

    setItems(nextItems);
    localStorage.setItem('asr-cart', JSON.stringify(nextItems));
  };

  const removeItem = (id) => {
    const nextItems = items.filter((item) => item.id !== id);
    setItems(nextItems);
    localStorage.setItem('asr-cart', JSON.stringify(nextItems));
  };

  return (
    <div className="asr-cart-page-wrap">
      {/* 1. TOP HEADER */}
      <header className="asr-cart-top-header">
        <div className="asr-cart-top-header-inner">
          <button
            type="button"
            className="asr-cart-header-back"
            onClick={() => navigate(`/order/${seatToken}/menu`)}
            aria-label="Go back to menu"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="asr-cart-header-title">
            <span className="asr-cart-brand-tag">ASR CINEMAS</span>
            <h1 className="asr-cart-header-h1">Review Order</h1>
          </div>
          <div className="asr-cart-header-profile" aria-label="Profile">
            <span className="material-symbols-outlined">person</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="asr-cart-main-container">
        {/* 2. DELIVER TO SEAT CARD */}
        <section className="asr-cart-seat-card">
          <div className="asr-cart-seat-card-top">
            <div className="asr-cart-seat-deliver-to">
              <span className="material-symbols-outlined asr-seat-icon">event_seat</span>
              <span className="asr-cart-label">DELIVER TO</span>
            </div>
            <span className="asr-cart-seat-confirmed-badge">
              <span className="asr-cart-confirmed-dot" />
              Seat Confirmed
            </span>
          </div>
          <div className="asr-cart-seat-info-row">
            <span className="asr-cart-audi-text">{seat?.auditorium || 'Audi 2'}</span>
            <span className="asr-cart-dot-separator">•</span>
            <span className="asr-cart-seat-num-text">Seat {seat?.seatNumber || 'B16'}</span>
          </div>
          <p className="asr-cart-interval-note">
            <span className="material-symbols-outlined asr-clock-icon">schedule</span>
            Delivered directly to your seat during interval
          </p>
        </section>

        {items.length > 0 ? (
          <>
            {/* 3. YOUR ORDER SECTION */}
            <section className="asr-cart-order-section">
              <div className="asr-cart-order-section-header">
                <span className="asr-cart-label">YOUR ORDER</span>
                <span className="asr-cart-items-count-badge">
                  {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
              </div>
              <div className="asr-cart-items-card">
                {items.map((item, idx) => {
                  const itemImg = resolveItemImage(item);
                  const { serving, addOnBadge } = resolveItemSubtitle(item);
                  return (
                    <div key={item.id || idx} className="asr-cart-item-wrap">
                      {idx > 0 && <div className="asr-cart-item-divider" />}
                      <div className="asr-cart-item-row">
                        <img src={itemImg} alt={item.productName} className="asr-cart-item-img" />
                        <div className="asr-cart-item-details">
                          <div className="asr-cart-item-title-row">
                            <h3 className="asr-cart-item-title">{item.productName}</h3>
                            <button
                              type="button"
                              className="asr-cart-item-close-btn"
                              onClick={() => removeItem(item.id)}
                              aria-label={`Remove ${item.productName}`}
                            >
                              <span className="material-symbols-outlined">close</span>
                            </button>
                          </div>
                          <div className="asr-cart-item-sub-row">
                            <span className="asr-cart-item-serving-text">{serving}</span>
                            {addOnBadge && (
                              <>
                                <span className="asr-cart-sub-dot">•</span>
                                <span className="asr-cart-addon-pill">{addOnBadge}</span>
                              </>
                            )}
                          </div>
                          <div className="asr-cart-item-price-row">
                            <span className="asr-cart-item-price">₹{Number(item.total).toLocaleString('en-IN')}</span>
                            <div className="asr-cart-stepper-box">
                              <button
                                type="button"
                                className="asr-cart-stepper-btn"
                                onClick={() => updateQuantity(item.id, -1)}
                                aria-label="Decrease quantity"
                              >
                                <span className="material-symbols-outlined">remove</span>
                              </button>
                              <span className="asr-cart-stepper-val">{item.quantity}</span>
                              <button
                                type="button"
                                className="asr-cart-stepper-btn"
                                onClick={() => updateQuantity(item.id, 1)}
                                aria-label="Increase quantity"
                              >
                                <span className="material-symbols-outlined">add</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 4. ADD MORE CINEMA SNACKS BUTTON */}
            <button
              type="button"
              className="asr-cart-add-more-pill-btn"
              onClick={() => navigate(`/order/${seatToken}/menu`)}
            >
              <span className="material-symbols-outlined asr-add-circle-icon">add_circle</span>
              <span>Add More Cinema Snacks</span>
            </button>

            {/* 5. BILL DETAILS SECTION */}
            <section className="asr-cart-bill-section">
              <span className="asr-cart-label asr-cart-bill-label-heading">BILL DETAILS</span>
              <div className="asr-cart-bill-card">
                <div className="asr-cart-bill-row">
                  <span className="asr-cart-bill-left">Item Total</span>
                  <span className="asr-cart-bill-right-dark">₹{total.toLocaleString('en-IN')}</span>
                </div>
                <div className="asr-cart-bill-row">
                  <div className="asr-cart-bill-left asr-cart-info-row">
                    <span>Cinema Service &amp; Taxes</span>
                    <span className="material-symbols-outlined asr-info-glyph">info</span>
                  </div>
                  <span className="asr-cart-bill-free-badge">FREE</span>
                </div>
                <div className="asr-cart-bill-row">
                  <span className="asr-cart-bill-left">Interval Seat Delivery</span>
                  <span className="asr-cart-bill-free-badge">FREE</span>
                </div>
                <div className="asr-cart-bill-divider" />
                <div className="asr-cart-bill-total-row">
                  <div className="asr-cart-bill-total-copy">
                    <span className="asr-cart-total-title">Total Amount</span>
                    <span className="asr-cart-total-sub">Includes all cinema surcharges</span>
                  </div>
                  <span className="asr-cart-total-amount">₹{total.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </section>

            {/* 6. SECURITY NOTICE */}
            <div className="asr-cart-security-badge">
              <span className="material-symbols-outlined asr-security-shield">verified_user</span>
              <span>Payment will be completed securely on the next step</span>
            </div>
          </>
        ) : (
          /* EMPTY STATE */
          <div className="asr-cart-empty-tray">
            <div className="asr-cart-empty-circle">
              <span className="material-symbols-outlined asr-empty-basket-glyph">shopping_basket</span>
            </div>
            <h3 className="asr-cart-empty-title">Your Concession Tray is Empty</h3>
            <p className="asr-cart-empty-desc">Enhance your movie with freshly made popcorn and chilled drinks.</p>
            <button
              type="button"
              className="asr-cart-empty-action-btn"
              onClick={() => navigate(`/order/${seatToken}/menu`)}
            >
              Browse Food Menu
            </button>
          </div>
        )}
      </main>

      {/* 7. STICKY BOTTOM PROCEED BAR */}
      {items.length > 0 && (
        <aside className="asr-cart-bottom-bar">
          <div className="asr-cart-bottom-inner">
            <button
              type="button"
              className="asr-cart-proceed-cta"
              onClick={() => navigate(`/order/${seatToken}/payment`)}
            >
              <span className="asr-cart-proceed-left">
                <span className="material-symbols-outlined asr-lock-glyph">lock</span>
                <span>Proceed to Payment</span>
              </span>
              <span className="asr-cart-proceed-price">₹{total.toLocaleString('en-IN')}</span>
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

function PaymentScreen() {
  const { seatToken } = useParams();
  const { seat, loading } = useSeat(seatToken);
  const navigate = useNavigate();
  const [items] = useState(() => getCartItems());
  const [selectedApp, setSelectedApp] = useState('Google Pay');
  const [paymentState, setPaymentState] = useState('default');
  const [paymentError, setPaymentError] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [upiIdInput, setUpiIdInput] = useState('');
  const [upiVerified, setUpiVerified] = useState(false);
  const [gatewayConfig, setGatewayConfig] = useState({ configured: false });

  useEffect(() => {
    let isMounted = true;
    api.get('/payments/config')
      .then((res) => {
        if (isMounted && res.data) {
          setGatewayConfig(res.data);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  const total = items.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const itemCount = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (loading) return <Loader message="Checking out..." />;
  if (!seat || seat.status !== 'active') {
    return (
      <div className="asr-screen asr-state-screen">
        <div className="asr-panel asr-error-panel">
          <h2>Seat Not Available</h2>
          <p>
            {seat && seat.status !== 'active'
              ? `Seat ${seat.seatNumber} in ${seat.auditorium} is currently out of service. Orders cannot be placed.`
              : 'Seat information could not be verified. Please scan an active seat QR code.'}
          </p>
        </div>
      </div>
    );
  }

  const saveAndNavigateSuccess = (orderToSave) => {
    const trackingToken =
      orderToSave?.trackingToken ||
      sessionStorage.getItem('asr-tracking-token') ||
      '';
    const activeOrderId =
      orderToSave?.id ||
      orderToSave?.orderNumber ||
      sessionStorage.getItem('asr-active-order-id') ||
      '';

    if (trackingToken) {
      sessionStorage.setItem('asr-tracking-token', trackingToken);
    }
    if (activeOrderId) {
      sessionStorage.setItem('asr-active-order-id', activeOrderId);
    }

    const savedOrder = {
      ...orderToSave,
      id: activeOrderId,
      orderNumber: activeOrderId,
      trackingToken,
      seat: orderToSave.auditorium || seat?.auditorium || 'Audi 2',
      seatNumber: orderToSave.seat || seat?.seatNumber || 'B16',
      items: items.length ? items : (orderToSave.items || []),
      total: orderToSave.total ?? total,
      paymentMethod: orderToSave.paymentMethod || selectedApp,
      paymentStatus: orderToSave.paymentStatus || 'Pending',
      createdAt: orderToSave.createdAt || new Date().toISOString(),
    };

    localStorage.setItem('asr-last-order', JSON.stringify(savedOrder));
    localStorage.removeItem('asr-cart');
    setPaymentState('success');

    // Strip leading '#' to prevent URL hash fragment confusion
    const cleanOrderId = String(activeOrderId).replace(/^#/, '');
    navigate(`/order/${seatToken}/success?orderId=${encodeURIComponent(cleanOrderId)}`);
  };

  const confirmPayment = async () => {
    if (paymentState === 'processing' || !items.length) return;
    setPaymentState('processing');
    setPaymentError('');

    const minDelay = new Promise((resolve) => window.setTimeout(resolve, 600));

    try {
      if (!seat || seat.status !== 'active') {
        setPaymentState('error');
        setPaymentError('Seat is currently unverified or out of service. Orders cannot be placed.');
        return;
      }

      // Retrieve customer details stored from SeatConfirmationScreen
      let customerData = null;
      try {
        const raw = sessionStorage.getItem('asr-customer');
        if (raw) customerData = JSON.parse(raw);
      } catch {
        customerData = null;
      }

      if (!customerData?.name || !customerData?.phone) {
        setPaymentState('error');
        setPaymentError('Customer details missing. Please return to seat verification to enter your name and phone number.');
        return;
      }

      const clientKey = `${seatToken || seat?.token || 'audi2-a01'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const orderPayload = {
        seatToken: seatToken || seat?.token || '',
        customer: {
          name: customerData.name.trim(),
          phone: customerData.phone.replace(/\D/g, ''),
        },
        idempotencyKey: clientKey,
        items,
        subtotal: total,
        taxes: 0,
        deliveryFee: 0,
        discount: 0,
        total,
        paymentMethod: selectedApp === 'UPI ID' ? (upiIdInput || 'UPI ID') : selectedApp,
        paymentStatus: 'Pending',
        specialInstructions: '',
      };

      const [response] = await Promise.all([
        api.post('/orders', orderPayload),
        minDelay,
      ]);

      const createdOrder = response.data?.order;
      if (!createdOrder) {
        throw new Error('Invalid order response from server.');
      }

      const trackingToken = response.data?.trackingToken || createdOrder.trackingToken || '';
      if (trackingToken) {
        sessionStorage.setItem('asr-tracking-token', trackingToken);
      }
      if (createdOrder.id) {
        sessionStorage.setItem('asr-active-order-id', createdOrder.id);
      }

      // If Paytm Gateway is configured, initiate transaction and invoke CheckoutJS
      try {
        const initRes = await api.post('/payments/initiate', {
          orderId: createdOrder.id,
        });

        if (initRes.data?.configured && initRes.data?.txnToken) {
          const { txnToken, paytmOrderId, mid, host, amount } = initRes.data;

          const scriptLoaded = await new Promise((resolve) => {
            const existingScript = document.getElementById('paytm-checkoutjs');
            if (existingScript || (window.Paytm && window.Paytm.CheckoutJS)) {
              return resolve(true);
            }
            const script = document.createElement('script');
            script.id = 'paytm-checkoutjs';
            script.src = `${host}/merchantpgpui/checkoutjs/merchants/${mid}.js`;
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
          });

          if (scriptLoaded && window.Paytm && window.Paytm.CheckoutJS) {
            const checkoutConfig = {
              root: '',
              flow: 'DEFAULT',
              data: {
                orderId: paytmOrderId,
                token: txnToken,
                tokenType: 'TXN_TOKEN',
                amount: String(amount),
              },
              merchant: {
                mid,
                name: 'ASR Cinemas',
              },
              handler: {
                notifyCurrencyCode: () => {},
                transactionStatus: async (paymentStatus) => {
                  console.log('Paytm transaction completed:', paymentStatus);
                  try {
                    const statusRes = await api.post('/payments/verify-status', {
                      orderId: createdOrder.id,
                      paytmOrderId,
                    });
                    const verifiedOrder = statusRes.data?.order || createdOrder;
                    saveAndNavigateSuccess(verifiedOrder);
                  } catch (err) {
                    console.error('Status verification error:', err);
                    saveAndNavigateSuccess(createdOrder);
                  }
                },
              },
            };

            await window.Paytm.CheckoutJS.init(checkoutConfig);
            window.Paytm.CheckoutJS.invoke();
            return;
          }
        }
      } catch (paytmErr) {
        console.warn('Paytm initiation notice:', paytmErr?.response?.data?.message || paytmErr.message);
      }

      // If gateway is unconfigured or in development mode without active sandbox keys:
      saveAndNavigateSuccess(createdOrder);
    } catch (error) {
      console.error('Order creation failed:', error);
      setPaymentState('error');
      setPaymentError(
        error?.response?.data?.message ||
        'Unable to connect to cinema server. Please ensure backend is running and try again.'
      );
    }
  };

  const upiApps = [
    {
      id: 'gpay',
      name: 'Google Pay',
      sub: 'Instant tap',
      icon: 'account_balance_wallet',
    },
    {
      id: 'phonepe',
      name: 'PhonePe',
      sub: 'Direct link',
      icon: 'payments',
    },
    {
      id: 'paytm',
      name: 'Paytm',
      sub: 'UPI / Wallet',
      icon: 'account_balance',
    },
    {
      id: 'other',
      name: 'UPI ID',
      sub: 'Enter ID',
      icon: 'alternate_email',
    },
  ];

  return (
    <div className="asr-pay-page-wrap">
      {/* 1. TOP HEADER */}
      <header className="asr-pay-top-header">
        <div className="asr-pay-top-header-inner">
          <button
            type="button"
            className="asr-pay-header-back"
            onClick={() => navigate(`/order/${seatToken}/cart`)}
            aria-label="Back to review order"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="asr-pay-header-title">
            <span className="asr-pay-brand-tag">ASR CINEMAS</span>
            <h1 className="asr-pay-header-h1">Review Order</h1>
          </div>
          <div className="asr-pay-header-profile" aria-label="Profile">
            <span className="material-symbols-outlined">person</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="asr-pay-main-container">
        {/* 2. SEAT & CONTEXT CARD */}
        <section className="asr-pay-card asr-pay-seat-card">
          <div className="asr-pay-card-top-row">
            <span className="asr-pay-label">PAYING FOR</span>
            <div className="asr-pay-seat-badge">
              <span className="asr-pay-confirmed-dot" />
              <span>Seat Confirmed</span>
            </div>
          </div>
          <div className="asr-pay-seat-middle-row">
            <div className="asr-pay-seat-name-wrap">
              <span className="material-symbols-outlined asr-pay-chair-icon">chair</span>
              <h2 className="asr-pay-seat-name">{seat?.auditorium || 'Audi 2'}, Seat {seat?.seatNumber || 'B16'}</h2>
            </div>
            <span className="asr-pay-items-count-text">{itemCount} {itemCount === 1 ? 'Item' : 'Items'}</span>
          </div>
          <div className="asr-pay-interval-row">
            <span className="material-symbols-outlined asr-pay-clock-icon">schedule</span>
            <p className="asr-pay-interval-text">Delivered directly to your seat during interval. Silent hand-off.</p>
          </div>
        </section>

        {/* 3. TOTAL TO PAY CARD */}
        <section className="asr-pay-card asr-pay-total-card">
          <span className="asr-pay-label asr-pay-label-bold">TOTAL TO PAY</span>
          <div className="asr-pay-total-amount-row">
            <span className="asr-pay-total-val">₹{total.toLocaleString('en-IN')}</span>
            <span className="asr-pay-all-inclusive-text">all-inclusive</span>
          </div>
          <div className="asr-pay-receipt-row">
            <span className="material-symbols-outlined asr-pay-receipt-icon">receipt_long</span>
            <span className="asr-pay-receipt-text">Official booking receipt generated upon authorization</span>
          </div>
        </section>

        {/* 4. PRIMARY PAYMENT METHOD SECTION (UPI) */}
        <section className="asr-pay-card asr-pay-method-card">
          <div className="asr-pay-method-header-row">
            <span className="asr-pay-label asr-pay-label-bold">PAYMENT METHOD</span>
            <div className="asr-pay-secure-tag">
              <span className="material-symbols-outlined asr-pay-shield-icon">verified_user</span>
              <span>100% Secure</span>
            </div>
          </div>

          <div
            className="asr-pay-unconfigured-notice"
            style={{
              margin: '0 0 16px',
              padding: '10px 14px',
              backgroundColor: gatewayConfig.configured ? '#ecfdf5' : '#fffbeb',
              border: `1px solid ${gatewayConfig.configured ? '#a7f3d0' : '#fde68a'}`,
              borderRadius: '8px',
              color: gatewayConfig.configured ? '#065f46' : '#92400e',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              lineHeight: 1.4,
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '18px', color: gatewayConfig.configured ? '#059669' : '#d97706' }}
            >
              {gatewayConfig.configured ? 'lock' : 'info'}
            </span>
            <span>
              {gatewayConfig.configured
                ? `Paytm Gateway active (MID: ${gatewayConfig.mid}). Proceed to authorize via official Paytm Checkout.`
                : <>Paytm Gateway integration is pending configuration. Orders placed will be recorded in <strong>Payment Pending</strong> status.</>}
            </span>
          </div>

          {/* ACTIVE UPI ACCORDION BAR */}
          <div className="asr-pay-upi-bar">
            <div className="asr-pay-upi-bar-left">
              <div className="asr-pay-upi-icon-box">
                <span className="material-symbols-outlined asr-pay-contactless-icon">contactless</span>
              </div>
              <div className="asr-pay-upi-bar-text">
                <div className="asr-pay-upi-title-wrap">
                  <span className="asr-pay-upi-title">UPI</span>
                  <span className="asr-pay-faster-badge">FASTER</span>
                </div>
                <p className="asr-pay-upi-sub">Pay instantly using any verified app</p>
              </div>
            </div>
            <div className="asr-pay-upi-check-circle">
              <span className="material-symbols-outlined">check</span>
            </div>
          </div>

          {/* UPI APP CHOOSER */}
          <div className="asr-pay-app-chooser-wrap">
            <span className="asr-pay-choose-label">Choose UPI Application:</span>
            <div className="asr-pay-app-grid">
              {upiApps.map((app) => {
                const isSelected = selectedApp === app.name;
                return (
                  <button
                    type="button"
                    key={app.id}
                    className={`asr-pay-app-box ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedApp(app.name)}
                  >
                    <div className="asr-pay-app-icon-wrap">
                      <span className="material-symbols-outlined">{app.icon}</span>
                    </div>
                    <div className="asr-pay-app-copy">
                      <span className="asr-pay-app-name">{app.name}</span>
                      <span className="asr-pay-app-sub">{app.sub}</span>
                    </div>
                    <div className={`asr-pay-radio-ring ${isSelected ? 'active' : ''}`}>
                      <div className="asr-pay-radio-dot" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* EXPANDABLE UPI ID INPUT */}
            {selectedApp === 'UPI ID' && (
              <div className="asr-pay-upi-id-input-box">
                <input
                  type="text"
                  placeholder="username@okhdfcbank"
                  value={upiIdInput}
                  onChange={(e) => setUpiIdInput(e.target.value)}
                  className="asr-pay-upi-text-input"
                />
                <button
                  type="button"
                  className="asr-pay-upi-verify-btn"
                  onClick={() => setUpiVerified(Boolean(upiIdInput.trim()))}
                >
                  {upiVerified ? '✓ Verified' : 'Verify'}
                </button>
              </div>
            )}
          </div>

          {/* DYNAMIC QR ACCORDION */}
          <div className="asr-pay-qr-accordion">
            <div className="asr-pay-qr-top-row">
              <div className="asr-pay-qr-label-left">
                <span className="material-symbols-outlined asr-pay-qr-icon">qr_code_scanner</span>
                <span className="asr-pay-qr-title">Pay via Dynamic QR</span>
              </div>
              <button
                type="button"
                className="asr-pay-qr-toggle-btn"
                onClick={() => setShowQr(!showQr)}
              >
                {showQr ? 'Hide QR Code' : 'Show QR Code'}
              </button>
            </div>
            {showQr && (
              <div className="asr-pay-qr-content">
                <div className="asr-pay-qr-box">
                  <svg className="asr-pay-qr-svg" viewBox="0 0 100 100" fill="currentColor">
                    <path d="M10,10 h30 v30 h-30 z M15,15 v20 h20 v-20 z M20,20 h10 v10 h-10 z" />
                    <path d="M60,10 h30 v30 h-30 z M65,15 v20 h20 v-20 z M70,20 h10 v10 h-10 z" />
                    <path d="M10,60 h30 v30 h-30 z M15,65 v20 h20 v-20 z M20,70 h10 v10 h-10 z" />
                    <path d="M45,15 h10 v10 h-10 z M15,45 h10 v10 h-10 z M30,45 h15 v10 h-15 z M50,45 h10 v10 h-10 z M75,45 h15 v10 h-15 z M45,60 h10 v15 h-10 z M60,60 h15 v10 h-15 z M60,75 h25 v15 h-25 z M85,60 h5 v10 h-5 z" />
                    <circle cx="50" cy="50" fill="#af101a" r="7" />
                  </svg>
                </div>
                <p className="asr-pay-qr-subtext">Display on companion device or scan with any UPI App</p>
              </div>
            )}
          </div>
        </section>

        {/* 5. CINEMA CONFECTIONERY / DELIVERY GUARANTEE BANNER */}
        <div className="asr-pay-banner">
          <img src={deliveryGuaranteeImg} alt="In-seat delivery guarantee" className="asr-pay-banner-img" />
          <div className="asr-pay-banner-overlay">
            <span className="asr-pay-banner-tag">IN-SEAT DELIVERY GUARANTEE</span>
            <p className="asr-pay-banner-title">Warm, fresh snacks before the lights dim</p>
          </div>
        </div>

        {/* 6. FARE BREAKDOWN CARD */}
        <section className="asr-pay-card asr-pay-fare-card">
          <span className="asr-pay-label asr-pay-label-bold">FARE BREAKDOWN</span>
          <div className="asr-pay-fare-rows">
            <div className="asr-pay-fare-row">
              <span className="asr-pay-fare-left">Food &amp; Beverage Total</span>
              <span className="asr-pay-fare-val">₹{total.toLocaleString('en-IN')}</span>
            </div>
            <div className="asr-pay-fare-row">
              <span className="asr-pay-fare-left">Cinema GST &amp; Concession Charges</span>
              <span className="asr-pay-fare-subval">₹0 (Included)</span>
            </div>
            <div className="asr-pay-fare-row">
              <span className="asr-pay-fare-left">Auditorium Seat Delivery</span>
              <span className="asr-pay-fare-free">FREE</span>
            </div>
          </div>
          <div className="asr-pay-fare-divider" />
          <div className="asr-pay-final-row">
            <span className="asr-pay-final-title">Final Payable</span>
            <span className="asr-pay-final-amount">₹{total.toLocaleString('en-IN')}</span>
          </div>
        </section>

        {/* 7. COMPLIANCE & SECURITY FOOTER */}
        <div className="asr-pay-security-footer">
          <div className="asr-pay-security-row">
            <span className="material-symbols-outlined asr-pay-lock-sm">lock</span>
            <span>256-bit Secure UPI Gateway • Authorized ASR Cinema Concession Portal</span>
          </div>
          <p className="asr-pay-terms-text">By continuing, you agree to our silent delivery terms &amp; snack freshness policy.</p>
          {paymentError && (
            <div
              style={{
                margin: '12px 0 0',
                padding: '10px 14px',
                backgroundColor: '#fee2e2',
                border: '1px solid #f87171',
                borderRadius: '8px',
                color: '#b91c1c',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>error</span>
              <span>{paymentError}</span>
            </div>
          )}
        </div>
      </main>

      {/* 8. STICKY BOTTOM PROCEED BAR */}
      <aside className="asr-pay-bottom-bar">
        <div className="asr-pay-bottom-inner">
          <button
            type="button"
            className="asr-pay-proceed-cta"
            onClick={confirmPayment}
            disabled={paymentState === 'processing' || !items.length}
          >
            <span className="asr-pay-proceed-left">
              <span className="material-symbols-outlined asr-pay-lock-glyph">lock</span>
              <span>
                {paymentState === 'processing'
                  ? 'Initiating Payment...'
                  : (paymentError
                    ? 'Retry Placing Order'
                    : (gatewayConfig.configured
                      ? 'Proceed to Pay (Paytm)'
                      : 'Submit Order (Payment Pending)'))}
              </span>
            </span>
            <span className="asr-pay-proceed-price">₹{total.toLocaleString('en-IN')}</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

function SuccessScreen() {
  const { seatToken } = useParams();
  const { seat } = useSeat(seatToken);
  const navigate = useNavigate();

  // Helper to test if an order object matches a target order ID (with or without '#')
  const isOrderMatching = (order, id) => {
    if (!order || !id) return false;
    const cleanId = String(id).replace(/^#/, '');
    const cleanOrderId = String(order.id || order.orderNumber || '').replace(/^#/, '');
    return Boolean(cleanId && cleanOrderId && cleanId === cleanOrderId);
  };

  // Extract orderId from URL query string or hash (to handle '#' fragment in order IDs safely)
  const searchParams = new URLSearchParams(window.location.search);
  const queryOrderId = searchParams.get('orderId');
  const queryToken = searchParams.get('token');

  const rawHash = window.location.hash.replace(/^#/, '');
  const hashOrderId = (rawHash.startsWith('ASR') || rawHash.startsWith('%23ASR'))
    ? decodeURIComponent(rawHash)
    : '';

  const resolvedRawId =
    queryOrderId ||
    hashOrderId ||
    sessionStorage.getItem('asr-active-order-id') ||
    '';

  const cleanOrderId = resolvedRawId.replace(/^#/, '');
  const activeOrderId = cleanOrderId ? (cleanOrderId.startsWith('ASR') ? `#${cleanOrderId}` : cleanOrderId) : '';

  const [cachedOrder] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('asr-last-order') || 'null');
      if (parsed && isOrderMatching(parsed, activeOrderId)) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  // Bearer tracking token: retrieve primarily from sessionStorage; scrub from URL if present
  const activeToken =
    sessionStorage.getItem('asr-tracking-token') ||
    queryToken ||
    (isOrderMatching(cachedOrder, activeOrderId) ? cachedOrder?.trackingToken : '') ||
    '';

  useEffect(() => {
    if (queryToken) {
      sessionStorage.setItem('asr-tracking-token', queryToken);
      // Cleanse URL so token is not exposed in history, address bar, or Referer headers
      try {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.searchParams.delete('token');
        window.history.replaceState({}, document.title, cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
      } catch {
        // ignore
      }
    }
  }, [queryToken]);

  const [liveOrder, setLiveOrder] = useState(cachedOrder);
  const [trackingLoading, setTrackingLoading] = useState(Boolean(activeOrderId && activeToken));
  const [trackingError, setTrackingError] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTerminalAuthError, setIsTerminalAuthError] = useState(false);

  // Live order status polling function (transmits token via protected header, not URL query string)
  const fetchOrderTracking = async (isManual = false) => {
    if (!activeOrderId || !activeToken || isTerminalAuthError) {
      setTrackingLoading(false);
      return;
    }

    if (isManual) setIsRefreshing(true);

    try {
      const response = await api.get(`/orders/${encodeURIComponent(cleanOrderId || activeOrderId)}/track`, {
        headers: {
          'x-tracking-token': activeToken,
        },
      });

      if (response.data && response.data.order) {
        setLiveOrder(response.data.order);
        setTrackingError('');
        try {
          localStorage.setItem('asr-last-order', JSON.stringify(response.data.order));
        } catch {
          // ignore
        }
      }
    } catch (err) {
      if (err?.response?.status === 403 || err?.response?.status === 401) {
        setTrackingError('Order tracking authorization could not be verified.');
        setIsTerminalAuthError(true);
      } else if (err?.response?.status === 404) {
        setTrackingError('Order not found on cinema server.');
      } else if (isManual) {
        setTrackingError('Network connection interrupted. Will retry automatically.');
      }
    } finally {
      setTrackingLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  };

  // Periodic polling setup with cleanup on unmount or terminal state
  useEffect(() => {
    if (!activeOrderId || !activeToken || isTerminalAuthError) {
      setTrackingLoading(false);
      return;
    }

    let isMounted = true;
    fetchOrderTracking();

    const isTerminalStatus = (order) => {
      if (!order) return false;
      const terminalStatuses = ['Served', 'Completed', 'Cancelled'];
      return terminalStatuses.includes(order.status) || order.paymentStatus === 'Failed';
    };

    if (liveOrder && isOrderMatching(liveOrder, activeOrderId) && isTerminalStatus(liveOrder)) {
      return;
    }

    const intervalId = setInterval(() => {
      if (!isMounted) return;
      if (liveOrder && isOrderMatching(liveOrder, activeOrderId) && isTerminalStatus(liveOrder)) {
        clearInterval(intervalId);
        return;
      }
      fetchOrderTracking();
    }, 4000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [activeOrderId, activeToken, liveOrder?.status, liveOrder?.paymentStatus, isTerminalAuthError]);

  const defaultItems = [
    {
      id: 'default-1',
      productName: 'Signature Butter Popcorn',
      subtitle: 'Tub (350g) • Extra Warm Butter',
      quantity: 1,
      total: 440,
    },
    {
      id: 'default-2',
      productName: 'Gourmet Cheesy Fries',
      subtitle: 'Jalapeño Melt Dip Included',
      quantity: 1,
      total: 320,
    },
  ];

  const currentOrder = liveOrder || cachedOrder;
  const currentStatus = currentOrder?.status || 'Pending';
  const currentPaymentStatus = currentOrder?.paymentStatus || 'Pending';
  const orderPaymentMethod = currentOrder?.paymentMethod || 'UPI';

  const isTerminal =
    ['Served', 'Completed', 'Cancelled'].includes(currentStatus) ||
    currentPaymentStatus === 'Failed';

  // 4-Stage Timeline Steps based strictly on backend state
  const isStep1Done = currentPaymentStatus === 'Paid';
  const isStep1Active = currentPaymentStatus === 'Pending';

  const isStep2Done = ['Preparing', 'Ready', 'Served', 'Completed'].includes(currentStatus) && currentPaymentStatus === 'Paid';
  const isStep2Active = currentStatus === 'Accepted' && currentPaymentStatus === 'Paid';

  const isStep3Done = ['Ready', 'Served', 'Completed'].includes(currentStatus) && currentPaymentStatus === 'Paid';
  const isStep3Active = currentStatus === 'Preparing' && currentPaymentStatus === 'Paid';

  // Step 4 is Delivered: ONLY marked done when staff actually records Served or Completed
  const isStep4Done = ['Served', 'Completed'].includes(currentStatus) && currentPaymentStatus === 'Paid';
  const isStep4Active = currentStatus === 'Ready' && currentPaymentStatus === 'Paid';

  // Progress Bar Width
  let progressPercent = 0;
  let activeStepNum = 1;
  if (isStep4Done) {
    progressPercent = 100;
    activeStepNum = 4;
  } else if (isStep3Done || isStep4Active) {
    progressPercent = 80;
    activeStepNum = 4;
  } else if (isStep2Done || isStep3Active) {
    progressPercent = 55;
    activeStepNum = 3;
  } else if (isStep1Done || isStep2Active) {
    progressPercent = 25;
    activeStepNum = 2;
  } else {
    progressPercent = 0;
    activeStepNum = 1;
  }

  // Callout Message
  let calloutNote = 'Order registered. Awaiting verified UPI payment.';
  if (currentPaymentStatus === 'Failed') {
    calloutNote = 'Payment was not completed. Please retry payment to send snacks to the kitchen.';
  } else if (currentStatus === 'Cancelled') {
    calloutNote = 'Order was cancelled by the concession counter.';
  } else if (isStep4Done) {
    calloutNote = `Hand-delivered to ${currentOrder?.auditorium || 'Audi'} • Seat ${currentOrder?.seat || 'your seat'}. Enjoy!`;
  } else if (currentStatus === 'Ready') {
    calloutNote = `Packed & ready! Concession runner is on the way to ${currentOrder?.auditorium || 'Audi'} • Seat ${currentOrder?.seat || 'your seat'}.`;
  } else if (currentStatus === 'Preparing') {
    calloutNote = 'Fresh cinema snacks are being prepared in the concession kitchen.';
  } else if (currentStatus === 'Accepted') {
    calloutNote = 'Kitchen accepted your order. Cooking will begin in a moment.';
  } else if (currentPaymentStatus === 'Paid') {
    calloutNote = 'Payment confirmed! Queued for kitchen preparation.';
  }

  // Hero Copy
  let heroTitle = 'Order Confirmed! 🎉';
  let heroLead = 'Fresh & hot cinema snacks on the way';
  let heroPillLabel = 'Kitchen Order Received';
  let heroPillIcon = 'celebration';

  if (currentPaymentStatus === 'Failed') {
    heroTitle = 'Payment Failed ⚠️';
    heroLead = 'Transaction could not be verified by payment gateway';
    heroPillLabel = 'Payment Unsuccessful';
    heroPillIcon = 'error';
  } else if (currentPaymentStatus === 'Pending') {
    heroTitle = 'Order Placed • Payment Pending ⏳';
    heroLead = 'Order registered. Will be sent to kitchen upon payment authorization';
    heroPillLabel = 'Awaiting Verified Payment';
    heroPillIcon = 'schedule';
  } else if (currentStatus === 'Cancelled') {
    heroTitle = 'Order Cancelled';
    heroLead = 'This order was cancelled by concession management';
    heroPillLabel = 'Cancelled';
    heroPillIcon = 'cancel';
  } else if (isStep4Done) {
    heroTitle = 'Delivered to Seat! 🍿🎬';
    heroLead = 'Your hot food and chilled drinks have arrived';
    heroPillLabel = 'Delivered to Seat';
    heroPillIcon = 'task_alt';
  } else if (currentStatus === 'Ready') {
    heroTitle = 'Packed & On Its Way! 🚀';
    heroLead = 'Runner is walking down the aisle to your seat';
    heroPillLabel = 'Out for In-Seat Delivery';
    heroPillIcon = 'delivery_dining';
  } else if (currentStatus === 'Preparing') {
    heroTitle = 'Kitchen is Preparing! 🍿';
    heroLead = 'Popping fresh corn and warming appetizers';
    heroPillLabel = 'Kitchen In-Prep';
    heroPillIcon = 'soup_kitchen';
  }

  const displayItems = currentOrder?.items && currentOrder.items.length > 0
    ? currentOrder.items.map((it, idx) => ({
        id: it.id || it.productId || `item-${idx}`,
        productName: it.productName || it.name || 'Cinema Snack',
        subtitle: it.variant?.name
          ? `${it.variant.name}${it.variant.size ? ` • ${it.variant.size}` : ''}`
          : (it.servingSize || 'Standard portion'),
        quantity: it.quantity || 1,
        total: it.total || (it.price ? it.price * (it.quantity || 1) : 0),
      }))
    : defaultItems;

  const displayTotal = currentOrder?.total || 950;
  const orderCode = currentOrder?.id || currentOrder?.orderNumber || '#ASR-8492';

  // Audi & Seat display format
  const rawAudi = currentOrder?.auditorium || seat?.auditorium || 'Audi 02';
  const audiNum = String(rawAudi.replace(/\D/g, '') || '02').padStart(2, '0');

  let seatDisplay = 'Seat B16';
  const rawSeatNum = currentOrder?.seat || currentOrder?.seatNumber || seat?.seatNumber;
  if (rawSeatNum) {
    const match = String(rawSeatNum).match(/^([A-Za-z]+)(\d+)$/);
    if (match) {
      seatDisplay = `Row ${match[1].toUpperCase()} • Seat ${match[2]}`;
    } else {
      seatDisplay = `Seat ${rawSeatNum}`;
    }
  }

  const patronName = currentOrder?.customer?.name || 'Cinema Guest';

  return (
    <div className="asr-succ-screen">
      {/* Top Header */}
      <header className="asr-succ-header">
        <div className="asr-succ-header-inner">
          <div className="asr-succ-brand-wrap">
            <div className="asr-succ-logo-mark">
              <span
                className="material-symbols-outlined"
                style={{ color: '#af101a', fontSize: '24px', fontVariationSettings: "'FILL' 1" }}
              >
                movie
              </span>
            </div>
            <div className="asr-succ-brand-text">
              <span className="asr-succ-brand-tag">ASR CINEMAS</span>
              <h1 className="asr-succ-title">Live Order Tracking</h1>
            </div>
          </div>
          <button type="button" className="asr-succ-profile-btn" aria-label="Profile">
            <span className="material-symbols-outlined">person</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="asr-succ-body">
        {/* 1. Screening in Progress Ribbon */}
        <div className="asr-succ-screening-ribbon">
          <div className="asr-succ-ribbon-left">
            <span className="material-symbols-outlined">theaters</span>
            <span className="asr-succ-ribbon-title">Screening in Progress</span>
          </div>
          <div className="asr-succ-ribbon-pill">
            <span className="asr-succ-pulsing-dot" />
            <span>SILENT RUNNER MODE</span>
          </div>
        </div>

        {/* 2. Hero Visual Anchor */}
        <div className="asr-succ-hero">
          <div className="asr-succ-hero-art">
            <div className="asr-succ-hero-glow" />
            <div className="asr-succ-tub-wrap">
              <svg className="asr-succ-tub-svg" fill="none" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
                <circle cx="48" cy="38" fill="#FDE047" r="14" />
                <circle cx="68" cy="36" fill="#FACC15" r="15" />
                <circle cx="34" cy="48" fill="#EAB308" r="13" />
                <circle cx="86" cy="46" fill="#FDE047" r="13" />
                <circle cx="58" cy="46" fill="#FEF08A" r="16" />
                <circle cx="44" cy="50" fill="#FACC15" r="10" />
                <circle cx="76" cy="48" fill="#CA8A04" r="11" />
                <path d="M42 34C44 30 52 30 54 34" stroke="#CA8A04" strokeLinecap="round" strokeWidth="2" />
                <path d="M62 31C65 28 72 28 75 32" stroke="#A16207" strokeLinecap="round" strokeWidth="2" />
                <path d="M78 42C82 40 88 42 89 45" stroke="#CA8A04" strokeLinecap="round" strokeWidth="1.5" />
                <path d="M30 56L38 108C38.5 111 41 113 44 113H76C79 113 81.5 111 82 108L90 56H30Z" fill="#FFFFFF" />
                <path d="M42 56L47 113H54L50 56H42Z" fill="#d32f2f" />
                <path d="M58 56L60 113H66L66 56H58Z" fill="#d32f2f" />
                <path d="M70 56L68 113H75L78 56H70Z" fill="#d32f2f" />
                <rect fill="#EEEEF0" height="7" rx="3.5" width="66" x="27" y="52" />
                <rect fill="#FFFFFF" height="5" rx="2.5" width="62" x="29" y="53" />
                <rect fill="#d32f2f" height="3" rx="1.5" width="24" x="48" y="54" />
                <circle cx="60" cy="84" fill="#1A1C1D" r="11" />
                <path d="M60 76L62.2 81.2L67.8 81.7L63.5 85.3L64.8 90.8L60 87.9L55.2 90.8L56.5 85.3L52.2 81.7L57.8 81.2L60 76Z" fill="#FFFFFF" />
              </svg>
            </div>
            <div className={`asr-succ-check-badge ${currentPaymentStatus === 'Paid' ? '' : 'asr-badge-pending'}`}>
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                {currentPaymentStatus === 'Paid' ? (isStep4Done ? 'done_all' : 'check_circle') : 'hourglass_top'}
              </span>
            </div>
          </div>
          <div className="asr-succ-hero-text">
            <div className="asr-succ-received-pill">
              <span className="material-symbols-outlined">{heroPillIcon}</span>
              <span>{heroPillLabel}</span>
            </div>
            <h2 className="asr-succ-hero-h1">{heroTitle}</h2>
            <p className="asr-succ-hero-lead">{heroLead}</p>
          </div>
        </div>

        {/* Live Auto-Refresh Bar */}
        <div className="asr-succ-live-indicator-bar">
          <div className="asr-succ-live-pill">
            <span className={`asr-succ-dot ${isTerminal ? 'asr-dot-gray' : 'asr-dot-green'}`} />
            <span>{isTerminal ? 'Status Finalized' : 'Live Tracking • Auto-updates every 4s'}</span>
          </div>
          <button
            type="button"
            className={`asr-succ-refresh-btn ${isRefreshing ? 'spinning' : ''}`}
            onClick={() => fetchOrderTracking(true)}
            disabled={isRefreshing}
            aria-label="Refresh order status"
          >
            <span className="material-symbols-outlined">refresh</span>
            <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Error notification if tracking issue */}
        {trackingError && (
          <div className="asr-succ-error-banner" role="alert">
            <span className="material-symbols-outlined">info</span>
            <span>{trackingError}</span>
          </div>
        )}

        {/* 3. REAL LIVE ORDER TIMELINE STEPPER */}
        <section className="asr-succ-card asr-succ-progress-card">
          <div className="asr-succ-progress-header">
            <div className="asr-succ-progress-title-wrap">
              <span className="material-symbols-outlined">timeline</span>
              <span className="asr-succ-progress-title">Live Kitchen &amp; Delivery Progress</span>
            </div>
            <span className="asr-succ-step-counter">
              {isStep4Done ? 'Delivered' : `Step ${activeStepNum} of 4`}
            </span>
          </div>

          <div className="asr-succ-track-wrap">
            <div className="asr-succ-track-bg" />
            <div className="asr-succ-track-fill" style={{ width: `${progressPercent}%` }} />

            <div className="asr-succ-nodes">
              {/* Step 1: Confirmed */}
              <div className={`asr-succ-node ${isStep1Done ? 'completed' : isStep1Active ? 'active' : 'pending'}`}>
                <div className="asr-succ-node-icon">
                  {isStep1Active && <div className="asr-succ-node-pulse" />}
                  <span className="material-symbols-outlined">receipt_long</span>
                </div>
                <span className="asr-succ-node-label">{isStep1Done ? 'Confirmed' : 'Pending'}</span>
              </div>

              {/* Step 2: Preparing */}
              <div className={`asr-succ-node ${isStep2Done ? 'completed' : isStep2Active ? 'active' : 'pending'}`}>
                <div className="asr-succ-node-icon">
                  {isStep2Active && <div className="asr-succ-node-pulse" />}
                  <span className="material-symbols-outlined">soup_kitchen</span>
                </div>
                <span className="asr-succ-node-label">Preparing</span>
              </div>

              {/* Step 3: Packed & Ready */}
              <div className={`asr-succ-node ${isStep3Done ? 'completed' : isStep3Active ? 'active' : 'pending'}`}>
                <div className="asr-succ-node-icon">
                  {isStep3Active && <div className="asr-succ-node-pulse" />}
                  <span className="material-symbols-outlined">inventory_2</span>
                </div>
                <span className="asr-succ-node-label">Ready</span>
              </div>

              {/* Step 4: Delivered to Seat (Only complete when staff marks Served/Completed) */}
              <div className={`asr-succ-node ${isStep4Done ? 'completed' : isStep4Active ? 'active' : 'pending'}`}>
                <div className="asr-succ-node-icon">
                  {isStep4Active && <div className="asr-succ-node-pulse" />}
                  <span className="material-symbols-outlined">room_service</span>
                </div>
                <span className="asr-succ-node-label">Delivered</span>
              </div>
            </div>
          </div>

          <div className="asr-succ-kitchen-callout">
            <span className="asr-succ-ping-dot" />
            <p className="asr-succ-kitchen-text">
              <strong>Status Update:</strong> {calloutNote}
            </p>
          </div>
        </section>

        {/* 4. Direct to Seat Service Card */}
        <section className="asr-succ-card asr-succ-service-card">
          <div className="asr-succ-service-accent" />
          <div className="asr-succ-service-content">
            <div className="asr-succ-bell-circle">
              <span className="material-symbols-outlined">room_service</span>
            </div>
            <div className="asr-succ-service-main">
              <div className="asr-succ-service-top">
                <h3 className="asr-succ-service-title">In-Seat Delivery Guarantee</h3>
                <span className="asr-succ-time-badge">Aisle Runner</span>
              </div>
              <p className="asr-succ-service-desc">
                Your snacks will be hand-delivered directly to your seat in ultra-silent packaging so your screening is completely uninterrupted.
              </p>
              <div className="asr-succ-movie-row">
                <span className="material-symbols-outlined">movie</span>
                <span>Sit back, relax &amp; enjoy the screening! 🎬✨</span>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Seat Confirmation Destination Card */}
        <section className="asr-succ-card asr-succ-seat-card">
          <div className="asr-succ-seat-header">
            <span className="asr-succ-seat-tag">DELIVERING TO SEAT</span>
            <span className="asr-succ-confirmed-pill">
              <span className="material-symbols-outlined">verified</span>
              <span>Seat Verified</span>
            </span>
          </div>
          <div className="asr-succ-seat-box">
            <div className="asr-succ-seat-box-left">
              <div className="asr-succ-audi-badge">
                <span className="asr-succ-audi-lbl">Audi</span>
                <span className="asr-succ-audi-num">{audiNum}</span>
              </div>
              <div className="asr-succ-seat-meta">
                <div className="asr-succ-seat-title">{seatDisplay}</div>
                <span className="asr-succ-seat-sub">Patron: {patronName}</span>
              </div>
            </div>
            <div className="asr-succ-seat-box-right">
              <span className="asr-succ-delivery-mode-lbl">Delivery Mode</span>
              <span className="asr-succ-runner-val">In-Seat Runner</span>
            </div>
          </div>
        </section>

        {/* 6. Receipt Details Bento Card */}
        <section className="asr-succ-card asr-succ-receipt-card">
          <div className="asr-succ-receipt-header">
            <div className="asr-succ-receipt-left">
              <span className="asr-succ-receipt-title">Order Receipt</span>
              <span className="asr-succ-order-code">{orderCode}</span>
            </div>
            <span className={`asr-succ-upi-pill ${currentPaymentStatus === 'Paid' ? '' : currentPaymentStatus === 'Failed' ? 'asr-succ-failed-pill' : 'asr-succ-pending-pill'}`}>
              <span className="material-symbols-outlined">
                {currentPaymentStatus === 'Paid' ? 'check' : currentPaymentStatus === 'Failed' ? 'close' : 'pending'}
              </span>
              <span>
                {currentPaymentStatus === 'Paid'
                  ? `Paid via ${orderPaymentMethod}`
                  : currentPaymentStatus === 'Failed'
                  ? 'Payment Failed'
                  : `Payment Pending (${orderPaymentMethod})`}
              </span>
            </span>
          </div>
          <div className="asr-succ-items-list">
            {displayItems.map((item, idx) => (
              <div key={item.id || idx} className="asr-succ-item-row">
                <div className="asr-succ-item-left">
                  <span className="asr-succ-qty-badge">{item.quantity || 1}×</span>
                  <div className="asr-succ-item-details">
                    <span className="asr-succ-item-name">{item.productName}</span>
                    <span className="asr-succ-item-sub">{item.subtitle}</span>
                  </div>
                </div>
                <span className="asr-succ-item-price">₹{item.total}</span>
              </div>
            ))}
          </div>
          <div className="asr-succ-total-box">
            <div className="asr-succ-total-left">
              <span className="asr-succ-total-label">
                {currentPaymentStatus === 'Paid' ? 'Total Amount Paid' : 'Total Order Amount'}
              </span>
              <span className="asr-succ-total-sub">Includes taxes &amp; silent delivery</span>
            </div>
            <span className="asr-succ-total-amount">₹{displayTotal}</span>
          </div>
        </section>

        {/* 7. Action Button */}
        <div className="asr-succ-actions">
          {currentPaymentStatus === 'Failed' ? (
            <button
              type="button"
              className="asr-succ-more-btn asr-retry-pay-btn"
              onClick={() => navigate(`/order/${seatToken}/payment`)}
              style={{ backgroundColor: '#d32f2f', color: '#fff', borderColor: '#d32f2f' }}
            >
              <span className="material-symbols-outlined">refresh</span>
              <span>Retry Payment</span>
            </button>
          ) : (
            <button
              type="button"
              className="asr-succ-more-btn"
              onClick={() => navigate(`/order/${seatToken}/menu`)}
            >
              <span className="material-symbols-outlined">add_circle</span>
              <span>Order More Cinema Snacks</span>
            </button>
          )}
        </div>

        {/* 8. Wholesome Footer */}
        <footer className="asr-succ-footer">
          <p className="asr-succ-footer-msg">Your movie is on. Your food is coming. 🍿🎬</p>
          <p className="asr-succ-footer-sub">Need quick assistance? Wave gently at the aisle steward.</p>
        </footer>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/order/audi2-a01" replace />} />
        <Route path="/order/:seatToken" element={<SeatConfirmationScreen />} />
        <Route path="/order/:seatToken/menu" element={<MenuScreen />} />
        <Route path="/order/:seatToken/product/:productId" element={<ProductScreen />} />
        <Route path="/order/:seatToken/cart" element={<CartScreen />} />
        <Route path="/order/:seatToken/payment" element={<PaymentScreen />} />
        <Route path="/order/:seatToken/success" element={<SuccessScreen />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
