const fs = require('fs');
const path = require('path');

// كل ملفات الواجهة (frontend) - الاسم : المحتوى
const files = {
  'frontend/package.json': `{
  "name": "asiri-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "@trpc/client": "^10.45.0",
    "@trpc/react-query": "^10.45.0",
    "@trpc/server": "^10.45.0",
    "next": "14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@tanstack/react-query": "^4.36.0",
    "zod": "^3.22.0",
    "recharts": "^2.8.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.3.0",
    "typescript": "^5.0.0"
  }
}`,

  'frontend/tsconfig.json': `{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}`,

  'frontend/tailwind.config.js': `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: { extend: {} },
  plugins: [],
}`,

  'frontend/postcss.config.js': `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,

  'frontend/app/layout.tsx': `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Asiri Capital', description: 'منصة الأسهم الذكية' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
        {children}
      </body>
    </html>
  );
}`,

  'frontend/app/globals.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: system-ui, -apple-system, sans-serif;
}`,

  'frontend/utils/trpc.ts': `import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../src/server'; 

export const trpc = createTRPCReact<AppRouter>();`,

  'frontend/app/page.tsx': `'use client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { trpc } from '@/utils/trpc';
import { httpBatchLink } from '@trpc/client';

const queryClient = new QueryClient();
const trpcClient = trpc.createClient({
  links: [httpBatchLink({ url: 'http://localhost:4000/trpc' })],
});

export default function HomePage() {
  const [symbol, setSymbol] = useState('AAPL');
  const { data: quote, refetch, isLoading } = trpc.stock.getQuote.useQuery(
    { symbol },
    { enabled: !!symbol }
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <main className="min-h-screen p-8 max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-center text-blue-600 mb-8">🏦 ASIRI CAPITAL</h1>
          
          {/* حقل البحث */}
          <div className="flex gap-3 mb-8 justify-center">
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="px-4 py-3 border rounded-xl w-64 text-center bg-white dark:bg-gray-800 shadow"
              placeholder="مثل: TSLA, 2030"
            />
            <button 
              onClick={() => refetch()} 
              className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 shadow transition"
            >
              🔍 بحث
            </button>
          </div>

          {/* عرض بيانات السهم */}
          {isLoading && <p className="text-center text-gray-500">جاري التحميل...</p>}
          
          {quote && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 text-center border border-gray-100">
              <h2 className="text-3xl font-bold">{quote.symbol}</h2>
              <p className="text-5xl font-black mt-3">\${quote.price.toFixed(2)}</p>
              <p className={\`text-xl mt-2 \${quote.change >= 0 ? 'text-green-500' : 'text-red-500'}\`}>
                {quote.change >= 0 ? '+' : ''}{quote.change.toFixed(2)} ({quote.changePercent.toFixed(2)}%)
              </p>
              <p className="text-gray-500 mt-4">📊 حجم التداول: {quote.volume.toLocaleString()}</p>
              <p className="text-gray-400 text-sm mt-2">آخر تحديث: {quote.timestamp}</p>
            </div>
          )}

          <div className="mt-8 text-center text-gray-400 text-sm">
            <p>🚀 خادم tRPC يعمل على المنفذ 4000</p>
          </div>
        </main>
      </QueryClientProvider>
    </trpc.Provider>
  );
}`
};

// إنشاء المجلدات والملفات
Object.entries(files).forEach(([filePath, content]) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content);
  console.log(`✅ تم إنشاء: ${filePath}`);
});

console.log('\n🎉 تم إنشاء واجهة المستخدم (frontend) بنجاح!');
console.log('📦 الآن ادخل مجلد frontend وشغّل: npm install');
console.log('🚀 ثم: npm run dev');
