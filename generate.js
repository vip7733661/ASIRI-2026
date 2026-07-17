const fs = require('fs');
const path = require('path');

// قائمة الملفات والمجلدات (الاسم : المحتوى)
const files = {
  'package.json': `{
  "name": "asiri-capital",
  "version": "1.0.0",
  "description": "منصة أسهم متكاملة",
  "main": "dist/server.js",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^5.0.0",
    "@trpc/server": "^10.45.0",
    "axios": "^1.6.0",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.0.3",
    "express": "^4.18.2",
    "node-cache": "^5.1.2",
    "nodemailer": "^6.9.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.13",
    "@types/express": "^4.17.17",
    "@types/node": "^20.0.0",
    "@types/nodemailer": "^6.4.14",
    "prisma": "^5.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0"
  }
}`,

  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "rootDir": "./src",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "frontend"]
}`,

  '.env.example': `DATABASE_URL="mysql://root:password@localhost:3306/asiri"
ALPHA_VANTAGE_KEY="your_key_here"
PORT=4000
EMAIL_USER="your_email@gmail.com"
EMAIL_PASS="your_app_password"`,

  '.gitignore': `node_modules/
dist/
.env
*.log
.DS_Store`,

  'prisma/schema.prisma': `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  passwordHash  String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  portfolios    Portfolio[]
  watchlists    Watchlist[]
  alerts        Alert[]
}

model Portfolio {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  symbol      String
  quantity    Float
  avgPrice    Float
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([userId, symbol])
}

model Watchlist {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  symbol    String
  addedAt   DateTime @default(now())

  @@unique([userId, symbol])
}

model Alert {
  id          String    @id @default(cuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  symbol      String
  targetPrice Float
  isAbove     Boolean   @default(true)
  isActive    Boolean   @default(true)
  triggeredAt DateTime?
  createdAt   DateTime  @default(now())
}`,

  'src/server.ts': `import express from 'express';
import cors from 'cors';
import { router, publicProcedure, createContext } from './trpc';
import * as trpcExpress from '@trpc/server/adapters/express';
import { stockRouter } from './routers/stock.router';
import { userRouter } from './routers/user.router';
import { alertRouter } from './routers/alert.router';

const app = express();
app.use(cors());
app.use(express.json());

const appRouter = router({
  stock: stockRouter,
  user: userRouter,
  alert: alertRouter,
});

export type AppRouter = typeof appRouter;

app.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(\`🚀 Asiri Capital Server running on http://localhost:\${PORT}\`);
});`,

  'src/trpc.ts': `import { initTRPC, TRPCError } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createContext = ({ req, res }: CreateExpressContextOptions) => {
  return { req, res, prisma, user: null };
};

const t = initTRPC.context<typeof createContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const isAuthenticated = t.middleware(async ({ ctx, next }) => {
  return next({ ctx: { ...ctx, user: { id: 'test-user' } } });
});

export const protectedProcedure = t.procedure.use(isAuthenticated);`,

  'src/services/stock.service.ts': `import axios from 'axios';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 60 });
const ALPHA_KEY = process.env.ALPHA_VANTAGE_KEY!;
const BASE_URL = 'https://www.alphavantage.co/query';

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
}

export class StockService {
  static async getQuote(symbol: string): Promise<StockQuote | null> {
    const cacheKey = \`quote_\${symbol}\`;
    const cached = cache.get<StockQuote>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(BASE_URL, {
        params: {
          function: 'GLOBAL_QUOTE',
          symbol: symbol,
          apikey: ALPHA_KEY,
        },
      });

      const data = response.data['Global Quote'];
      if (!data || !data['05. price']) return null;

      const quote: StockQuote = {
        symbol: data['01. symbol'],
        price: parseFloat(data['05. price']),
        change: parseFloat(data['09. change']),
        changePercent: parseFloat(data['10. change percent'].replace('%', '')),
        volume: parseInt(data['06. volume']),
        timestamp: data['07. latest trading day'],
      };

      cache.set(cacheKey, quote);
      return quote;
    } catch (error) {
      console.error(\`Error fetching \${symbol}:\`, error);
      return null;
    }
  }

  static async getHistory(symbol: string, interval: '1min' | '5min' | 'daily' = 'daily') {
    const functionMap = {
      '1min': 'TIME_SERIES_INTRADAY',
      '5min': 'TIME_SERIES_INTRADAY',
      'daily': 'TIME_SERIES_DAILY',
    };
    
    const response = await axios.get(BASE_URL, {
      params: {
        function: functionMap[interval],
        symbol: symbol,
        ...(interval !== 'daily' && { interval: interval }),
        apikey: ALPHA_KEY,
      },
    });

    const timeSeries = response.data['Time Series (Daily)'] || response.data['Time Series (5min)'];
    if (!timeSeries) return [];

    return Object.keys(timeSeries).map((date) => ({
      time: date,
      value: parseFloat(timeSeries[date]['4. close']),
    })).reverse().slice(0, 30);
  }
}`,

  'src/services/email.service.ts': `import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendAlertEmail = async (to: string, symbol: string, price: number) => {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: \`🔔 تنبيه: \${symbol} وصل للسعر المستهدف\`,
    html: \`<p>السهم <b>\${symbol}</b> وصل إلى <b>\$\${price}</b></p>\`,
  });
};`,

  'src/routers/stock.router.ts': `import { router, publicProcedure, protectedProcedure } from '../trpc';
import { z } from 'zod';
import { StockService } from '../services/stock.service';
import { TRPCError } from '@trpc/server';

export const stockRouter = router({
  getQuote: publicProcedure
    .input(z.object({ symbol: z.string().toUpperCase() }))
    .query(async ({ input }) => {
      const quote = await StockService.getQuote(input.symbol);
      if (!quote) throw new TRPCError({ code: 'NOT_FOUND', message: 'Stock not found' });
      return quote;
    }),

  getHistory: publicProcedure
    .input(z.object({ symbol: z.string().toUpperCase(), interval: z.enum(['1min', '5min', 'daily']).default('daily') }))
    .query(async ({ input }) => {
      return await StockService.getHistory(input.symbol, input.interval);
    }),
});`,

  'src/routers/user.router.ts': `import { router, publicProcedure, protectedProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import bcrypt from 'bcryptjs';

export const userRouter = router({
  register: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(6), name: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const exists = await ctx.prisma.user.findUnique({ where: { email: input.email } });
      if (exists) throw new TRPCError({ code: 'CONFLICT', message: 'User already exists' });
      
      const hashed = await bcrypt.hash(input.password, 10);
      return ctx.prisma.user.create({
        data: { email: input.email, passwordHash: hashed, name: input.name },
      });
    }),

  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findUnique({ where: { id: 'test-user' } });
  }),
});`,

  'src/routers/alert.router.ts': `import { router, protectedProcedure } from '../trpc';
import { z } from 'zod';

export const alertRouter = router({
  create: protectedProcedure
    .input(z.object({ symbol: z.string().toUpperCase(), targetPrice: z.number(), isAbove: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.alert.create({
        data: {
          userId: ctx.user.id,
          symbol: input.symbol,
          targetPrice: input.targetPrice,
          isAbove: input.isAbove,
        },
      });
    }),

  getAll: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.alert.findMany({ where: { userId: ctx.user.id, isActive: true } });
  }),

  toggle: protectedProcedure
    .input(z.object({ id: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.alert.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      });
    }),
});`,

  'src/jobs/alertChecker.ts': `import { PrismaClient } from '@prisma/client';
import { StockService } from '../services/stock.service';
import { sendAlertEmail } from '../services/email.service';

const prisma = new PrismaClient();

export const checkAlerts = async () => {
  const alerts = await prisma.alert.findMany({ where: { isActive: true, triggeredAt: null } });
  
  for (const alert of alerts) {
    const quote = await StockService.getQuote(alert.symbol);
    if (!quote) continue;

    const condition = alert.isAbove ? quote.price >= alert.targetPrice : quote.price <= alert.targetPrice;
    
    if (condition) {
      await prisma.alert.update({ where: { id: alert.id }, data: { triggeredAt: new Date() } });
      const user = await prisma.user.findUnique({ where: { id: alert.userId } });
      if (user?.email) await sendAlertEmail(user.email, alert.symbol, quote.price);
    }
  }
};

setInterval(checkAlerts, 5 * 60 * 1000);`
};

// دالة لإنشاء المجلدات والملفات
Object.entries(files).forEach(([filePath, content]) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
  console.log(`✅ تم إنشاء: ${filePath}`);
});

console.log('\n🎉 تم إنشاء جميع الملفات بنجاح!');
console.log('📦 قم الآن بتشغيل: npm install');
console.log('🚀 ثم: npm run dev');
