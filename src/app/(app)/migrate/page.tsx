'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQueueSummary } from '@/components/layout/SyncStatus';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { IconAlert, IconDownload } from '@/components/ui/Icons';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { downloadJson, stamp } from '@/lib/csv';
import { num } from '@/lib/format';
import { exportShop, importShop, summarizeExport, type ShopExport } from '@/lib/migration';

const LABEL: Record<string, string> = {
  settings: 'إعدادات المتجر',
  products: 'المنتجات',
  shipments: 'الشحنات',
  shipmentGroups: 'مجموعات الشحنات',
  customers: 'العملاء',
  sales: 'المبيعات',
  debtPayments: 'تسديد الديون',
  returns: 'المرتجعات',
  expenses: 'المصروفات',
  referrals: 'الإحالات',
  campaigns: 'الحملات',
  stockCounts: 'الجرد',
  promos: 'الكوبونات',
  cards: 'بطاقات العملاء',
  creditGrants: 'هدايا الرصيد',
  activityLog: 'سجل النشاط',
  users: 'الفريق (للمرجع فقط)',
};

/**
 * Owner-only tool for moving the shop to another Firebase project. Not in any
 * menu — opened by its address for the one afternoon it is needed.
 */
export default function MigratePage() {
  const { isOwner, profile } = useAuth();
  const queue = useQueueSummary(profile?.uid);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [exported, setExported] = useState<ShopExport | null>(null);
  const [imported, setImported] = useState<{ name: string; count: number }[] | null>(null);

  if (!isOwner) return <p className="py-10 text-center font-bold text-fg-3">للمالك فقط.</p>;

  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const waiting = queue.pending.length + queue.conflicts.length + queue.others.length;

  async function runExport() {
    setBusy(true);
    try {
      const data = await exportShop((name) => setProgress(`قراءة ${LABEL[name] ?? name}…`));
      setExported(data);
      downloadJson(`mtozero-export-${project}-${stamp()}`, data);
      toast.success('نزل ملف التصدير — احفظه في مكان آمن');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر التصدير.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function runImport(file: File) {
    setBusy(true);
    try {
      const data = JSON.parse(await file.text()) as ShopExport;
      const result = await importShop(data, (name, done, total) =>
        setProgress(`كتابة ${LABEL[name] ?? name} — ${num(done)} من ${num(total)}`),
      );
      setImported(result);
      toast.success('اكتمل الاستيراد');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الاستيراد.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <>
      <PageHeader title="نقل المتجر لمشروع جديد" subtitle={`متصل الآن بالمشروع: ${project}`} />

      {waiting > 0 ? (
        <div className="surface mb-4 flex items-start gap-3 border-bad p-3.5">
          <IconAlert className="h-5 w-5 shrink-0 text-bad" />
          <p className="text-[0.9rem] font-bold text-bad">
            في {num(waiting)} عملية على الجهاز لسه ما اترسلت. أرسلها أو راجعها من «عمليات بدون شبكة» قبل التصدير، وإلا
            ما بتكون في الملف.
          </p>
        </div>
      ) : null}

      <section className="mb-6">
        <SectionTitle>١ · التصدير من المشروع القديم</SectionTitle>
        <div className="surface p-4">
          <p className="mb-3 text-[0.9rem] leading-relaxed text-fg-2">
            يقرأ كل بيانات المتجر من السيرفر وينزّلها في ملف واحد. اعمله وإنت متصل بالمشروع القديم، وبعد ما كل
            الأجهزة أرسلت عملياتها.
          </p>
          <Button variant="ink" loading={busy} icon={<IconDownload className="h-4 w-4" />} onClick={() => void runExport()}>
            تصدير كل البيانات
          </Button>
          {exported ? <Counts title="اتصدّر" rows={summarizeExport(exported)} skipped={exported.skipped} /> : null}
        </div>
      </section>

      <section>
        <SectionTitle>٢ · الاستيراد في المشروع الجديد</SectionTitle>
        <div className="surface p-4">
          <p className="mb-3 text-[0.9rem] leading-relaxed text-fg-2">
            اعمله بعد تبديل إعدادات Firebase للمشروع الجديد. المنتجات والمبيعات والعملاء والديون بتنتقل بنفس أرقامها.
            حسابات الموظفين ما بتنتقل — تعملها من جديد من صفحة الفريق.
          </p>
          <label className={`press inline-flex h-12 cursor-pointer items-center gap-2 rounded-card bg-brand-500 px-4 font-display font-extrabold text-white ${busy ? 'pointer-events-none opacity-50' : ''}`}>
            اختيار ملف التصدير
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void runImport(file);
                e.target.value = '';
              }}
            />
          </label>
          {imported ? <Counts title="اتكتب" rows={imported} skipped={{}} /> : null}
        </div>
      </section>

      {progress ? <p className="mt-4 text-center font-bold text-fg-2">{progress}</p> : null}
    </>
  );
}

function Counts({
  title,
  rows,
  skipped,
}: {
  title: string;
  rows: { name: string; count: number }[];
  skipped: Record<string, string>;
}) {
  return (
    <div className="mt-4">
      <p className="ledger-head">{title}</p>
      <ul className="perf-rows">
        {rows.map((r) => (
          <li key={r.name} className="tnum flex justify-between py-1.5 text-[0.9rem] font-bold">
            <span>{LABEL[r.name] ?? r.name}</span>
            <span>{num(r.count)}</span>
          </li>
        ))}
        {Object.entries(skipped).map(([name, reason]) => (
          <li key={name} className="flex justify-between gap-3 py-1.5 text-[0.85rem] font-bold text-warn">
            <span>{LABEL[name] ?? name} — ما اتقرأ</span>
            <span className="truncate" dir="ltr">
              {reason.slice(0, 60)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
