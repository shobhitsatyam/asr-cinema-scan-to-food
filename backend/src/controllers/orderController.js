const crypto = require('crypto');
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Seat = require('../models/Seat');
const Product = require('../models/Product');
const { store } = require('../data/memoryStore');
const { validateAndCalculateItem } = require('../data/catalog');
const { validateAndDeductStock, rollbackDeductions, restoreStock } = require('../services/inventoryService');
const env = require('../config/env');

const VALID_STATUSES = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Served', 'Completed', 'Cancelled'];
const STATUS_ORDER = ['Pending', 'Accepted', 'Preparing', 'Ready', 'Served', 'Completed'];

/**
 * Format current time into human-readable 12-hour format e.g. "04:02 PM"
 */
function formatTime(date = new Date()) {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Generate a unique human-readable Order ID like #ASR123456
 */
async function generateUniqueOrderId() {
  let orderId;
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 20) {
    attempts += 1;
    const randomNum = Math.floor(100000 + Math.random() * 900000);
    orderId = `#ASR${randomNum}`;

    // Check memoryStore
    const existsInMemory = store.orders.some((o) => o.id === orderId);
    if (existsInMemory) continue;

    // Check MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      try {
        const doc = await Order.findOne({ id: orderId }).select('_id').lean();
        if (doc) continue;
      } catch {
        // Fallback to memory check
      }
    }

    exists = false;
  }

  return orderId || `#ASR${Date.now().toString().slice(-6)}`;
}

/**
 * Build initial timeline with current Pending status completed
 */
function createInitialTimeline(timeStr, auditorium, seat) {
  return [
    {
      status: 'Pending',
      time: timeStr,
      note: 'Order placed via Seat QR scan (Payment Pending)',
      completed: true,
    },
    {
      status: 'Accepted',
      time: '',
      note: 'Awaiting manager / kitchen acknowledgement',
      completed: false,
    },
    {
      status: 'Preparing',
      time: '',
      note: 'Kitchen prep started',
      completed: false,
    },
    {
      status: 'Ready',
      time: '',
      note: 'Packed & ready at dispatch counter',
      completed: false,
    },
    {
      status: 'Served',
      time: '',
      note: `Runner dispatched to ${auditorium} • Seat ${seat}`,
      completed: false,
    },
    {
      status: 'Completed',
      time: '',
      note: 'Delivery confirmed by patron',
      completed: false,
    },
  ];
}

/**
 * Update timeline entries when status moves
 */
function updateTimelineStatuses(timeline = [], newStatus, timeStr) {
  const plainTimeline = Array.isArray(timeline)
    ? timeline.map((entry) => (entry.toObject ? entry.toObject() : {
        status: entry.status,
        time: entry.time || '',
        note: entry.note || '',
        completed: Boolean(entry.completed),
      }))
    : [];

  if (newStatus === 'Cancelled') {
    const cancelIdx = plainTimeline.findIndex((e) => e.status === 'Cancelled');
    if (cancelIdx >= 0) {
      plainTimeline[cancelIdx].completed = true;
      plainTimeline[cancelIdx].time = timeStr;
    } else {
      plainTimeline.push({
        status: 'Cancelled',
        time: timeStr,
        note: 'Order cancelled',
        completed: true,
      });
    }
    return plainTimeline;
  }

  const targetIdx = STATUS_ORDER.indexOf(newStatus);
  if (targetIdx >= 0) {
    plainTimeline.forEach((entry) => {
      const entryIdx = STATUS_ORDER.indexOf(entry.status);
      if (entryIdx === -1) return;

      if (entryIdx <= targetIdx) {
        entry.completed = true;
        if (!entry.time) {
          entry.time = timeStr;
        }
      } else {
        entry.completed = false;
        entry.time = '';
      }
    });

    const exists = plainTimeline.some((e) => e.status === newStatus);
    if (!exists) {
      plainTimeline.push({
        status: newStatus,
        time: timeStr,
        note: `Status updated to ${newStatus}`,
        completed: true,
      });
    }
  }

  return plainTimeline;
}

/**
 * POST /api/orders
 * Create an order from customer frontend or demo script
 */
const createOrder = async (req, res) => {
  let deductedItemsForRollback = [];
  let savedOrder = null;
  try {
    const {
      seatToken,
      items,
      subtotal,
      taxes,
      deliveryFee,
      discount,
      total,
      paymentMethod,
      customer,
      specialInstructions,
    } = req.body;

    // 0. Idempotency Check
    const headers = req.headers || {};
    const idempotencyKey = String(
      headers['idempotency-key'] ||
      headers['Idempotency-Key'] ||
      req.body?.idempotencyKey ||
      req.body?.clientOrderId ||
      ''
    ).trim();

    if (idempotencyKey) {
      if (mongoose.connection.readyState === 1) {
        try {
          const existingOrder = await Order.findOne({ idempotencyKey }).lean();
          if (existingOrder) {
            return res.status(200).json({
              success: true,
              order: existingOrder,
              trackingToken: existingOrder.trackingToken || '',
              isDuplicate: true,
            });
          }
        } catch (err) {
          console.warn('Idempotency lookup failed in database:', err.message);
        }
      } else {
        const existingMem = store.orders.find((o) => o.idempotencyKey === idempotencyKey);
        if (existingMem) {
          return res.status(200).json({
            success: true,
            order: existingMem,
            trackingToken: existingMem.trackingToken || '',
            isDuplicate: true,
          });
        }
      }
    }

    // 1. Customer Details Validation (Required name and 10-digit Indian mobile number)
    const customerName = String(customer?.name || '').trim();
    const rawCustomerPhone = String(customer?.phone || '').trim();

    if (!customerName || customerName.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Customer name is required and must be at least 2 characters.',
      });
    }

    const digitsOnly = rawCustomerPhone.replace(/\D/g, '');
    let normalizedPhone = digitsOnly;
    if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
      normalizedPhone = digitsOnly.slice(2);
    } else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
      normalizedPhone = digitsOnly.slice(1);
    }

    if (!/^[6-9]\d{9}$/.test(normalizedPhone)) {
      return res.status(400).json({
        success: false,
        message: 'A valid 10-digit Indian mobile number (starting with 6-9) is required.',
      });
    }

    // 2. Basic Items Validation
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must contain at least one item.',
      });
    }

    // 3. Authoritative Server-Side Seat Resolution (Client-supplied auditorium/seat strings are NOT trusted)
    let auditorium = '';
    let seat = '';

    if (!seatToken) {
      if (env.nodeEnv === 'production') {
        return res.status(400).json({
          success: false,
          message: 'Seat token is required. Please scan a valid seat QR code.',
        });
      }
      // Safe development/test fallback when seatToken is omitted in mock test payloads
      auditorium = 'Audi 2';
      seat = 'B16';
    } else {
      const normalizedSeatToken = seatToken.trim().toLowerCase();

      // Query MongoDB if connected
      if (mongoose.connection.readyState === 1) {
        try {
          const seatDoc = await Seat.findOne({
            token: normalizedSeatToken,
          }).lean();

          if (seatDoc) {
            if (seatDoc.status !== 'active') {
              return res.status(400).json({
                success: false,
                message: `Seat ${seatDoc.seatNumber} in ${seatDoc.auditoriumName} is currently inactive. Orders cannot be placed for this seat.`,
              });
            }
            auditorium = seatDoc.auditoriumName;
            seat = seatDoc.seatNumber;
          }
        } catch (dbSeatErr) {
          console.warn('Seat query in database failed:', dbSeatErr.message);
          if (env.nodeEnv === 'production') {
            return res.status(503).json({
              success: false,
              message: 'Database service is currently unavailable. Seat verification failed.',
            });
          }
        }
      } else if (env.nodeEnv === 'production') {
        return res.status(503).json({
          success: false,
          message: 'Database service is currently unavailable. Seat verification failed.',
        });
      }

      // Check transition demo seat or dev memory store fallback
      if (!auditorium || !seat) {
        if (env.nodeEnv !== 'production') {
          if (normalizedSeatToken === 'audi2-b16') {
            auditorium = 'Audi 2';
            seat = 'B16';
          } else {
            const matchedSeat = store.seats.find((s) => s.token === normalizedSeatToken);
            if (matchedSeat) {
              if (matchedSeat.status !== 'active') {
                return res.status(400).json({
                  success: false,
                  message: `Seat ${matchedSeat.seatNumber} in ${matchedSeat.auditoriumName} is currently inactive.`,
                });
              }
              auditorium = matchedSeat.auditoriumName;
              seat = matchedSeat.seatNumber;
            }
          }
        }
      }

      // If seat could not be resolved from authoritative records:
      if (!auditorium || !seat) {
        return res.status(400).json({
          success: false,
          message: `Seat token '${seatToken}' could not be verified. Please scan a valid seat QR code.`,
        });
      }
    }

    // 3. Authoritative Server-Side Item & Price Validation
    const validatedItems = [];
    let authoritativeSubtotal = 0;

    for (const rawItem of items) {
      let dbProduct = null;
      if (mongoose.connection.readyState === 1) {
        try {
          const searchKey =
            rawItem.productId ||
            rawItem.id ||
            rawItem.slug ||
            rawItem.productName ||
            rawItem.name;
          const cleanSearch = String(searchKey || '').trim();

          dbProduct = await Product.findOne({
            $or: [
              { id: cleanSearch },
              { slug: cleanSearch },
              { aliases: cleanSearch.toLowerCase() },
              { name: new RegExp(`^${cleanSearch}$`, 'i') },
              ...(mongoose.isValidObjectId(cleanSearch) ? [{ _id: cleanSearch }] : []),
            ],
          }).lean();
        } catch (dbProdErr) {
          console.warn('MongoDB product lookup failed:', dbProdErr.message);
        }
      }

      const result = validateAndCalculateItem(rawItem, dbProduct);
      if (!result.valid) {
        return res.status(400).json({
          success: false,
          message: result.error,
        });
      }
      validatedItems.push(result.normalizedItem);
      authoritativeSubtotal += result.normalizedItem.total;
    }

    // 4. Financial Calculations (Authoritative - client prices and totals are NOT trusted)
    const authoritativeTaxes = 0; // Cinema menu prices are tax-inclusive
    const authoritativeDeliveryFee = 0; // Silent in-seat delivery is free of charge
    const authoritativeDiscount = 0;
    const authoritativeTotal = authoritativeSubtotal + authoritativeTaxes + authoritativeDeliveryFee - authoritativeDiscount;

    // 5. Timestamps & Time strings
    const now = new Date();
    const timeStr = formatTime(now);

    // 6. Generate Human-Readable Order ID & Secure Tracking Token
    const orderId = await generateUniqueOrderId();
    const trackingToken = crypto.randomUUID();

    // 7. Atomic Inventory Deduction & Concurrency Overselling Protection
    const stockDeduction = await validateAndDeductStock(validatedItems);
    if (!stockDeduction.success) {
      return res.status(400).json({
        success: false,
        message: stockDeduction.error,
      });
    }
    deductedItemsForRollback = stockDeduction.deductedItems || [];

    // 8. Assemble Order Object
    const orderPayload = {
      id: orderId,
      trackingToken,
      auditorium,
      seat,
      customer: {
        name: customerName,
        phone: normalizedPhone,
        email: customer?.email?.trim() || '',
      },
      items: validatedItems,
      subtotal: authoritativeSubtotal,
      taxes: authoritativeTaxes,
      deliveryFee: authoritativeDeliveryFee,
      discount: authoritativeDiscount,
      total: authoritativeTotal,
      paymentStatus: 'Pending', // Orders start in Pending until verified by payment provider
      paymentMethod: paymentMethod || 'UPI',
      status: 'Pending',
      createdAt: now,
      time: timeStr,
      timeline: createInitialTimeline(timeStr, auditorium, seat),
      specialInstructions: specialInstructions || '',
      stockDeducted: true,
      stockRestored: false,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    };

    // 9. MongoDB Persistence & Production Fail-Closed Behavior
    if (mongoose.connection.readyState === 1) {
      try {
        const orderDoc = new Order(orderPayload);
        const result = await orderDoc.save();
        savedOrder = result.toObject();
      } catch (dbErr) {
        console.error('MongoDB save failed:', dbErr.message);
        // Roll back deducted stock if order could not be persisted
        await restoreStock(validatedItems);
        if (env.nodeEnv === 'production') {
          return res.status(500).json({
            success: false,
            message: 'Failed to persist order to database. Order was not accepted.',
          });
        }
      }
    } else if (env.nodeEnv === 'production') {
      await restoreStock(validatedItems);
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable. Order could not be placed.',
      });
    } else {
      console.warn('Development demo fallback: MongoDB unavailable. Saving order to ephemeral memoryStore.');
    }

    // Fail closed in production if order could not be saved to MongoDB
    if (!savedOrder && env.nodeEnv === 'production') {
      await restoreStock(validatedItems);
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable. Order could not be placed.',
      });
    }

    // 10. Memory Store Mirror (or Dev Fallback)
    const orderToStore = savedOrder || orderPayload;
    store.orders.unshift(orderToStore);

    return res.status(201).json({
      success: true,
      order: orderToStore,
      trackingToken: orderToStore.trackingToken || trackingToken,
    });
  } catch (error) {
    console.error('Error creating order:', error);
    if (deductedItemsForRollback.length > 0 && !savedOrder) {
      try {
        await rollbackDeductions(deductedItemsForRollback);
      } catch (rollbackErr) {
        console.error('Failed to rollback stock during error handling:', rollbackErr.message);
      }
    }
    return res.status(500).json({
      success: false,
      message: 'Failed to create order. Please try again.',
    });
  }
};

/**
 * GET /api/orders
 * Return all orders sorted newest first
 */
const getOrders = async (req, res) => {
  try {
    const query = req.query || {};
    // Operational safety requirement:
    // Only verified Paid orders are returned for operational feeds (kitchen queue & admin dashboard).
    // Audit access to all orders requires explicit query ?all=true or specific ?paymentStatus=.
    const isOperationalOnly = query.all !== 'true';
    const paymentStatusFilter = query.paymentStatus || (isOperationalOnly ? 'Paid' : undefined);
    const filter = paymentStatusFilter ? { paymentStatus: paymentStatusFilter } : {};

    if (mongoose.connection.readyState === 1) {
      try {
        const dbOrders = await Order.find(filter)
          .sort({ createdAt: -1 })
          .select('-trackingToken -customer.phone')
          .lean();
        return res.json({
          success: true,
          orders: dbOrders || [],
        });
      } catch (dbErr) {
        console.error('MongoDB query failed:', dbErr.message);
        if (env.nodeEnv === 'production') {
          return res.status(500).json({
            success: false,
            message: 'Failed to retrieve orders from database.',
            orders: [],
          });
        }
        console.warn('MongoDB query failed, falling back to memoryStore in development:', dbErr.message);
      }
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable.',
        orders: [],
      });
    }

    // Fallback: In-memory store sorted newest first (filtered by paymentStatus & privacy redacted)
    let memoryOrders = [...(store.orders || [])];
    if (paymentStatusFilter) {
      memoryOrders = memoryOrders.filter((o) => o.paymentStatus === paymentStatusFilter);
    }

    const sanitizedOrders = memoryOrders
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((o) => {
        const copy = { ...o };
        delete copy.trackingToken;
        if (copy.customer) {
          copy.customer = {
            name: copy.customer.name || 'Cinema Guest',
            email: copy.customer.email || '',
          };
        }
        return copy;
      });

    return res.json({
      success: true,
      orders: sanitizedOrders,
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve orders.',
      orders: [],
    });
  }
};

/**
 * PATCH /api/orders/:id/status
 * Update order status and advance timeline
 */
const updateOrderStatus = async (req, res) => {
  try {
    const rawId = req.params.id;
    const { status } = req.body;

    if (!rawId) {
      return res.status(400).json({
        success: false,
        message: 'Order ID is required.',
      });
    }

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status '${status}'. Allowed statuses: ${VALID_STATUSES.join(', ')}`,
      });
    }

    const timeStr = formatTime(new Date());

    // Normalize IDs to match both '#ASR123' and 'ASR123'
    const idWithHash = rawId.startsWith('#') ? rawId : `#${rawId}`;
    const idWithoutHash = rawId.replace(/^#/, '');

    let updatedOrder = null;

    // 1. Try MongoDB Update
    if (mongoose.connection.readyState === 1) {
      try {
        const query = {
          $or: [
            { id: rawId },
            { id: idWithHash },
            { id: idWithoutHash },
            ...(mongoose.isValidObjectId(rawId) ? [{ _id: rawId }] : []),
          ],
        };

        const doc = await Order.findOne(query);
        if (doc) {
          if (doc.status === 'Cancelled' && status !== 'Cancelled') {
            return res.status(400).json({
              success: false,
              message: `Cannot update order '${rawId}'. Order is cancelled and cannot be transitioned to '${status}'.`,
            });
          }

          const KITCHEN_RELEASE_STATUSES = ['Accepted', 'Preparing', 'Ready', 'Served', 'Completed'];
          if (KITCHEN_RELEASE_STATUSES.includes(status) && doc.paymentStatus !== 'Paid') {
            return res.status(400).json({
              success: false,
              message: `Cannot advance order to '${status}'. Unpaid or unverified orders cannot be released for kitchen preparation (current paymentStatus: '${doc.paymentStatus}').`,
            });
          }

          if (status === 'Cancelled' && !doc.stockRestored) {
            await restoreStock(doc.items);
            doc.stockRestored = true;
          }

          doc.status = status;
          doc.timeline = updateTimelineStatuses(doc.timeline, status, timeStr);
          doc.markModified('timeline');
          await doc.save();
          updatedOrder = doc.toObject();

          // Sync memoryStore
          const memIdx = store.orders.findIndex(
            (o) => o.id === doc.id || o.id === idWithHash || o.id === idWithoutHash
          );
          if (memIdx >= 0) {
            store.orders[memIdx] = updatedOrder;
          }
        }
      } catch (dbErr) {
        console.error('MongoDB update status failed:', dbErr.message);
        if (env.nodeEnv === 'production') {
          return res.status(500).json({
            success: false,
            message: 'Failed to update order status in database.',
          });
        }
      }
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable. Order status could not be updated.',
      });
    }

    // 2. Memory Store Update (Dev only if DB not connected or doc not found in DB)
    if (!updatedOrder) {
      if (env.nodeEnv === 'production') {
        return res.status(404).json({
          success: false,
          message: `Order '${rawId}' not found.`,
        });
      }

      const memOrder = store.orders.find(
        (o) => o.id === rawId || o.id === idWithHash || o.id === idWithoutHash || String(o._id) === rawId
      );

      if (!memOrder) {
        return res.status(404).json({
          success: false,
          message: `Order '${rawId}' not found.`,
        });
      }

      if (memOrder.status === 'Cancelled' && status !== 'Cancelled') {
        return res.status(400).json({
          success: false,
          message: `Cannot update order '${rawId}'. Order is cancelled and cannot be transitioned to '${status}'.`,
        });
      }

      const KITCHEN_RELEASE_STATUSES = ['Accepted', 'Preparing', 'Ready', 'Served', 'Completed'];
      if (KITCHEN_RELEASE_STATUSES.includes(status) && memOrder.paymentStatus !== 'Paid') {
        return res.status(400).json({
          success: false,
          message: `Cannot advance order to '${status}'. Unpaid or unverified orders cannot be released for kitchen preparation (current paymentStatus: '${memOrder.paymentStatus}').`,
        });
      }

      if (status === 'Cancelled' && !memOrder.stockRestored) {
        await restoreStock(memOrder.items);
        memOrder.stockRestored = true;
      }

      memOrder.status = status;
      memOrder.timeline = updateTimelineStatuses(memOrder.timeline, status, timeStr);
      updatedOrder = memOrder;
    }

    return res.json({
      success: true,
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order status.',
    });
  }
};

/**
 * GET /api/orders/:id/track
 * Secure tracking endpoint for customer frontend.
 * Requires matching tracking token. Redacts sensitive customer data (e.g. phone number).
 */
const getOrderTracking = async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!rawId) {
      return res.status(400).json({ success: false, message: 'Order ID is required.' });
    }

    const authHeader = req.headers.authorization || req.headers.Authorization || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const token = String(
      req.headers['x-tracking-token'] ||
      bearerToken ||
      req.query.token ||
      ''
    ).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Tracking authorization token is required to view order status.',
      });
    }

    const idWithHash = rawId.startsWith('#') ? rawId : `#${rawId}`;
    const idWithoutHash = rawId.replace(/^#/, '');

    let orderDoc = null;

    if (mongoose.connection.readyState === 1) {
      try {
        orderDoc = await Order.findOne({
          $or: [
            { id: rawId },
            { id: idWithHash },
            { id: idWithoutHash },
            ...(mongoose.isValidObjectId(rawId) ? [{ _id: rawId }] : []),
          ],
        }).select('+trackingToken').lean();
      } catch (dbErr) {
        console.error('Database query error in getOrderTracking:', dbErr.message);
        if (env.nodeEnv === 'production') {
          return res.status(503).json({
            success: false,
            message: 'Database service is currently unavailable.',
          });
        }
      }
    } else if (env.nodeEnv === 'production') {
      return res.status(503).json({
        success: false,
        message: 'Database service is currently unavailable.',
      });
    }

    if (!orderDoc) {
      orderDoc = store.orders.find(
        (o) => o.id === rawId || o.id === idWithHash || o.id === idWithoutHash || String(o._id) === rawId
      );
    }

    if (!orderDoc) {
      return res.status(404).json({
        success: false,
        message: `Order '${rawId}' not found.`,
      });
    }

    // Secure Token Verification:
    // Every trackable order must have a valid trackingToken, and the client token must match exactly.
    if (!orderDoc.trackingToken || orderDoc.trackingToken !== token) {
      return res.status(403).json({
        success: false,
        message: 'Invalid tracking token. Access denied.',
      });
    }

    // Redact phone number and sensitive gateway parameters before responding
    const safeCustomer = {
      name: orderDoc.customer?.name || 'Cinema Guest',
    };

    return res.json({
      success: true,
      order: {
        id: orderDoc.id,
        auditorium: orderDoc.auditorium,
        seat: orderDoc.seat,
        status: orderDoc.status,
        paymentStatus: orderDoc.paymentStatus,
        paymentMethod: orderDoc.paymentMethod,
        items: (orderDoc.items || []).map((it) => ({
          id: it.id,
          name: it.name || it.productName,
          productName: it.productName || it.name,
          variant: it.variant || null,
          addOns: it.addOns || [],
          quantity: it.quantity,
          price: it.price,
          total: it.total,
          type: it.type,
        })),
        subtotal: orderDoc.subtotal,
        taxes: orderDoc.taxes || 0,
        deliveryFee: orderDoc.deliveryFee || 0,
        discount: orderDoc.discount || 0,
        total: orderDoc.total,
        createdAt: orderDoc.createdAt,
        time: orderDoc.time,
        timeline: orderDoc.timeline || [],
        customer: safeCustomer,
      },
    });
  } catch (error) {
    console.error('Error in getOrderTracking:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve order tracking details.',
    });
  }
};

module.exports = {
  createOrder,
  getOrders,
  updateOrderStatus,
  getOrderTracking,
};
