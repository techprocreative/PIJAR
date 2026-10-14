import { Prisma } from '@prisma/client';

// Include relasi Order yang dipakai mapper OrderDto (dipakai orders & bids module)
export const orderInclude = {
  service: true,
  customer: true,
  mitra: { include: { user: true, services: { include: { service: true } } } },
  bids: {
    include: { mitra: { include: { user: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  payment: true,
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{
  include: typeof orderInclude;
}>;

// Include relasi Bid yang dipakai mapper BidDto
export const bidInclude = {
  mitra: { include: { user: true } },
} satisfies Prisma.BidInclude;

export type BidWithRelations = Prisma.BidGetPayload<{
  include: typeof bidInclude;
}>;
