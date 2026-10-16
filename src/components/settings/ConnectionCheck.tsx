'use client';

import {
  clearIndexedDbPersistence,
  disableNetwork,
  doc,
  enableNetwork,
  getDocFromServer,
  terminate,
  waitForPendingWrites,
} from 'firebase/firestore';
import { useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/Confirm';
import { SectionTitle } from '@/components/ui/PageHeader';
import { auth, db } from '@/lib/firebase';
import { COL } from '@/lib/db/collections';
import { outboxEntries } from '@/lib/offline/outbox';
import { restGetDoc, restSetDoc, type RestWriteError } from '@/lib/offline/rest';
import { withTimeout } from '@/lib/offline/write';

type Result = { label: string; ok: boolean | null; detail: string };

/**
 * «فحص الاتصال»: why a save on this device does not reach the server.
 *
 * Four questions, each answered on its own so the answer is specific:
 *   1. Can the app's live connection (SDK) read from the server?
 *   2. Can this device reach Firestore directly (REST), signed in?
 *   3. Can this account write there (REST write of a small check document)?
 *   4. Are there writes waiting in this device's queue?
 * When 2–3 pass but the queue never empties, the queue is stuck: the fix is to
 * restart the connection, or, as a last resort, clear this device's cache.
 */
export function ConnectionCheck() {
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const out: Result[] = [];
    const push = (r: Result) => {
      out.push(r);
      setResults([...out]);
    };
    setResults([]);

    // 1. SDK read from the server.
    try {
      const started = performance.now();
      await withTimeout(getDocFromServer(doc(db(), COL.storefront, 'config')), 12000);
      push({ label: 'قراءة من السيرفر (اتصال التطبيق)', ok: true, detail: `${Math.round(performance.now() - started)} ms` });
    } catch (err) {
      push({ label: 'قراءة من السيرفر (اتصال التطبيق)', ok: false, detail: (err as { code?: string }).code ?? (err as Error).message });
    }

    // 2. Direct read, signed in.
    const uid = auth().currentUser?.uid;
    const read = await restGetDoc(`users/${uid}`);
    push({
      label: 'وصول مباشر للسيرفر',
      ok: read.ok,
      detail: read.ok ? `${read.ms} ms` : read.status ? `HTTP ${read.status}` : 'ما في رد',
    });

    // 3. Direct write — a tiny document that only says who checked and when.
    try {
      await restSetDoc('storefront/connectionCheck', { at: new Date(), uid: uid ?? '' });
      push({ label: 'كتابة مباشرة في السيرفر', ok: true, detail: 'نجحت' });
    } catch (err) {
      const e = err as RestWriteError;
      push({
        label: 'كتابة مباشرة في السيرفر',
        ok: false,
        detail:
          e.serverStatus === 'RESOURCE_EXHAUSTED' || e.status === 429
            ? 'حصة الكتابة اليومية المجانية في Firebase خلصت — التعديلات محفوظة في الجهاز وبتتبعت براها بعد الساعة 9 صباحاً بتوقيت السودان.'
            : `${e.serverStatus || e.status}: ${e.message}`,
      });
    }

    // 4. The device's write queue.
    try {
      await withTimeout(waitForPendingWrites(db()), 8000);
      push({ label: 'كتابات منتظرة في الجهاز', ok: true, detail: 'ما في — كل التعديلات وصلت' });
    } catch {
      push({ label: 'كتابات منتظرة في الجهاز', ok: false, detail: 'في تعديلات واقفة ما وصلت السيرفر' });
    }

    setRunning(false);
  }

  async function restart() {
    try {
      await disableNetwork(db());
      await enableNetwork(db());
      toast.success('اتعاد تشغيل الاتصال — جرّب الفحص تاني');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function clearQueue() {
    const offlineSales = outboxEntries().length;
    const ok = await confirm({
      title: 'مسح الكتابات العالقة؟',
      message:
        'بيمسح التعديلات اللي في الجهاز دا وما وصلت السيرفر (تعديلات منتجات، تصنيفات، إعدادات)، وبيحمّل البيانات من السيرفر من جديد. ' +
        (offlineSales
          ? `عمليات البيع بدون شبكة (${offlineSales}) محفوظة براها وما بتتأثر. `
          : 'عمليات البيع بدون شبكة محفوظة براها وما بتتأثر. ') +
        'اقفل أي تبويب تاني للتطبيق قبل ما تواصل.',
      confirmLabel: 'امسح وحمّل من جديد',
      danger: true,
    });
    if (!ok) return;
    try {
      const instance = db();
      await terminate(instance);
      await clearIndexedDbPersistence(instance);
      window.location.reload();
    } catch (err) {
      toast.error(
        (err as { code?: string }).code === 'failed-precondition'
          ? 'في تبويب تاني مفتوح للتطبيق — اقفلو وجرّب تاني.'
          : (err as Error).message,
      );
    }
  }

  const queueStuck = results.find((r) => r.label.startsWith('كتابات منتظرة'))?.ok === false;
  const directOk = results.find((r) => r.label.startsWith('كتابة مباشرة'))?.ok === true;

  return (
    <section className="surface p-4">
      <SectionTitle>فحص الاتصال</SectionTitle>
      <p className="mb-3 text-[0.84rem] text-fg-2">
        لو تعديل بيظهر عندك وما بيظهر في جهاز تاني أو في الموقع، الفحص دا بيقول ليك السبب.
      </p>
      <Button variant="secondary" block loading={running} onClick={() => void run()}>
        ابدأ الفحص
      </Button>

      {results.length > 0 ? (
        <ul className="surface-sunken rows mt-3 overflow-hidden">
          {results.map((r) => (
            <li key={r.label} className="flex items-start gap-3 px-3.5 py-2.5 text-[0.88rem]">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${r.ok ? 'bg-good' : 'bg-bad'}`} />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{r.label}</span>
                <span dir="auto" className="block break-words text-[0.8rem] text-fg-3">
                  {r.detail}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {queueStuck ? (
        <div className="mt-3 space-y-2">
          <p className="text-[0.84rem] font-bold text-warn">
            {directOk
              ? 'السيرفر شغّال والحساب عندو صلاحية — المشكلة كتابات عالقة في الجهاز دا. جرّب «أعد تشغيل الاتصال» أول.'
              : 'في كتابات عالقة. جرّب «أعد تشغيل الاتصال».'}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => void restart()}>
              أعد تشغيل الاتصال
            </Button>
            <Button variant="danger" onClick={() => void clearQueue()}>
              امسح الكتابات العالقة
            </Button>
          </div>
        </div>
      ) : null}
      {dialog}
    </section>
  );
}
