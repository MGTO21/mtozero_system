'use client';

import { useState } from 'react';
import { useActor, useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { IconPlus } from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage } from '@/lib/db/collections';
import { createEmployee, updateUser, useUsers } from '@/lib/db/users';
import { formatDate } from '@/lib/format';
import { ROLE_LABEL, type AppUser, type Role } from '@/lib/types';

export default function TeamPage() {
  const { data: users, loading, error } = useUsers();
  const { profile } = useAuth();
  const actor = useActor();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  async function toggle(user: AppUser, patch: Partial<AppUser>) {
    try {
      await updateUser(user, patch, actor);
      toast.success('تم تحديث الصلاحيات');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="الفريق"
        subtitle="من يدخل النظام وماذا يرى"
        action={
          <Button icon={<IconPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            مستخدم جديد
          </Button>
        }
      />

      {error ? <ErrorBlock message={error} /> : null}

      {loading ? (
        <SkeletonRows count={3} />
      ) : (
        <ul className="space-y-2">
          {users.map((u) => {
            const isSelf = u.uid === profile?.uid;
            return (
              <li key={u.uid} className="surface p-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500/15 font-display text-base font-black text-brand-500">
                    {u.name.trim().charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.98rem] font-bold">
                      {u.name}
                      {isSelf ? <span className="mr-2 text-[0.72rem] text-ink-400">(أنت)</span> : null}
                    </p>
                    <p dir="ltr" className="truncate text-right text-[0.76rem] font-semibold text-ink-400 dark:text-ink-500">
                      {u.email}
                    </p>
                  </div>
                  <span
                    className={`chip shrink-0 ${
                      u.role === 'owner' ? 'bg-brand-500/15 text-brand-500' : 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300'
                    }`}
                  >
                    {ROLE_LABEL[u.role]}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink-200 pt-3 dark:border-ink-800">
                  {u.role === 'employee' ? (
                    <Toggle
                      label="يرى الأرباح"
                      checked={u.canSeeProfit}
                      onChange={(v) => void toggle(u, { canSeeProfit: v })}
                    />
                  ) : null}
                  <Toggle
                    label="حساب مفعّل"
                    checked={u.isActive}
                    disabled={isSelf}
                    onChange={(v) => void toggle(u, { isActive: v })}
                  />
                  {!isSelf ? (
                    <button
                      onClick={() => void toggle(u, { role: u.role === 'owner' ? 'employee' : 'owner' })}
                      className="rounded-card border border-ink-200 px-2.5 py-1.5 text-[0.76rem] font-bold text-ink-500 transition hover:border-brand-500 hover:text-brand-500 dark:border-ink-700 dark:text-ink-400"
                    >
                      {u.role === 'owner' ? 'تحويل إلى موظف' : 'ترقية إلى مالك'}
                    </button>
                  ) : null}
                  <span className="flex-1" />
                  <span className="tnum text-[0.72rem] font-semibold text-ink-400 dark:text-ink-500">
                    منذ {formatDate(u.createdAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 rounded-card border border-ink-200 px-3.5 py-3 text-[0.78rem] leading-relaxed text-ink-500 dark:border-ink-800 dark:text-ink-400">
        <span className="font-bold">الموظف</span> يسجّل المبيعات ويرى المخزون والديون، ولا يرى التقارير
        ولا سجل النشاط. تفعيل «يرى الأرباح» يُظهر له هامش الربح داخل المخزون والمبيعات فقط.
      </p>

      <NewUserSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`inline-flex items-center gap-2 text-[0.8rem] font-bold ${disabled ? 'opacity-50' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-brand-500' : 'bg-ink-300 dark:bg-ink-700'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
            checked ? 'right-0.5' : 'right-[1.375rem]'
          }`}
        />
      </button>
      {label}
    </label>
  );
}

function NewUserSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const actor = useActor();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('employee');
  const [canSeeProfit, setCanSeeProfit] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await createEmployee({ name, email, password, phone, role, canSeeProfit }, actor);
      toast.success('تم إنشاء الحساب');
      setName('');
      setEmail('');
      setPassword('');
      setPhone('');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر إنشاء الحساب.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="إضافة مستخدم"
      subtitle="ستبقى أنت مسجّلاً للدخول بعد الإنشاء"
      footer={
        <Button block size="lg" loading={busy} onClick={() => void save()}>
          إنشاء الحساب
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="u-name">
            الاسم *
          </label>
          <input id="u-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="u-email">
            البريد الإلكتروني *
          </label>
          <input
            id="u-email"
            type="email"
            dir="ltr"
            className="field text-left"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <div>
          <label className="label" htmlFor="u-pass">
            كلمة مرور مؤقتة * (6 أحرف على الأقل)
          </label>
          <input
            id="u-pass"
            type="text"
            dir="ltr"
            className="field text-left"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1 text-[0.72rem] text-ink-400 dark:text-ink-500">
            سلّمها للموظف ليدخل بها — يمكنه تغييرها لاحقاً من صفحة نسيت كلمة المرور.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="u-phone">
            رقم الهاتف
          </label>
          <input
            id="u-phone"
            className="field text-left"
            dir="ltr"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xxxxxxxx"
          />
        </div>

        <div>
          <label className="label">الدور</label>
          <div className="grid grid-cols-2 gap-2">
            {(['employee', 'owner'] as Role[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`h-11 rounded-card border text-[0.9rem] font-bold transition
                  ${role === r
                    ? 'border-brand-500 bg-brand-500/12 text-brand-500'
                    : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
              >
                {ROLE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        {role === 'employee' ? (
          <Toggle label="يسمح له برؤية الأرباح" checked={canSeeProfit} onChange={setCanSeeProfit} />
        ) : null}
      </div>
    </Sheet>
  );
}
