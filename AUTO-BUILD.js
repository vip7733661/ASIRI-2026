const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// إعدادات المستودع
const REPO_OWNER = 'vip7733661';
const REPO_NAME = 'ASIRI-2026';

// جميع الملفات (المحتوى الكامل للمشروع)
const files = {
  // ======== الملفات الجذرية ========
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
ALPHA_VANTAGE_KEY="demo"
PORT=4000`,

  // ======== قاعدة البيانات ========
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

  // ======== الخادم ========
  'src/trpc.ts': `import { initTRPC } from '@trpc/server';
import { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export const createContext = ({ req, res }: CreateExpressContextOptions) => ({ req, res, prisma });
const t = initTRPC.context<typeof createContext>().create();
export const router = t.router;
export const publicProcedure = t.procedure;`,

  'src/server.ts': `import express from 'express';
import cors from 'cors';
import { router, createContext } from './trpc';
import * as trpcExpress from '@trpc/server/adapters/express';
import { stockRouter } from './routers/stock.router';
const app = express();
app.use(cors());
app.use(express.json());
const appRouter = router({ stock: stockRouter });
export type AppRouter = typeof appRouter;
app.use('/trpc', trpcExpress.createExpressMiddleware({ router: appRouter, createContext }));
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(\`🚀 Asiri Server running on http://localhost:\${PORT}\`));`,

  'src/routers/stock.router.ts': `import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
import axios from 'axios';
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 60 });
const ALPHA_KEY = process.env.ALPHA_VANTAGE_KEY || 'demo';
export const stockRouter = router({
  getQuote: publicProcedure.input(z.object({ symbol: z.string().toUpperCase() })).query(async ({ input }) => {
    const cached = cache.get(input.symbol);
    if (cached) return cached;
    const res = await axios.get(\`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=\${input.symbol}&apikey=\${ALPHA_KEY}\`);
    const data = res.data['Global Quote'];
    if (!data) throw new Error('Stock not found');
    const quote = { symbol: data['01. symbol'], price: parseFloat(data['05. price']), change: parseFloat(data['09. change']), changePercent: parseFloat(data['10. change percent'].replace('%', '')), volume: parseInt(data['06. volume']), timestamp: data['07. latest trading day'] };
    cache.set(input.symbol, quote);
    return quote;
  }),
});`,

  // ======== الواجهة الأمامية (Frontend) ========
  'frontend/package.json': `{
  "name": "asiri-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": { "dev": "next dev", "build": "next build", "start": "next start" },
  "dependencies": { "@tanstack/react-query": "^4.36.0", "@trpc/client": "^10.45.0", "@trpc/react-query": "^10.45.0", "@trpc/server": "^10.45.0", "next": "14.0.0", "react": "^18.2.0", "react-dom": "^18.2.0", "recharts": "^2.8.0", "zod": "^3.22.0" },
  "devDependencies": { "@types/node": "^20.0.0", "@types/react": "^18.2.0", "@types/react-dom": "^18.2.0", "autoprefixer": "^10.4.0", "postcss": "^8.4.0", "tailwindcss": "^3.3.0", "typescript": "^5.0.0" }
}`,
  'frontend/tsconfig.json': `{
  "compilerOptions": { "target": "es5", "lib": ["dom", "dom.iterable", "esnext"], "allowJs": true, "skipLibCheck": true, "strict": true, "forceConsistentCasingInFileNames": true, "noEmit": true, "esModuleInterop": true, "module": "esnext", "moduleResolution": "node", "resolveJsonModule": true, "isolatedModules": true, "jsx": "preserve", "incremental": true, "plugins": [{ "name": "next" }], "paths": { "@/*": ["./*"] } },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}`,
  'frontend/tailwind.config.js': `/** @type {import('tailwindcss').Config} */
module.exports = { content: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}', './app/**/*.{js,ts,jsx,tsx}'], theme: { extend: {} }, plugins: [] };`,
  'frontend/postcss.config.js': `module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };`,
  'frontend/app/layout.tsx': `import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Asiri Capital' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="ar" dir="rtl"><body className="bg-gray-50 dark:bg-gray-900 text-gray-900">{children}</body></html>;
}`,
  'frontend/app/globals.css': `@tailwind base; @tailwind components; @tailwind utilities;`,
  'frontend/utils/trpc.ts': `import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../src/server'; 
export const trpc = createTRPCReact<AppRouter>();`,
  'frontend/app/page.tsx': `'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc } from '@/utils/trpc';
import { httpBatchLink } from '@trpc/client';
const queryClient = new QueryClient();
const trpcClient = trpc.createClient({ links: [httpBatchLink({ url: 'http://localhost:4000/trpc' })] });
export default function HomePage() {
  const [symbol, setSymbol] = useState('AAPL');
  const { data: quote, refetch, isLoading } = trpc.stock.getQuote.useQuery({ symbol }, { enabled: !!symbol });
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <main className="min-h-screen p-8 max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-center text-blue-600 mb-8">🏦 ASIRI CAPITAL</h1>
          <div className="flex gap-3 mb-8 justify-center">
            <input type="text" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="px-4 py-3 border rounded-xl w-64 text-center bg-white shadow" placeholder="مثل: TSLA" />
            <button onClick={() => refetch()} className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow">🔍 بحث</button>
          </div>
          {isLoading && <p>جاري التحميل...</p>}
          {quote && (
            <div className="bg-white rounded-2xl shadow-xl p-8 text-center border">
              <h2 className="text-3xl font-bold">{quote.symbol}</h2>
              <p className="text-5xl font-black mt-3">\${quote.price.toFixed(2)}</p>
              <p className={\`text-xl mt-2 \${quote.change >= 0 ? 'text-green-500' : 'text-red-500'}\`}>{quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)</p>
              <p className="text-gray-500 mt-4">📊 حجم التداول: {quote.volume.toLocaleString()}</p>
            </div>
          )}
        </main>
      </QueryClientProvider>
    </trpc.Provider>
  );
}`
};

// ======== وظيفة الرفع إلى GitHub ========
async function uploadToGitHub(token) {
  console.log('📦 جاري إنشاء الملفات...');
  Object.entries(files).forEach(([filePath, content]) => {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content);
    console.log(`✅ ${filePath}`);
  });

  console.log('\n🔗 جاري ربط المستودع ورفع الملفات...');
  try {
    // إعداد الـ Remote مع التوكن
    const remoteUrl = `https://${token}@github.com/${REPO_OWNER}/${REPO_NAME}.git`;
    execSync('git init', { stdio: 'ignore' });
    execSync(`git remote add origin ${remoteUrl}`, { stdio: 'ignore' });
    execSync('git add .', { stdio: 'ignore' });
    execSync('git commit -m "🚀 بناء تلقائي للمنصة الكاملة بواسطة Asiri-Bot"', { stdio: 'ignore' });
    execSync('git branch -M main', { stdio: 'ignore' });
    execSync('git push -u origin main --force', { stdio: 'ignore' });
    
    console.log('\n🎉 تم رفع جميع الملفات بنجاح إلى مستودعك!');
    console.log(`🔗 رابط المستودع: https://github.com/${REPO_OWNER}/${REPO_NAME}`);
  } catch (error) {
    console.error('❌ فشل الرفع. تأكد من صحة التوكن وأن المستودع عام.');
    console.error(error.message);
  }
}

// ======== تشغيل السكريبت ========
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('🔑 الصق مفتاح GitHub Token الخاص بك (سيتم استخدامه لمرة واحدة): ', (token) => {
  if (!token || token.length < 10) {
    console.log('❌ المفتاح غير صالح. تأكد من نسخه بالكامل.');
    rl.close();
    return;
  }
  uploadToGitHub(token.trim());
  rl.close();
});
