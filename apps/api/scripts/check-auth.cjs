const assert = require('node:assert/strict');
require('ts-node/register');
const { PrismaClient } = require('@prisma/client');
const { JwtService } = require('@nestjs/jwt');
const { AuthService } = require('../src/auth/auth.service');
const { isDevMode } = require('../src/common/config');

async function main() {
  const prisma = new PrismaClient();
  const phone = `+628${Date.now()}`;
  process.env.DEV_MODE = 'true';
  process.env.JWT_SECRET = 'isolated-auth-check-secret-not-for-deployment';
  const auth = new AuthService(prisma, new JwtService({ secret: process.env.JWT_SECRET, signOptions: { expiresIn: '15m' } }));
  try {
    const { devCode } = await auth.requestOtp({ phone });
    const wrong = devCode === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) {
      await assert.rejects(auth.verifyOtp({ phone, code: wrong, role: 'CUSTOMER' }));
    }
    const challenge = await prisma.otpCode.findFirstOrThrow({ where: { phone }, orderBy: { createdAt: 'desc' } });
    assert.equal(challenge.attempts, 5, 'wrong guesses must consume attempts');
    await assert.rejects(auth.verifyOtp({ phone, code: devCode, role: 'CUSTOMER' }), 'exhausted challenge cannot authenticate');
    const previous = await auth.requestOtp({ phone });
    const fresh = await auth.requestOtp({ phone });
    if (previous.devCode !== fresh.devCode) {
      await assert.rejects(auth.verifyOtp({ phone, code: previous.devCode, role: 'CUSTOMER' }), 'superseded OTP rejected');
    }
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => auth.verifyOtp({ phone, code: fresh.devCode, role: 'CUSTOMER', name: 'Isolated auth check' })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, 'OTP consumed exactly once under concurrency');
    const session = results.find(r => r.status === 'fulfilled').value;
    assert.notEqual((await prisma.user.findUniqueOrThrow({ where: { phone } })).refreshToken, session.refreshToken, 'stored refresh token must be hashed');
    const rotated = await auth.refresh({ refreshToken: session.refreshToken });
    await assert.rejects(auth.refresh({ refreshToken: session.refreshToken }), 'refresh replay rejected');
    await assert.rejects(auth.refresh({ refreshToken: rotated.refreshToken }), 'replay revokes token family');
    process.env.NODE_ENV = 'production';
    assert.equal(isDevMode(), false, 'production cannot expose dev OTP even with DEV_MODE=true');
    await assert.rejects(auth.requestOtp({ phone }), e => e.getStatus() === 503, 'missing delivery provider must not report sent');
    console.log('PASS auth: attempt limit, OTP rotation/concurrency, refresh hashing/replay, production fail-closed');
  } finally {
    await prisma.otpCode.deleteMany({ where: { phone } });
    await prisma.user.deleteMany({ where: { phone } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
