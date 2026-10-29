const mongoose = require('mongoose');
const Product = require('../models/Product');
const { store } = require('../data/memoryStore');

/**
 * Atomically validate and deduct stock for a list of order items.
 *
 * Concurrency & Safety Guarantees:
 * - Uses atomic findOneAndUpdate with { stock: { $gte: quantity }, isAvailable: true, inStock: true }
 *   to ensure concurrent orders cannot oversell remaining inventory.
 * - Multi-item rollback: If any item in the order fails to deduct, all previously
 *   deducted items in that order are automatically restored.
 * - If stock drops to 0, inStock is automatically set to false.
 * - Dual execution: Supports MongoDB when connected and memoryStore fallback in development.
 *
 * @param {Array} items - List of validated items (each with id/productId and quantity)
 * @returns {Promise<{ success: boolean, deductedItems?: Array, error?: string }>}
 */
async function validateAndDeductStock(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: true, deductedItems: [] };
  }

  const deductedItems = [];

  for (const item of items) {
    const quantity = Number(item.quantity) || 1;
    const searchKey = String(item.productId || item.id || item.slug || item.name || '').trim();

    if (mongoose.connection.readyState === 1) {
      try {
        const query = {
          $or: [
            { id: searchKey },
            { slug: searchKey },
            { aliases: searchKey.toLowerCase() },
            ...(mongoose.isValidObjectId(searchKey) ? [{ _id: searchKey }] : []),
          ],
          isAvailable: true,
          inStock: true,
          stock: { $gte: quantity },
        };

        const updatedDoc = await Product.findOneAndUpdate(
          query,
          { $inc: { stock: -quantity } },
          { new: true }
        );

        if (!updatedDoc) {
          // Stock deduction failed for this item: check reason to return informative message
          const existingDoc = await Product.findOne({
            $or: [
              { id: searchKey },
              { slug: searchKey },
              { aliases: searchKey.toLowerCase() },
              ...(mongoose.isValidObjectId(searchKey) ? [{ _id: searchKey }] : []),
            ],
          }).lean();

          // Roll back any previously deducted items in this order
          await rollbackDeductions(deductedItems);

          if (!existingDoc) {
            return {
              success: false,
              error: `Product '${item.name || searchKey}' could not be found in cinema inventory.`,
            };
          }

          if (existingDoc.isAvailable === false || existingDoc.inStock === false) {
            return {
              success: false,
              error: `Product '${existingDoc.name}' is currently unavailable or out of stock.`,
            };
          }

          return {
            success: false,
            error: `Insufficient stock for product '${existingDoc.name}'. Requested ${quantity}, but only ${existingDoc.stock} available.`,
          };
        }

        // If stock reached 0, update inStock to false
        if (updatedDoc.stock === 0) {
          await Product.updateOne({ _id: updatedDoc._id }, { $set: { inStock: false } });
        }

        deductedItems.push({
          productId: updatedDoc.id,
          name: updatedDoc.name,
          quantity,
        });
      } catch (dbErr) {
        // Roll back on DB error
        await rollbackDeductions(deductedItems);
        throw dbErr;
      }
    } else {
      // Memory Store fallback (local dev or isolated test)
      const target = searchKey.toLowerCase();
      const memProd = (store.products || []).find(
        (p) =>
          (p.id && p.id.toLowerCase() === target) ||
          (p.slug && p.slug.toLowerCase() === target) ||
          (p.name && p.name.toLowerCase() === target) ||
          (p._id && p._id.toLowerCase() === target)
      );

      if (!memProd) {
        await rollbackDeductions(deductedItems);
        return {
          success: false,
          error: `Product '${item.name || searchKey}' could not be found in cinema inventory.`,
        };
      }

      if (memProd.isAvailable === false || memProd.inStock === false) {
        await rollbackDeductions(deductedItems);
        return {
          success: false,
          error: `Product '${memProd.name}' is currently unavailable or out of stock.`,
        };
      }

      const currentStock = memProd.stock !== undefined ? memProd.stock : 100;
      if (currentStock < quantity) {
        await rollbackDeductions(deductedItems);
        return {
          success: false,
          error: `Insufficient stock for product '${memProd.name}'. Requested ${quantity}, but only ${currentStock} available.`,
        };
      }

      memProd.stock = currentStock - quantity;
      if (memProd.stock === 0) {
        memProd.inStock = false;
      }

      deductedItems.push({
        productId: memProd.id || memProd.slug || memProd._id,
        name: memProd.name,
        quantity,
      });
    }
  }

  return { success: true, deductedItems };
}

/**
 * Roll back a list of previously deducted stock items.
 *
 * @param {Array} deductedItems - [{ productId, quantity }]
 */
async function rollbackDeductions(deductedItems = []) {
  if (!Array.isArray(deductedItems) || deductedItems.length === 0) return;

  for (const item of deductedItems) {
    const quantity = Number(item.quantity) || 1;
    const searchKey = String(item.productId || item.id || '').trim();

    if (mongoose.connection.readyState === 1) {
      try {
        await Product.updateOne(
          {
            $or: [
              { id: searchKey },
              { slug: searchKey },
              ...(mongoose.isValidObjectId(searchKey) ? [{ _id: searchKey }] : []),
            ],
          },
          {
            $inc: { stock: quantity },
            $set: { inStock: true },
          }
        );
      } catch (err) {
        console.error(`Failed to rollback stock for product ${searchKey}:`, err.message);
      }
    } else {
      const target = searchKey.toLowerCase();
      const memProd = (store.products || []).find(
        (p) =>
          (p.id && p.id.toLowerCase() === target) ||
          (p.slug && p.slug.toLowerCase() === target) ||
          (p._id && p._id.toLowerCase() === target)
      );
      if (memProd) {
        memProd.stock = (memProd.stock || 0) + quantity;
        memProd.inStock = true;
      }
    }
  }
}

/**
 * Restore stock for cancelled or failed orders.
 *
 * @param {Array} items - Order items to restore
 * @returns {Promise<boolean>}
 */
async function restoreStock(items = []) {
  if (!Array.isArray(items) || items.length === 0) return true;

  const toRestore = items.map((it) => ({
    productId: it.productId || it.id || it.slug,
    quantity: Number(it.quantity) || 1,
  }));

  await rollbackDeductions(toRestore);
  return true;
}

module.exports = {
  validateAndDeductStock,
  rollbackDeductions,
  restoreStock,
};
