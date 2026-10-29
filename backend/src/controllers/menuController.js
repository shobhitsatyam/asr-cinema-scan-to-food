const mongoose = require('mongoose');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const { store } = require('../data/memoryStore');
const env = require('../config/env');

/**
 * GET /api/categories
 * Return all active categories
 */
const getCategories = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      try {
        const dbCategories = await Category.find({ isActive: true })
          .sort({ sortOrder: 1, name: 1 })
          .lean();

        // Always return database query results when connected, even if empty array
        return res.json({
          success: true,
          categories: dbCategories || [],
        });
      } catch (err) {
        console.error('Error fetching categories from database:', err.message);
        return res.status(503).json({
          success: false,
          message: 'Database service is currently unavailable.',
          categories: [],
        });
      }
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable.',
        categories: [],
      });
    }

    // Development demo fallback (only when MongoDB is disconnected in non-production)
    return res.json({
      success: true,
      categories: store.categories || [],
    });
  } catch (error) {
    console.error('Error in getCategories:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve categories.',
      categories: [],
    });
  }
};

/**
 * GET /api/products
 * Return products from MongoDB with optional category or availability filter
 */
const getProducts = async (req, res) => {
  try {
    const { category, availableOnly } = req.query;

    if (mongoose.connection.readyState === 1) {
      try {
        const query = {};
        if (category && category !== 'All') {
          query.category = new RegExp(`^${category.trim()}$`, 'i');
        }
        if (availableOnly === 'true') {
          query.isAvailable = true;
          query.inStock = true;
        }

        const dbProducts = await Product.find(query)
          .sort({ sortOrder: 1, name: 1 })
          .lean();

        // Always return database query results when connected, even if empty array
        return res.json({
          success: true,
          products: dbProducts || [],
        });
      } catch (err) {
        console.error('Error fetching products from database:', err.message);
        return res.status(503).json({
          success: false,
          message: 'Database service is currently unavailable.',
          products: [],
        });
      }
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable.',
        products: [],
      });
    }

    // Development demo fallback (only when MongoDB is disconnected in non-production)
    let fallbackProducts = store.products || [];
    if (category && category !== 'All') {
      const catLower = category.trim().toLowerCase();
      fallbackProducts = fallbackProducts.filter(
        (p) => (p.category || '').toLowerCase() === catLower
      );
    }
    if (availableOnly === 'true') {
      fallbackProducts = fallbackProducts.filter(
        (p) => p.isAvailable !== false && p.inStock !== false
      );
    }

    return res.json({
      success: true,
      products: fallbackProducts,
    });
  } catch (error) {
    console.error('Error in getProducts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve products.',
      products: [],
    });
  }
};

/**
 * GET /api/products/:id
 * Return single product by ID, slug, or MongoDB _id
 */
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Product identifier is required.',
      });
    }

    const cleanId = String(id).trim();

    if (mongoose.connection.readyState === 1) {
      try {
        const query = {
          $or: [
            { id: cleanId },
            { slug: cleanId },
            { aliases: cleanId.toLowerCase() },
            { 'variants.id': cleanId },
            ...(mongoose.isValidObjectId(cleanId) ? [{ _id: cleanId }] : []),
          ],
        };

        const dbProduct = await Product.findOne(query).lean();
        if (dbProduct) {
          return res.json({
            success: true,
            product: dbProduct,
          });
        }

        return res.status(404).json({
          success: false,
          message: `Product '${id}' not found.`,
        });
      } catch (err) {
        console.error('Error fetching product by ID from database:', err.message);
        return res.status(503).json({
          success: false,
          message: 'Database service is currently unavailable.',
        });
      }
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable.',
      });
    }

    // Development demo fallback (only when MongoDB is disconnected in non-production)
    const target = cleanId.toLowerCase();
    const memProduct = (store.products || []).find(
      (p) =>
        (p._id && p._id.toLowerCase() === target) ||
        (p.id && p.id.toLowerCase() === target) ||
        (p.slug && p.slug.toLowerCase() === target) ||
        (p.name && p.name.toLowerCase() === target)
    );

    if (memProduct) {
      return res.json({
        success: true,
        product: memProduct,
      });
    }

    return res.status(404).json({
      success: false,
      message: `Product '${id}' not found.`,
    });
  } catch (error) {
    console.error('Error in getProductById:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve product details.',
    });
  }
};

/**
 * GET /api/menu
 * Return unified categories and products catalog for customer menu
 */
const getMenu = async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      try {
        const [dbCategories, dbProducts] = await Promise.all([
          Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 }).lean(),
          Product.find({ isAvailable: true }).sort({ sortOrder: 1, name: 1 }).lean(),
        ]);

        // Always return database query results when connected, even if empty
        return res.json({
          success: true,
          categories: dbCategories || [],
          products: dbProducts || [],
        });
      } catch (err) {
        console.error('Error fetching unified menu from database:', err.message);
        return res.status(503).json({
          success: false,
          message: 'Database service is currently unavailable. Food menu could not be loaded.',
          categories: [],
          products: [],
        });
      }
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable. Food menu could not be loaded.',
        categories: [],
        products: [],
      });
    }

    // Development demo fallback (only when MongoDB is disconnected in non-production)
    return res.json({
      success: true,
      categories: store.categories || [],
      products: store.products || [],
    });
  } catch (error) {
    console.error('Error in getMenu:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve food menu.',
      categories: [],
      products: [],
    });
  }
};

/**
 * POST /api/products
 * Create a new product in MongoDB (Admin)
 */
const createProduct = async (req, res) => {
  try {
    const {
      name,
      category,
      type,
      price,
      originalPrice,
      description,
      shortDescription,
      image,
      prepTime,
      isAvailable,
      inStock,
      stock,
      variants,
      addOns,
    } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Product name is required.',
      });
    }

    if (!category || typeof category !== 'string' || !category.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Category is required.',
      });
    }

    const parsedPrice = Number(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be a valid non-negative number.',
      });
    }

    const cleanName = name.trim();
    const baseSlug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `prod-${Date.now()}`;
    let uniqueId = req.body.id ? String(req.body.id).trim() : baseSlug;

    if (mongoose.connection.readyState === 1) {
      const existing = await Product.findOne({ id: uniqueId }).lean();
      if (existing) {
        uniqueId = `${baseSlug}-${Date.now()}`;
      }

      const isVeg = type === 'Non-Veg' ? false : (req.body.isVeg !== undefined ? Boolean(req.body.isVeg) : true);

      const productDoc = new Product({
        id: uniqueId,
        name: cleanName,
        slug: uniqueId,
        category: category.trim(),
        type: isVeg ? 'Veg' : 'Non-Veg',
        isVeg,
        price: parsedPrice,
        basePrice: parsedPrice,
        originalPrice: originalPrice ? Number(originalPrice) : parsedPrice,
        description: description?.trim() || '',
        shortDescription: shortDescription?.trim() || '',
        image: image?.trim() || '',
        prepTime: prepTime?.trim() || '10 mins',
        isAvailable: isAvailable !== false,
        inStock: inStock !== false,
        stock: stock !== undefined ? Number(stock) : 100,
        variants: Array.isArray(variants) ? variants : [],
        addOns: Array.isArray(addOns) ? addOns : [],
      });

      const saved = await productDoc.save();
      return res.status(201).json({
        success: true,
        message: 'Product created successfully.',
        product: saved.toObject(),
      });
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable.',
      });
    }

    // Dev fallback
    const devProduct = {
      _id: `prod-${Date.now()}`,
      id: uniqueId,
      name: cleanName,
      category: category.trim(),
      type: type || 'Veg',
      isVeg: type !== 'Non-Veg',
      price: parsedPrice,
      basePrice: parsedPrice,
      originalPrice: originalPrice ? Number(originalPrice) : parsedPrice,
      description: description || '',
      image: image || '',
      prepTime: prepTime || '10 mins',
      isAvailable: isAvailable !== false,
      inStock: inStock !== false,
      variants: Array.isArray(variants) ? variants : [],
      addOns: Array.isArray(addOns) ? addOns : [],
    };
    store.products.push(devProduct);
    return res.status(201).json({
      success: true,
      message: 'Product created in development store.',
      product: devProduct,
    });
  } catch (error) {
    console.error('Error in createProduct:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create product: ' + error.message,
    });
  }
};

/**
 * PATCH /api/products/:id
 * Update an existing product in MongoDB (Admin)
 */
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Product ID is required.' });
    }
    const cleanId = String(id).trim();

    if (mongoose.connection.readyState === 1) {
      const query = {
        $or: [
          { id: cleanId },
          { slug: cleanId },
          ...(mongoose.isValidObjectId(cleanId) ? [{ _id: cleanId }] : []),
        ],
      };

      const product = await Product.findOne(query);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product '${id}' not found.` });
      }

      const updates = req.body;
      if (updates.name !== undefined) product.name = String(updates.name).trim();
      if (updates.category !== undefined) product.category = String(updates.category).trim();
      if (updates.price !== undefined) {
        const p = Number(updates.price);
        if (isNaN(p) || p < 0) return res.status(400).json({ success: false, message: 'Invalid price.' });
        product.price = p;
        if (product.basePrice === undefined || product.basePrice === null) product.basePrice = p;
      }
      if (updates.basePrice !== undefined) product.basePrice = Number(updates.basePrice);
      if (updates.originalPrice !== undefined) product.originalPrice = Number(updates.originalPrice);
      if (updates.type !== undefined) {
        product.type = updates.type === 'Non-Veg' ? 'Non-Veg' : 'Veg';
        product.isVeg = product.type === 'Veg';
      }
      if (updates.isVeg !== undefined) {
        product.isVeg = Boolean(updates.isVeg);
        product.type = product.isVeg ? 'Veg' : 'Non-Veg';
      }
      if (updates.description !== undefined) product.description = String(updates.description);
      if (updates.shortDescription !== undefined) product.shortDescription = String(updates.shortDescription);
      if (updates.image !== undefined) product.image = String(updates.image);
      if (updates.prepTime !== undefined) product.prepTime = String(updates.prepTime);
      if (updates.isAvailable !== undefined) product.isAvailable = Boolean(updates.isAvailable);
      if (updates.inStock !== undefined) product.inStock = Boolean(updates.inStock);
      if (updates.stock !== undefined) product.stock = Number(updates.stock);
      if (Array.isArray(updates.variants)) product.variants = updates.variants;
      if (Array.isArray(updates.addOns)) product.addOns = updates.addOns;

      const updated = await product.save();
      return res.json({
        success: true,
        message: 'Product updated successfully.',
        product: updated.toObject(),
      });
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({ success: false, message: 'Database service is currently unavailable.' });
    }

    // Dev fallback
    const memProduct = (store.products || []).find((p) => p.id === cleanId || p._id === cleanId);
    if (!memProduct) {
      return res.status(404).json({ success: false, message: `Product '${id}' not found.` });
    }
    Object.assign(memProduct, req.body);
    return res.json({ success: true, message: 'Product updated in dev store.', product: memProduct });
  } catch (error) {
    console.error('Error in updateProduct:', error);
    return res.status(500).json({ success: false, message: 'Failed to update product: ' + error.message });
  }
};

/**
 * PATCH /api/products/:id/availability
 * Fast toggle / update availability for a product (Admin)
 */
const toggleProductAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id || '').trim();

    if (mongoose.connection.readyState === 1) {
      const query = {
        $or: [
          { id: cleanId },
          { slug: cleanId },
          ...(mongoose.isValidObjectId(cleanId) ? [{ _id: cleanId }] : []),
        ],
      };

      const product = await Product.findOne(query);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product '${id}' not found.` });
      }

      const nextState = req.body.isAvailable !== undefined
        ? Boolean(req.body.isAvailable)
        : !product.isAvailable;

      product.isAvailable = nextState;
      product.inStock = nextState;
      const updated = await product.save();

      return res.json({
        success: true,
        message: `Product is now ${nextState ? 'Available' : 'Out of Stock'}.`,
        product: updated.toObject(),
        isAvailable: nextState,
      });
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({ success: false, message: 'Database service is currently unavailable.' });
    }

    const memProduct = (store.products || []).find((p) => p.id === cleanId || p._id === cleanId);
    if (!memProduct) {
      return res.status(404).json({ success: false, message: `Product '${id}' not found.` });
    }
    const nextState = req.body.isAvailable !== undefined ? Boolean(req.body.isAvailable) : !memProduct.isAvailable;
    memProduct.isAvailable = nextState;
    memProduct.inStock = nextState;
    return res.json({
      success: true,
      message: `Product is now ${nextState ? 'Available' : 'Out of Stock'}.`,
      product: memProduct,
      isAvailable: nextState,
    });
  } catch (error) {
    console.error('Error in toggleProductAvailability:', error);
    return res.status(500).json({ success: false, message: 'Failed to toggle availability.' });
  }
};

/**
 * DELETE /api/products/:id
 * Delete or safely deactivate a product if referenced in orders (Admin)
 */
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id || '').trim();

    if (mongoose.connection.readyState === 1) {
      const query = {
        $or: [
          { id: cleanId },
          { slug: cleanId },
          ...(mongoose.isValidObjectId(cleanId) ? [{ _id: cleanId }] : []),
        ],
      };

      const product = await Product.findOne(query);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product '${id}' not found.` });
      }

      // Safe Check: is product referenced in existing customer orders?
      const isReferencedInOrders = await Order.exists({
        $or: [
          { 'items.id': product.id },
          { 'items.name': product.name },
          ...(mongoose.isValidObjectId(product._id) ? [{ 'items.id': String(product._id) }] : []),
        ],
      });

      if (isReferencedInOrders) {
        // Safe deactivation / soft delete to preserve historic order integrity
        product.isAvailable = false;
        product.inStock = false;
        await product.save();

        return res.json({
          success: true,
          message: `Product '${product.name}' is referenced in customer order history. It has been safely deactivated (marked Out of Stock) rather than permanently deleted.`,
          deactivated: true,
          product: product.toObject(),
        });
      }

      await Product.deleteOne({ _id: product._id });
      return res.json({
        success: true,
        message: `Product '${product.name}' deleted successfully.`,
        deleted: true,
        id: product.id,
      });
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({ success: false, message: 'Database service is currently unavailable.' });
    }

    const idx = (store.products || []).findIndex((p) => p.id === cleanId || p._id === cleanId);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: `Product '${id}' not found.` });
    }
    const removed = store.products.splice(idx, 1)[0];
    return res.json({
      success: true,
      message: `Product '${removed.name}' removed from dev store.`,
      deleted: true,
    });
  } catch (error) {
    console.error('Error in deleteProduct:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete product: ' + error.message });
  }
};

/**
 * POST /api/categories
 * Create a new category in MongoDB (Admin)
 */
const createCategory = async (req, res) => {
  try {
    const { name, description, iconName, image, sortOrder, isActive } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Category name is required.' });
    }

    const cleanName = name.trim();
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `cat-${Date.now()}`;

    if (mongoose.connection.readyState === 1) {
      const existing = await Category.findOne({ $or: [{ slug }, { name: cleanName }] }).lean();
      if (existing) {
        return res.status(409).json({ success: false, message: `Category '${cleanName}' already exists.` });
      }

      const catDoc = new Category({
        name: cleanName,
        slug,
        description: description?.trim() || '',
        iconName: iconName?.trim() || 'Utensils',
        image: image?.trim() || '',
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
        isActive: isActive !== false,
      });

      const saved = await catDoc.save();
      return res.status(201).json({
        success: true,
        message: 'Category created successfully.',
        category: saved.toObject(),
      });
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({ success: false, message: 'Database service is currently unavailable.' });
    }

    const devCat = {
      _id: `cat-${Date.now()}`,
      name: cleanName,
      slug,
      description: description || '',
      iconName: iconName || 'Utensils',
      image: image || '',
      isActive: isActive !== false,
    };
    store.categories.push(devCat);
    return res.status(201).json({ success: true, category: devCat });
  } catch (error) {
    console.error('Error in createCategory:', error);
    return res.status(500).json({ success: false, message: 'Failed to create category: ' + error.message });
  }
};

/**
 * PATCH /api/categories/:id
 * Update an existing category in MongoDB (Admin)
 */
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id || '').trim();

    if (mongoose.connection.readyState === 1) {
      const query = {
        $or: [
          { slug: cleanId },
          { name: cleanId },
          ...(mongoose.isValidObjectId(cleanId) ? [{ _id: cleanId }] : []),
        ],
      };

      const category = await Category.findOne(query);
      if (!category) {
        return res.status(404).json({ success: false, message: `Category '${id}' not found.` });
      }

      const oldName = category.name;
      if (req.body.name !== undefined) {
        const newName = String(req.body.name).trim();
        category.name = newName;
        category.slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        // If name changed, synchronize category name on products
        if (oldName !== newName) {
          await Product.updateMany({ category: oldName }, { $set: { category: newName } });
        }
      }
      if (req.body.description !== undefined) category.description = String(req.body.description);
      if (req.body.iconName !== undefined) category.iconName = String(req.body.iconName);
      if (req.body.image !== undefined) category.image = String(req.body.image);
      if (req.body.sortOrder !== undefined) category.sortOrder = Number(req.body.sortOrder);
      if (req.body.isActive !== undefined) category.isActive = Boolean(req.body.isActive);

      const updated = await category.save();
      return res.json({
        success: true,
        message: 'Category updated successfully.',
        category: updated.toObject(),
      });
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({ success: false, message: 'Database service is currently unavailable.' });
    }

    const memCat = (store.categories || []).find((c) => c.slug === cleanId || c._id === cleanId || c.name === cleanId);
    if (!memCat) {
      return res.status(404).json({ success: false, message: `Category '${id}' not found.` });
    }
    Object.assign(memCat, req.body);
    return res.json({ success: true, category: memCat });
  } catch (error) {
    console.error('Error in updateCategory:', error);
    return res.status(500).json({ success: false, message: 'Failed to update category: ' + error.message });
  }
};

/**
 * PATCH /api/categories/:id/status
 * Toggle category active status (Admin)
 */
const toggleCategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id || '').trim();

    if (mongoose.connection.readyState === 1) {
      const query = {
        $or: [
          { slug: cleanId },
          { name: cleanId },
          ...(mongoose.isValidObjectId(cleanId) ? [{ _id: cleanId }] : []),
        ],
      };

      const category = await Category.findOne(query);
      if (!category) {
        return res.status(404).json({ success: false, message: `Category '${id}' not found.` });
      }

      category.isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : !category.isActive;
      const updated = await category.save();

      return res.json({
        success: true,
        message: `Category is now ${updated.isActive ? 'Active' : 'Inactive'}.`,
        category: updated.toObject(),
        isActive: updated.isActive,
      });
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({ success: false, message: 'Database service is currently unavailable.' });
    }

    const memCat = (store.categories || []).find((c) => c.slug === cleanId || c._id === cleanId);
    if (!memCat) {
      return res.status(404).json({ success: false, message: `Category '${id}' not found.` });
    }
    memCat.isActive = !memCat.isActive;
    return res.json({ success: true, category: memCat, isActive: memCat.isActive });
  } catch (error) {
    console.error('Error in toggleCategoryStatus:', error);
    return res.status(500).json({ success: false, message: 'Failed to toggle category status.' });
  }
};

/**
 * DELETE /api/categories/:id
 * Delete or safely deactivate a category if it contains products (Admin)
 */
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = String(id || '').trim();

    if (mongoose.connection.readyState === 1) {
      const query = {
        $or: [
          { slug: cleanId },
          { name: cleanId },
          ...(mongoose.isValidObjectId(cleanId) ? [{ _id: cleanId }] : []),
        ],
      };

      const category = await Category.findOne(query);
      if (!category) {
        return res.status(404).json({ success: false, message: `Category '${id}' not found.` });
      }

      // Check if products exist in this category or if referenced in existing orders
      const [productCount, isReferencedInOrders] = await Promise.all([
        Product.countDocuments({
          $or: [{ category: category.name }, { categoryId: category.slug }],
        }),
        Order.exists({
          $or: [
            { 'items.category': category.name },
            { 'items.category': category.slug },
          ],
        }),
      ]);

      if (productCount > 0 || isReferencedInOrders) {
        // Safe deactivation rather than leaving orphaned products or corrupting order history
        category.isActive = false;
        await category.save();

        return res.json({
          success: true,
          message: `Category '${category.name}' is referenced in catalog products or order history. It has been safely deactivated rather than deleted.`,
          deactivated: true,
          category: category.toObject(),
        });
      }

      await Category.deleteOne({ _id: category._id });
      return res.json({
        success: true,
        message: `Category '${category.name}' deleted successfully.`,
        deleted: true,
      });
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({ success: false, message: 'Database service is currently unavailable.' });
    }

    const idx = (store.categories || []).findIndex((c) => c.slug === cleanId || c._id === cleanId);
    if (idx === -1) {
      return res.status(404).json({ success: false, message: `Category '${id}' not found.` });
    }
    const removed = store.categories.splice(idx, 1)[0];
    return res.json({ success: true, message: `Category '${removed.name}' removed from dev store.`, deleted: true });
  } catch (error) {
    console.error('Error in deleteCategory:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete category: ' + error.message });
  }
};

module.exports = {
  getCategories,
  getProducts,
  getProductById,
  getMenu,
  createProduct,
  updateProduct,
  toggleProductAvailability,
  deleteProduct,
  createCategory,
  updateCategory,
  toggleCategoryStatus,
  deleteCategory,
};
