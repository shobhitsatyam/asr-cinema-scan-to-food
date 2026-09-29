class PaymentService {
  async createPaymentOrder({ amount, seat, orderNumber }) {
    if (!process.env.PAYMENT_GATEWAY_KEY_ID || !process.env.PAYMENT_GATEWAY_KEY_SECRET) {
      return {
        gateway: 'placeholder',
        orderNumber,
        amount,
        status: 'pending',
        paymentReference: `ASR-${Date.now()}`,
        metadata: {
          seat,
          mode: 'UPI',
          note: 'Gateway credentials are not configured yet. This is a placeholder order for local development.',
        },
      };
    }

    return {
      gateway: 'provider',
      orderNumber,
      amount,
      status: 'pending',
      paymentReference: `PAY-${Date.now()}`,
      metadata: { seat, mode: 'UPI' },
    };
  }

  async verifyPayment({ paymentReference, amount, orderNumber }) {
    if (!paymentReference || !amount || !orderNumber) {
      throw new Error('Invalid payment verification payload.');
    }

    return {
      verified: true,
      status: 'paid',
      paymentReference,
      amount,
      orderNumber,
    };
  }
}

module.exports = new PaymentService();
