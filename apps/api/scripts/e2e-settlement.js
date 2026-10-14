const assert = require('node:assert/strict');
require('ts-node/register');
const { PrismaClient } = require('@prisma/client');
const { WalletHelper } = require('../src/wallet/wallet.helper');
const { WalletService } = require('../src/wallet/wallet.service');
const { SettlementService } = require('../src/settlement/settlement.service');
const { OrdersService } = require('../src/orders/orders.service');
const { BidsService } = require('../src/bids/bids.service');
const { RatingsService } = require('../src/ratings/ratings.service');

async function main() {
  const p = new PrismaClient();
  const events = [];
  const realtime = {
    emitToOrder: (id, event) => events.push({ room: `order:${id}`, ...event }),
    emitToUser: (id, event) => events.push({ room: `user:${id}`, ...event }),
    broadcastNewOrder: async () => {},
  };
  const helper = new WalletHelper(p);
  const settlement = new SettlementService(helper);
  const orders = new OrdersService(p, realtime, helper, settlement);
  const bids = new BidsService(p, realtime);
  const ratings = new RatingsService(p);
  const prefix = `review-${Date.now()}`;
  const users = [];
  const orderIds = [];
  let service;
  process.env.PLATFORM_FEE_PERCENT = '10';
  try {
    service = await p.service.create({ data: { name: prefix, description: 'Isolated regression', durationMinutes: 60, basePrice: 100000 } });
    for (let i = 0; i < 5; i++) {
      users.push(await p.user.create({ data: {
        phone: `${prefix}-${i}`, name: prefix, role: i < 3 ? 'CUSTOMER' : 'MITRA', walletBalance: i === 0 ? 0 : 1000000,
        ...(i >= 3 ? { mitraProfile: { create: {
          gender: 'MALE', verification: 'VERIFIED', status: 'ONLINE', lastLat: -6.2, lastLng: 106.8,
          services: { create: { serviceId: service.id } },
        } } } : {}),
      }, include: { mitraProfile: true } }));
    }
    async function create(customer) {
      const order = await orders.createOrder(customer.id, { serviceId: service.id, addressLabel: 'Rumah', addressDetail: 'Alamat pengujian', location: { lat: -6.2, lng: 106.8 }, customerPrice: 100000 });
      orderIds.push(order.id);
      return order;
    }
    const poor = await create(users[0]);
    const poorBid = await bids.placeBid(users[3].id, poor.id, { price: 100000, etaMinutes: 10 });
    await assert.rejects(orders.acceptBid(users[0].id, poor.id, poorBid.id), /Saldo tidak cukup/);
    assert.equal((await p.order.findUniqueOrThrow({ where: { id: poor.id } })).status, 'BIDDING');
    assert.equal((await p.bid.findUniqueOrThrow({ where: { id: poorBid.id } })).status, 'PENDING');
    assert.equal(await p.payment.count({ where: { orderId: poor.id } }), 0);

    const match = await create(users[1]);
    const first = await bids.placeBid(users[3].id, match.id, { price: 100000, etaMinutes: 10 });
    await bids.placeBid(users[4].id, match.id, { price: 110000, etaMinutes: 12 });
    const attempts = await Promise.allSettled(Array.from({ length: 4 }, () => orders.acceptBid(users[1].id, match.id, first.id)));
    assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await p.user.findUniqueOrThrow({ where: { id: users[1].id } })).walletBalance, 900000);
    const detail = await orders.getOrder(users[3], match.id);
    assert.equal(detail.bids.length, 1, 'matched mitra cannot inspect competitor bids');
    assert.equal('walletBalance' in detail.customer, false);
    assert.equal('phone' in detail.customer, false);
    await assert.rejects(orders.getOrder(users[2], match.id), /Tidak berhak/);
    const cancels = await Promise.all(Array.from({ length: 3 }, () => orders.cancelOrder(users[1], match.id, 'Cancel regression')));
    assert(cancels.every(order => order.status === 'CANCELLED'));
    assert.equal((await p.user.findUniqueOrThrow({ where: { id: users[1].id } })).walletBalance, 1000000);
    assert.equal(await p.walletTransaction.count({ where: { userId: users[1].id, type: 'REFUND' } }), 1);
    assert.equal((await p.payment.findUniqueOrThrow({ where: { orderId: match.id } })).status, 'REFUNDED');

    const a = await create(users[1]);
    const b = await create(users[2]);
    const ba = await bids.placeBid(users[3].id, a.id, { price: 100000, etaMinutes: 10 });
    const bb = await bids.placeBid(users[3].id, b.id, { price: 100000, etaMinutes: 10 });
    const assignments = await Promise.allSettled([
      orders.acceptBid(users[1].id, a.id, ba.id), orders.acceptBid(users[2].id, b.id, bb.id),
    ]);
    assert.equal(assignments.filter(r => r.status === 'fulfilled').length, 1, 'one active assignment per mitra');
    const winner = assignments.find(r => r.status === 'fulfilled').value;
    await assert.rejects(orders.transitionStatus(users[3], winner.id, 'IN_PROGRESS'), /tidak legal/);
    for (const status of ['MITRA_ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS']) await orders.transitionStatus(users[3], winner.id, status);
    process.env.PLATFORM_FEE_PERCENT = '20';
    const completions = await Promise.all(Array.from({ length: 3 }, () => orders.transitionStatus(users[3], winner.id, 'COMPLETED')));
    assert(completions.every(order => order.status === 'SETTLED'));
    assert.equal((await p.user.findUniqueOrThrow({ where: { id: users[3].id } })).walletBalance, 1090000, 'fee snapshot and credit exactly once');
    assert.equal((await p.mitraProfile.findUniqueOrThrow({ where: { userId: users[3].id } })).totalJobs, 1);
    assert.equal(await p.walletTransaction.count({ where: { userId: users[3].id, type: 'ORDER_EARNING' } }), 1);
    assert(events.some(event => event.room === `user:${users[3].id}` && event.event === 'wallet:updated' && event.data.balance === 1090000));
    await assert.rejects(orders.cancelOrder(users[3], winner.id, 'Too late'), /tidak bisa dibatalkan/);
    const customer = users.find(user => user.id === winner.customer.id);
    const concurrentRatings = await Promise.allSettled([1, 5].map(stars => ratings.submitRating(customer.id, winner.id, stars, 'MITRA')));
    assert.equal(concurrentRatings.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await p.mitraProfile.findUniqueOrThrow({ where: { userId: users[3].id } })).ratingCount, 1);
    const beforeWithdrawal = await p.user.findUniqueOrThrow({ where: { id: users[3].id } });
    await assert.rejects(new WalletService(p).withdraw(users[3].id, 50000), error => error.getStatus() === 501);
    assert.equal((await p.user.findUniqueOrThrow({ where: { id: users[3].id } })).walletBalance, beforeWithdrawal.walletBalance);
    const forged = await create(users[2]);
    await p.order.update({ where: { id: forged.id }, data: { status: 'IN_PROGRESS', mitraId: users[4].mitraProfile.id, finalPrice: 100000 } });
    await assert.rejects(orders.transitionStatus(users[4], forged.id, 'COMPLETED'), /escrow/);
    assert.equal((await p.order.findUniqueOrThrow({ where: { id: forged.id } })).status, 'IN_PROGRESS', 'failed settlement rolls back completion');
    console.log('PASS transactions: rollback, concurrent accept, single assignment, refund, fee snapshot, settlement, privacy, rating, payout disabled');
  } finally {
    const ids = users.map(user => user.id);
    await p.rating.deleteMany({ where: { orderId: { in: orderIds } } });
    await p.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await p.bid.deleteMany({ where: { orderId: { in: orderIds } } });
    await p.order.deleteMany({ where: { id: { in: orderIds } } });
    await p.walletTransaction.deleteMany({ where: { userId: { in: ids } } });
    await p.serviceMitra.deleteMany({ where: { serviceId: service?.id ?? '' } });
    await p.mitraProfile.deleteMany({ where: { userId: { in: ids } } });
    await p.user.deleteMany({ where: { id: { in: ids } } });
    if (service) await p.service.delete({ where: { id: service.id } });
    await p.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
