'use client';

import { useEffect, useMemo, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { IconChevronDown, IconPlus, IconTrash } from '@/components/ui/Icons';
import { Sheet } from '@/components/ui/Sheet';
import { saveCategories } from '@/lib/db/categories';
import { errorMessage } from '@/lib/db/collections';
import { num } from '@/lib/format';
import { newCategoryId } from '@/lib/store/model';
import { BUILTIN_CATEGORIES, SIZE_KIND_LABEL, type CategoryDef, type Product, type SizeKind } from '@/lib/types';

/**
 * The shop's departments, owner-managed: add one for perfume or bags, rename,
 * set how it is sized, order them as the website menu should read, hide one
 * from the website. A category can be removed only while no product — not even
 * an archived one — uses it, so no sale ever points at a missing department.
 */
export function CategoryManager({
  open,
  onClose,
  categories,
  products,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryDef[];
  products: Product[];
}) {
  const actor = useActor();
  const toast = useToast();
  const [list, setList] = useState<CategoryDef[]>(categories);
  const [draft, setDraft] = useState('');
  const [draftKind, setDraftKind] = useState<SizeKind>('none');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setList(categories);
  }, [open, categories]);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return m;
  }, [products]);

  const patch = (id: string, p: Partial<CategoryDef>) => setList((l) => l.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const move = (i: number, dir: -1 | 1) =>
    setList((l) => {
      const j = i + dir;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  function add() {
    const name = draft.trim();
    if (!name) return;
    if (list.some((c) => c.name === name)) {
      toast.error('التصنيف دا موجود.');
      return;
    }
    setList((l) => [...l, { id: newCategoryId(name, l.map((c) => c.id)), name, sizeKind: draftKind, hidden: false }]);
    setDraft('');
  }

  async function save() {
    setBusy(true);
    try {
      await saveCategories(list, actor);
      toast.success('اتحفظت التصنيفات — بتظهر في الموقع خلال دقيقة');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر حفظ التصنيفات.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="التصنيفات"
      subtitle="أقسام المحل في البيع والمخزون وقائمة الموقع"
      footer={
        <Button block size="lg" variant="ink" loading={busy} onClick={() => void save()}>
          حفظ التصنيفات
        </Button>
      }
    >
      <ul className="surface rows overflow-hidden">
        {list.map((c, i) => {
          const used = usage.get(c.id) ?? 0;
          const builtin = BUILTIN_CATEGORIES.some((b) => b.id === c.id);
          return (
            <li key={c.id} className="flex items-start gap-2 p-3">
              <div className="flex shrink-0 flex-col gap-1">
                <button
                  type="button"
                  aria-label="لفوق"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  className="press flex h-9 w-9 items-center justify-center rounded-card border border-line-strong bg-surface text-fg-2 disabled:opacity-30"
                >
                  <IconChevronDown className="h-4 w-4 rotate-180" />
                </button>
                <button
                  type="button"
                  aria-label="لتحت"
                  disabled={i === list.length - 1}
                  onClick={() => move(i, 1)}
                  className="press flex h-9 w-9 items-center justify-center rounded-card border border-line-strong bg-surface text-fg-2 disabled:opacity-30"
                >
                  <IconChevronDown className="h-4 w-4" />
                </button>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  aria-label="اسم التصنيف"
                  className="field !min-h-[2.75rem] !py-2"
                  value={c.name}
                  maxLength={40}
                  onChange={(e) => patch(c.id, { name: e.target.value })}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="نوع المقاسات"
                    className="h-10 rounded-card border border-line-strong bg-surface px-2 text-[0.84rem] font-bold"
                    value={c.sizeKind}
                    onChange={(e) => patch(c.id, { sizeKind: e.target.value as SizeKind })}
                  >
                    {(Object.keys(SIZE_KIND_LABEL) as SizeKind[]).map((k) => (
                      <option key={k} value={k}>
                        {SIZE_KIND_LABEL[k].title}
                      </option>
                    ))}
                  </select>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[0.82rem] font-bold text-fg-2">
                    <input
                      type="checkbox"
                      checked={!c.hidden}
                      onChange={(e) => patch(c.id, { hidden: !e.target.checked })}
                      className="h-5 w-5 accent-[rgb(var(--fg))]"
                    />
                    في قائمة الموقع
                  </label>
                  <span className="tnum text-[0.78rem] text-fg-3">{used ? `${num(used)} منتج` : 'فاضي'}</span>
                </div>
              </div>
              {!builtin && used === 0 ? (
                <button
                  type="button"
                  aria-label={`احذف ${c.name}`}
                  onClick={() => setList((l) => l.filter((x) => x.id !== c.id))}
                  className="press flex h-11 w-11 shrink-0 items-center justify-center text-fg-3 hover:text-bad"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[0.76rem] text-fg-3">
        التصنيف اللي فيهو منتجات ما بيتحذف — انقل منتجاتو أو اقفلو من قائمة الموقع. «أحذية» و«ملابس» ثابتين وتقدر تغيّر اسمهم.
      </p>

      <div className="surface-sunken mt-4 p-3">
        <p className="label">تصنيف جديد</p>
        <div className="flex gap-2">
          <input
            className="field"
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="مثلاً: عطور، شنط، إكسسوارات، أطفال"
          />
          <Button variant="secondary" icon={<IconPlus className="h-4 w-4" />} onClick={add} disabled={!draft.trim()}>
            أضف
          </Button>
        </div>
        <div className="seg mt-2">
          {(Object.keys(SIZE_KIND_LABEL) as SizeKind[]).map((k) => (
            <button key={k} type="button" aria-pressed={draftKind === k} onClick={() => setDraftKind(k)}>
              {SIZE_KIND_LABEL[k].title}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[0.76rem] text-fg-3">{SIZE_KIND_LABEL[draftKind].hint}</p>
      </div>
    </Sheet>
  );
}
