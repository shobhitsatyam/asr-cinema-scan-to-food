const mongoose = require('mongoose');
const Order = require('../models/Order');
const { store } = require('../data/memoryStore');

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
      note: 'Order placed successfully via Seat QR scan',
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

    // 1. Validation
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Order must contain at least one item.',
      });
    }

    if (total !== undefined && isNaN(Number(total))) {
      return res.status(400).json({
        success: false,
        message: 'Total must be a valid number.',
      });
    }

    // 2. Resolve Auditorium and Seat (Support demo QR audi2-b16)
    let auditorium = req.body.auditorium;
    let seat = req.body.seat || req.body.seatNumber;

    if (seatToken) {
      const matchedSeat = store.seats.find((s) => s.token === seatToken);
      if (matchedSeat) {
        auditorium = matchedSeat.auditoriumName || auditorium;
        seat = matchedSeat.seatNumber || seat;
      } else if (seatToken === 'audi2-b16') {
        auditorium = 'Audi 2';
        seat = 'B16';
      }
    }

    // Fallback safe demo defaults
    if (!auditorium) auditorium = 'Audi 2';
    if (!seat) seat = 'B16';

    // 3. Normalize Items
    const normalizedItems = items.map((item, index) => {
      const unitPrice = Number(item.price ?? item.unitPrice ?? item.total ?? 0);
      const quantity = Math.max(1, Number(item.quantity || 1));
      return {
        id: String(item.id || item.productId || `item-${index + 1}`),
        name: String(item.name || item.productName || 'Cinema Snack'),
        quantity,
        price: unitPrice >= 0 ? unitPrice : 0,
        type: item.type === 'Non-Veg' ? 'Non-Veg' : 'Veg',
      };
    });

    // 4. Financial Calculations
    const calculatedItemsTotal = normalizedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const finalTotal = total !== undefined ? Math.max(0, Number(total)) : calculatedItemsTotal;
    const finalSubtotal = subtotal !== undefined ? Math.max(0, Number(subtotal)) : calculatedItemsTotal;
    const finalTaxes = Math.max(0, Number(taxes || 0));
    const finalDeliveryFee = Math.max(0, Number(deliveryFee || 0));
    const finalDiscount = Math.max(0, Number(discount || 0));

    // 5. Timestamps & Time strings
    const now = new Date();
    const timeStr = formatTime(now);

    // 6. Generate Human-Readable Order ID
    const orderId = await generateUniqueOrderId();

    // 7. Assemble Order Object
    const orderPayload = {
      id: orderId,
      auditorium,
      seat,
      customer: {
        name: customer?.name?.trim() || 'Cinema Guest',
        phone: customer?.phone?.trim() || '',
        email: customer?.email?.trim() || '',
      },
      items: normalizedItems,
      subtotal: finalSubtotal,
      taxes: finalTaxes,
      deliveryFee: finalDeliveryFee,
      discount: finalDiscount,
      total: finalTotal,
      paymentStatus: 'Paid', // Simulated demo payment flow
      paymentMethod: paymentMethod || 'UPI',
      status: 'Pending',
      createdAt: now,
      time: timeStr,
      timeline: createInitialTimeline(timeStr, auditorium, seat),
      specialInstructions: specialInstructions || '',
    };

    let savedOrder = null;

    // 8. MongoDB Persistence
    if (mongoose.connection.readyState === 1) {
      try {
        const orderDoc = new Order(orderPayload);
        const result = await orderDoc.save();
        savedOrder = result.toObject();
      } catch (dbErr) {
        console.warn('MongoDB save failed, continuing with memoryStore fallback:', dbErr.message);
      }
    }

    // 9. Memory Store Fallback / Mirror
    const orderToStore = savedOrder || orderPayload;
    store.orders.unshift(orderToStore);

    return res.status(201).json({
      success: true,
      order: orderToStore,
    });
  } catch (error) {
    console.error('Error creating order:', error);
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
    if (mongoose.connection.readyState === 1) {
      try {
        const dbOrders = await Order.find().sort({ createdAt: -1 }).lean();
        return res.json({
          success: true,
          orders: dbOrders || [],
        });
      } catch (dbErr) {
        console.warn('MongoDB query failed, falling back to memoryStore:', dbErr.message);
      }
    }

    // Fallback: In-memory store sorted newest first
    const memoryOrders = [...(store.orders || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return res.json({
      success: true,
      orders: memoryOrders,
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
        console.warn('MongoDB update status failed, falling back to memoryStore:', dbErr.message);
      }
    }

    // 2. Memory Store Update (if MongoDB not connected or doc not found in DB)
    if (!updatedOrder) {
      const memOrder = store.orders.find(
        (o) => o.id === rawId || o.id === idWithHash || o.id === idWithoutHash || String(o._id) === rawId
      );

      if (!memOrder) {
        return res.status(404).json({
          success: false,
          message: `Order '${rawId}' not found.`,
        });
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

module.exports = {
  createOrder,
  getOrders,
  updateOrderStatus,
};
