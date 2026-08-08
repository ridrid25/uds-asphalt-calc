// ============================================================================
// App.tsx — общая обёртка калькулятора себестоимости и маржинальности АБС
// Расчёт асфальта · версия В3 · React + Tailwind + lucide-react
// Палитра «Нефть-зелёный» (Petrol)
// ============================================================================
import { useState, useEffect, useCallback } from 'react';
import {
  Moon, Sun, ClipboardList, Lock, Check, ChevronDown, Plus, RotateCcw, X,
} from 'lucide-react';
import {
  CATALOG, CATALOG_MAP, RECIPES, BASE_ORDER, CONFIG,
  GlobalSettings, CardInput, JournalEntry, MaterialKey,
  defaultSettings, defaultCards, makeCard, compute, toJournalEntry,
  invoiceText, telegramUrl, fmtNum, JOURNAL_LIMIT, uid,
} from './CalculatorEngine';
import CalculatorCard from './CalculatorCard';
import HistoryTable from './HistoryTable';
import Flash from './Flash';
import NumberInput from './NumberInput';

type Role = 'mgr' | 'admin';

const STORE_KEY = 'abc-data-v1';
const THEME_KEY = 'abc-theme';
const JOURNAL_KEY = 'abc-journal-v1';
const CARDS_KEY = 'abc-cards-v1';

export default function App() {
  const [settings, setSettings] = useState<GlobalSettings>(() => loadSettings());
  const [cards, setCards] = useState<CardInput[]>(() => loadCards());
  const [journal, setJournal] = useState<JournalEntry[]>(() => loadJournal());
  const [role, setRole] = useState<Role>('mgr');
  const [dark, setDark] = useState<boolean>(() => initTheme());

  const [engineId, setEngineId] = useState<string | null>(null); // открытый движок
  const [refKey, setRefKey] = useState<string | null | undefined>(undefined); // справочник: undefined=закрыт
  const [pinOpen, setPinOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { title: string; text: string; ok: string; cb: () => void }>(null);
  const [toast, setToast] = useState<null | { text: string; undo?: () => void }>(null);

  const isAdmin = role === 'admin';

  // ----- тема -----
  useEffect(() => {
    const el = document.documentElement;
    if (dark) el.classList.add('dark');
    else el.classList.remove('dark');
    try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch { /* noop */ }
  }, [dark]);

  // ----- сохранение ассортимента марок в этом браузере -----
  useEffect(() => {
    try { localStorage.setItem(CARDS_KEY, JSON.stringify(cards)); } catch { /* noop */ }
  }, [cards]);

  // ----- сохранение журнала расчётов в этом браузере -----
  useEffect(() => {
    try { localStorage.setItem(JOURNAL_KEY, JSON.stringify(journal)); } catch { /* noop */ }
  }, [journal]);

  // ----- тост авто-скрытие -----
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = useCallback((text: string, undo?: () => void) => setToast({ text, undo }), []);

  // ----- helpers состояния -----
  const patchCard = (id: string, patch: Partial<CardInput>) =>
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const setMatPrice = (key: MaterialKey, v: number) =>
    setSettings((s) => ({ ...s, matPrices: { ...s.matPrices, [key]: v } }));

  const engineCard = engineId ? cards.find((c) => c.id === engineId) || null : null;

  // ----- журнал -----
  const saveToJournal = (card: CardInput) => {
    const r = compute(card, settings);
    setJournal((j) => [toJournalEntry(card, r, settings), ...j].slice(0, JOURNAL_LIMIT));
    showToast(`Расчёт «${card.name}» сохранён в журнал`);
  };

  const sendInvoice = (e: JournalEntry) => {
    const txt = invoiceText(e, CONFIG);
    copyToClipboard(txt);
    try { window.open(telegramUrl(CONFIG), '_blank'); } catch { /* noop */ }
    showToast('Счёт скопирован — вставьте в чат с бухгалтером');
    // Для автоматической отправки ботом подключите бэкенд (см. README).
  };

  // ----- удаление марки с откатом -----
  const requestDeleteCard = (card: CardInput) => {
    setConfirm({
      title: 'Убрать марку из ассортимента?',
      text: `«${card.name}» исчезнет из расчёта. Сразу после удаления можно будет вернуть.`,
      ok: 'Убрать',
      cb: () => {
        const idx = cards.findIndex((c) => c.id === card.id);
        if (card.id === engineId) setEngineId(null);
        setCards((cs) => cs.filter((c) => c.id !== card.id));
        showToast(`Марка «${card.name}» убрана`, () => {
          setCards((cs) => {
            const arr = cs.slice();
            arr.splice(Math.min(idx, arr.length), 0, card);
            return arr;
          });
        });
      },
    });
  };

  // ----- роль / PIN -----
  const onRoleClick = () => {
    if (isAdmin) {
      setConfirm({
        title: 'Выйти из админа?', text: 'Цены снова будут защищены от изменений.', ok: 'Выйти',
        cb: () => setRole('mgr'),
      });
    } else {
      setPinOpen(true);
    }
  };

  const saveData = () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        matPrices: settings.matPrices, prodCosts: settings.prodCosts, target: settings.target,
      }));
      showToast('Цены сохранены в этом браузере');
    } catch { showToast('Не удалось сохранить (браузер блокирует хранилище)'); }
  };
  const resetData = () => {
    try { localStorage.removeItem(STORE_KEY); } catch { /* noop */ }
    showToast('Сохранение очищено');
  };

  return (
    <div className="min-h-screen bg-bg px-3 pb-16 pt-3.5 font-sans text-ink sm:px-5 sm:pt-6">
      <div className="mx-auto max-w-2xl">
        {/* Шапка */}
        <header className="header-mesh mb-3.5 flex items-center justify-between gap-2.5 overflow-hidden rounded-xl bg-brand px-3.5 py-3 text-brand-ink shadow-lift">
          <div>
            <h1 className="font-display text-[16px] font-bold uppercase tracking-[0.06em]">Калькулятор АБС</h1>
            <p className="mt-0.5 text-[11px] tracking-wide text-brand-ink/70">Себестоимость · маржа · скидка · В3</p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <button
              onClick={onRoleClick}
              className={`btn-tactile flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-wide ${
                isAdmin ? 'border-copper/70 bg-copper/30 text-brand-ink' : 'border-white/25 bg-white/10 text-brand-ink hover:bg-white/20'}`}
              title={isAdmin ? 'Нажмите, чтобы выйти' : 'Вход администратора (изменение цен)'}
            >
              {isAdmin ? <Check className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {isAdmin ? 'Админ' : 'Вход'}
            </button>
            <button onClick={() => setDark((d) => !d)} className="btn-tactile flex h-11 w-11 items-center justify-center rounded-lg border border-white/25 bg-white/10 text-brand-ink hover:bg-white/20" title="Светлая / тёмная тема" aria-label={dark ? 'Включить светлую тему' : 'Включить тёмную тему'} aria-pressed={dark}>
              {dark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button onClick={() => setRefKey(null)} className="btn-tactile flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-[11px] font-semibold text-brand-ink hover:bg-white/20">
              <ClipboardList className="h-3.5 w-3.5" /> Рецептуры
            </button>
          </div>
        </header>

        {/* 01 · Ассортимент */}
        <SectionLabel num="01" title="Ассортимент"
          right={
            <button
              onClick={() => {
                const all = cards.every((c) => c.collapsed);
                setCards((cs) => cs.map((c) => ({ ...c, collapsed: !all })));
              }}
              className="btn-tactile rounded-lg border border-line px-2.5 py-1.5 text-[11px] font-semibold text-muted hover:text-ink"
            >
              {cards.every((c) => c.collapsed) ? 'Развернуть всё' : 'Свернуть всё'}
            </button>
          }
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map((card) => (
            <CalculatorCard
              key={card.id}
              card={card}
              result={compute(card, settings)}
              settings={settings}
              selected={card.id === engineId}
              onPatch={(p) => patchCard(card.id, p)}
              onToggle={() => patchCard(card.id, { collapsed: !card.collapsed })}
              onOpenEngine={() => setEngineId(card.id)}
              onSave={() => saveToJournal(card)}
              onDelete={() => requestDeleteCard(card)}
              onOpenRef={(k) => setRefKey(k)}
            />
          ))}
        </div>
        <button
          onClick={() => setCards((cs) => [...cs, makeCard('Новая марка', [], null, false)])}
          className="btn-tactile mt-3.5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-dashed border-accent/50 bg-surface py-3.5 text-sm font-semibold text-accent hover:border-accent hover:bg-surface-2"
        >
          <Plus className="h-4 w-4" /> Добавить марку асфальтобетона
        </button>

        {/* 02 · Параметры модели */}
        <SectionLabel num="02" title="Параметры модели" hint="нажмите, чтобы раскрыть" />
        <FinanceSection settings={settings} setSettings={setSettings} />
        <RawSection settings={settings} isAdmin={isAdmin} setMatPrice={setMatPrice} onSave={saveData} onReset={() => setConfirm({ title: 'Сбросить сохранённое?', text: 'Цены и расходы вернутся к заводским при следующей загрузке.', ok: 'Сбросить', cb: resetData })} />
        <ProdSection settings={settings} setSettings={setSettings} isAdmin={isAdmin} />

        {/* 03 · Журнал */}
        <SectionLabel num="03" title="Журнал расчётов" />
        <HistoryTable
          journal={journal}
          target={settings.target}
          onTelegram={sendInvoice}
          onDelete={(id) => setJournal((j) => j.filter((e) => e.id !== id))}
          onClear={() => setConfirm({ title: 'Очистить журнал?', text: 'Все сохранённые расчёты будут удалены.', ok: 'Очистить', cb: () => setJournal([]) })}
        />
      </div>

      {/* Движок (bottom sheet) */}
      {engineCard && (
        <EngineSheet
          card={engineCard}
          settings={settings}
          isAdmin={isAdmin}
          onDisc={(v) => patchCard(engineCard.id, { disc: v })}
          onMatPrice={setMatPrice}
          onSave={() => { saveToJournal(engineCard); setEngineId(null); }}
          onClose={() => setEngineId(null)}
        />
      )}

      {/* Справочник рецептур */}
      {refKey !== undefined && <RefDrawer initial={refKey} onClose={() => setRefKey(undefined)} />}

      {/* Модалка PIN */}
      {pinOpen && (
        <PinModal
          onClose={() => setPinOpen(false)}
          onOk={(v) => {
            if (v === CONFIG.ADMIN_PIN) { setRole('admin'); setPinOpen(false); showToast('Режим администратора включён'); return true; }
            return false;
          }}
        />
      )}

      {/* Модалка подтверждения */}
      {confirm && (
        <Modal onClose={() => setConfirm(null)} label={confirm.title}>
          <h3 className="mb-1.5 font-display text-[15px] font-semibold tracking-tight">{confirm.title}</h3>
          <p className="mb-3.5 text-[12.5px] text-muted">{confirm.text}</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button onClick={() => setConfirm(null)} className="btn-tactile min-h-[44px] rounded-lg border border-line bg-surface py-3 text-sm font-semibold text-ink hover:bg-surface-2">Отмена</button>
            <button onClick={() => { confirm.cb(); setConfirm(null); }} className="btn-tactile btn-cta min-h-[44px] rounded-lg bg-accent py-3 text-sm font-semibold text-accent-ink">{confirm.ok}</button>
          </div>
        </Modal>
      )}

      {/* Тост */}
      {toast && (
        <div role="status" aria-live="polite" className="fixed inset-x-3 bottom-3.5 z-[60] flex animate-toast-up items-center justify-between gap-3 rounded-xl bg-accent px-3.5 py-3 text-sm text-accent-ink shadow-lift sm:left-auto sm:right-5 sm:w-96">
          <span>{toast.text}</span>
          {toast.undo && (
            <button onClick={() => { toast.undo!(); setToast(null); }} className="btn-tactile flex-none rounded-lg border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-semibold">Вернуть</button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Вспомогательные секции и компоненты
// ============================================================================

function SectionLabel({ num, title, hint, right }: { num: string; title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-2.5 mt-5 flex items-center font-display text-xs font-semibold uppercase tracking-wider first:mt-0.5">
      <span aria-hidden="true" className="mr-2.5 inline-flex h-5 w-5 items-center justify-center rounded bg-brand text-[11px] text-brand-ink">{num}</span>
      {title}
      {hint && <span className="ml-auto font-sans text-[11px] font-normal normal-case tracking-normal text-muted">{hint}</span>}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-2.5 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="tap flex min-h-[44px] w-full items-center justify-between bg-surface-2 px-3.5 py-3 text-left font-display text-xs font-semibold uppercase tracking-wide text-ink hover:bg-line/40">
        <span>{title}</span>
        <ChevronDown aria-hidden="true" className={`tap h-3.5 w-3.5 text-muted ${open ? '' : '-rotate-90'}`} />
      </button>
      <div className={`reveal ${open ? 'open' : ''}`}>
        <div className="reveal-inner">
          <div className="p-3.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, unit, value, onChange, readOnly }: { label: string; unit: string; value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  return (
    <label className="flex flex-col">
      <span className="mb-1.5 text-xs text-muted">{label}</span>
      <div className="relative flex items-center">
        <NumberInput
          value={value}
          readOnly={readOnly}
          onChange={(v) => onChange?.(v)}
          className={`tap w-full rounded-lg border py-2.5 pl-3 pr-10 font-mono text-base outline-none ${readOnly ? 'cursor-not-allowed border-line bg-surface-2 text-muted' : 'border-line bg-surface text-ink focus:border-accent focus:ring-2 focus:ring-accent/15'}`}
        />
        <span className="pointer-events-none absolute right-3 font-mono text-xs text-muted">{unit}</span>
      </div>
    </label>
  );
}

function Seg({ options, value, onChange }: { options: { v: number; label: string }[]; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-accent/40">
      {options.map((o, i) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`tap min-h-[44px] flex-1 py-2.5 text-xs font-semibold ${i > 0 ? 'border-l border-accent/40' : ''} ${
            value === o.v ? 'bg-accent text-accent-ink' : 'bg-surface text-ink hover:bg-surface-2'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FinanceSection({ settings, setSettings }: { settings: GlobalSettings; setSettings: React.Dispatch<React.SetStateAction<GlobalSettings>> }) {
  return (
    <Collapsible title="Финансы и логистика">
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col">
          <span className="mb-1.5 text-xs text-muted">Режим налогообложения</span>
          <Seg options={[{ v: 0, label: 'Без НДС' }, { v: 1, label: 'С НДС 22%' }]} value={settings.vat ? 1 : 0} onChange={(v) => setSettings((s) => ({ ...s, vat: v === 1 }))} />
        </label>
        <Field label="Целевая маржа" unit="%" value={settings.target} onChange={(v) => setSettings((s) => ({ ...s, target: v }))} />
      </div>
      <div className="mt-3">
        <span className="mb-1.5 block text-xs text-muted">Логистика</span>
        <Seg options={[{ v: 0, label: 'Самовывоз' }, { v: 1, label: 'Доставка рейсами' }]} value={settings.delivery ? 1 : 0} onChange={(v) => setSettings((s) => ({ ...s, delivery: v === 1 }))} />
      </div>
      {settings.delivery && (
        <div className="mt-3 grid grid-cols-2 gap-3 animate-fade-in">
          <Field label="Вместимость самосвала" unit="т" value={settings.capacity} onChange={(v) => setSettings((s) => ({ ...s, capacity: v }))} />
          <Field label="Стоимость одного рейса" unit="₽" value={settings.tripCost} onChange={(v) => setSettings((s) => ({ ...s, tripCost: v }))} />
        </div>
      )}
    </Collapsible>
  );
}

function RawSection({ settings, isAdmin, setMatPrice, onSave, onReset }: { settings: GlobalSettings; isAdmin: boolean; setMatPrice: (k: MaterialKey, v: number) => void; onSave: () => void; onReset: () => void }) {
  const groups = Array.from(new Set(CATALOG.map((m) => m.group)));
  return (
    <Collapsible title="Сырьё · цена за тонну">
      {!isAdmin && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-3 py-2.5 text-[11.5px] text-muted">
          <Lock className="h-3.5 w-3.5" /> Цены меняет только администратор. Нажмите «Вход» вверху.
        </div>
      )}
      {groups.map((g) => (
        <div key={g}>
          <div className="mb-2.5 mt-4 border-t border-line pt-3.5 font-display text-[11px] font-semibold uppercase tracking-wide text-muted first:mt-0 first:border-0 first:pt-0">{g}</div>
          <div className="flex flex-col gap-3">
            {CATALOG.filter((m) => m.group === g).map((m) => (
              <Field key={m.key} label={m.name} unit="₽/т" value={settings.matPrices[m.key]} readOnly={!isAdmin} onChange={(v) => setMatPrice(m.key, v)} />
            ))}
          </div>
        </div>
      ))}
      {isAdmin && (
        <div className="mt-4 grid grid-cols-[2fr_1fr] gap-2.5">
          <button onClick={onSave} className="btn-tactile btn-cta min-h-[44px] rounded-lg bg-accent py-3 text-sm font-semibold text-accent-ink">Сохранить цены</button>
          <button onClick={onReset} className="btn-tactile flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-line py-3 text-sm font-semibold text-ink hover:border-accent"><RotateCcw className="h-4 w-4" /> Сброс</button>
        </div>
      )}
    </Collapsible>
  );
}

function ProdSection({ settings, setSettings, isAdmin }: { settings: GlobalSettings; setSettings: React.Dispatch<React.SetStateAction<GlobalSettings>>; isAdmin: boolean }) {
  const update = (id: string, patch: Partial<{ name: string; val: number }>) =>
    setSettings((s) => ({ ...s, prodCosts: s.prodCosts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const remove = (id: string) => setSettings((s) => ({ ...s, prodCosts: s.prodCosts.filter((p) => p.id !== id) }));
  const add = () => setSettings((s) => ({ ...s, prodCosts: [...s.prodCosts, { id: uid(), name: 'Новый расход', val: 0 }] }));
  return (
    <Collapsible title="Производство · расходы на тонну">
      {!isAdmin && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-dashed border-line bg-surface-2 px-3 py-2.5 text-[11.5px] text-muted">
          <Lock className="h-3.5 w-3.5" /> Расходы меняет только администратор.
        </div>
      )}
      <div className="flex flex-col gap-3">
        {settings.prodCosts.map((p) => (
          <div key={p.id} className="flex flex-col">
            <div className="mb-1.5 flex items-center justify-between">
              <input value={p.name} readOnly={!isAdmin} onChange={(e) => update(p.id, { name: e.target.value })}
                className="tap w-3/5 border-b border-dashed border-transparent bg-transparent text-xs text-muted outline-none focus:border-accent/50" />
              {isAdmin && <button onClick={() => remove(p.id)} aria-label={`Удалить расход «${p.name}»`} className="btn-tactile flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-zone-red hover:border-zone-red/50"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}
            </div>
            <div className="relative flex items-center">
              <NumberInput value={p.val} readOnly={!isAdmin} onChange={(v) => update(p.id, { val: v })}
                className={`tap w-full rounded-lg border py-2.5 pl-3 pr-10 font-mono text-base outline-none ${isAdmin ? 'border-line bg-surface text-ink focus:border-accent focus:ring-2 focus:ring-accent/15' : 'cursor-not-allowed border-line bg-surface-2 text-muted'}`} />
              <span className="pointer-events-none absolute right-3 font-mono text-xs text-muted">₽/т</span>
            </div>
          </div>
        ))}
      </div>
      {isAdmin && (
        <button onClick={add} className="btn-tactile mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-accent/50 bg-surface py-2.5 text-xs font-semibold text-accent hover:border-accent"><Plus className="h-4 w-4" /> Добавить вид расхода</button>
      )}
    </Collapsible>
  );
}

// ----- Движок (bottom sheet) -----
function EngineSheet({ card, settings, isAdmin, onDisc, onMatPrice, onSave, onClose }:
  { card: CardInput; settings: GlobalSettings; isAdmin: boolean; onDisc: (v: number) => void; onMatPrice: (k: MaterialKey, v: number) => void; onSave: () => void; onClose: () => void }) {
  const r = compute(card, settings);
  const ref = card.refKey ? RECIPES[card.refKey] : null;
  const usedMats = Array.from(new Set(card.recipe.map((it) => it[0])));

  const chip = (k: string, v: string, tone?: 'pos' | 'neg' | 'gold') => (
    <div className="min-w-0 rounded-lg border border-line bg-surface-2 px-2.5 py-2">
      <span className="block truncate text-[9.5px] tracking-wide text-muted">{k}</span>
      <Flash value={v} className={`mt-0.5 block whitespace-nowrap font-mono text-[13px] font-semibold ${tone === 'pos' ? 'text-zone-green' : tone === 'neg' ? 'text-zone-red' : tone === 'gold' ? 'text-copper' : 'text-ink'}`}>{v}</Flash>
    </div>
  );

  // карта торга
  const maxD = Math.min(Math.max(Math.ceil((r.dToBe + 8) / 5) * 5, 25), 70) || 25;
  const clamp = (x: number) => Math.max(0, Math.min(maxD, x));
  const wG = (clamp(r.dToTarget) / maxD) * 100;
  const wY = (Math.max(0, clamp(r.dToBe) - clamp(r.dToTarget)) / maxD) * 100;
  const wR = Math.max(0, 100 - wG - wY);
  const pos = (clamp(r.disc) / maxD) * 100;
  const zoneLabel = { green: 'Зелёная — держим цель', yellow: 'Жёлтая — ниже цели', red: 'Красная — убыток' }[r.zone];

  return (
    <>
      <div className="fixed inset-0 z-40 animate-fade-in bg-petrol/50 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={`Движок марки «${card.name}»`} className="fixed inset-x-0 bottom-0 z-50 flex max-h-[78vh] animate-sheet-up flex-col rounded-t-2xl border-t border-line bg-surface text-ink shadow-sheet sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[480px] sm:rounded-2xl">
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 flex-none rounded bg-line" />
        <div className="flex flex-none items-start justify-between gap-2.5 border-b border-line px-4 pb-3 pt-2.5">
          <div>
            <div className="font-display text-[15px] font-semibold tracking-tight">{card.name}</div>
            <div className="mt-0.5 text-[11px] text-muted">{ref ? `${ref.gost} · ${ref.bitum}` : 'без рецептуры'}</div>
          </div>
          <button onClick={onClose} aria-label="Закрыть движок" className="btn-tactile flex h-9 w-9 flex-none items-center justify-center rounded-lg border border-line bg-surface-2"><X className="h-4.5 w-4.5" aria-hidden="true" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3.5">
          {/* чипсы */}
          <div className="mb-4 grid grid-cols-3 gap-1.5">
            {chip('Сырьё, ₽/т', fmtNum(r.rawPerTon))}
            {chip('Маржа', fmtNum(r.margin, 1) + '%', r.margin >= settings.target ? 'pos' : 'neg')}
            {chip('Прибыль', fmtNum(r.profit), r.profit >= 0 ? 'pos' : 'neg')}
            {chip('Цена/т', fmtNum(r.priceGross))}
            {chip('До цели', r.remTarget > 0 ? fmtNum(r.remTarget, 1) + '%' : 'нет', r.remTarget > 0 ? 'pos' : 'neg')}
            {chip('До нуля', r.remBe > 0 ? fmtNum(r.remBe, 1) + '%' : 'убыток', r.remBe > 0 ? 'gold' : 'neg')}
          </div>

          {/* карта торга */}
          <div className="rounded-xl border border-line bg-surface-2 p-3 shadow-card">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="font-display text-[11px] font-semibold uppercase tracking-wider text-muted">Карта торга · скидка от прайса</span>
              <span className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${r.zone === 'green' ? 'bg-zone-green/15 text-zone-green' : r.zone === 'yellow' ? 'bg-zone-yellow/15 text-zone-yellow' : 'bg-zone-red/15 text-zone-red'}`}>{zoneLabel}</span>
            </div>
            <div className="relative flex h-3.5 overflow-hidden rounded-full bg-line">
              <div className="bg-zone-green tap" style={{ width: `${wG}%` }} />
              <div className="bg-zone-yellow tap" style={{ width: `${wY}%` }} />
              <div className="bg-zone-red tap" style={{ width: `${wR}%` }} />
              <div className="absolute -top-1 bottom-[-4px] w-0.5 bg-copper transition-[left] duration-200 ease-smooth" style={{ left: `${pos}%` }}>
                <span className="absolute -left-1.5 -top-2 h-3.5 w-3.5 rounded-full border-2 border-surface bg-copper shadow-[0_1px_3px_rgba(0,0,0,0.35)]" />
              </div>
            </div>
            <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted"><span>0 %</span><span>{fmtNum(maxD)} %</span></div>
            <div className="mt-2.5 flex flex-col gap-1.5 text-xs">
              <div className="flex justify-between"><span className="text-muted">Скидка без потери цели</span><span className="font-mono font-semibold text-zone-green">{r.dToTarget >= 0 ? `до ${fmtNum(r.dToTarget, 1)} %` : 'недоступно'}</span></div>
              <div className="flex justify-between"><span className="text-muted">Скидка до нуля прибыли</span><span className="font-mono font-semibold text-copper">{r.dToBe >= 0 ? `до ${fmtNum(r.dToBe, 1)} %` : 'уже убыток'}</span></div>
            </div>
            <div className="mt-2 font-mono text-[10.5px] text-muted">Границы: цель {isFinite(r.pTgt) ? fmtNum(r.pTgt) : '—'} ₽/т · ноль {fmtNum(r.pBe)} ₽/т</div>
            <div className="mt-2.5 border-t border-dashed border-line pt-2 text-xs text-ink">Сейчас: скидка {fmtNum(r.disc, 1)} % → цена {fmtNum(r.priceGross)} ₽/т, маржа <b>{fmtNum(r.margin, 1)} %</b></div>
          </div>

          {/* ползунок скидки + ручной ввод */}
          <div className="mt-4 font-display text-[11px] font-semibold uppercase tracking-wider text-muted">Скидка от прайса</div>
          <div className="mt-3.5">
            <div className="mb-2 flex items-center justify-between gap-2.5 text-[12.5px]">
              <span className="text-ink">Скидка, %</span>
              <NumberInput value={card.disc}
                onChange={onDisc}
                className="tap w-20 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-right font-mono text-sm text-ink outline-none focus:border-copper" />
            </div>
            <input type="range" min={-15} max={60} step={0.5} value={card.disc}
              onChange={(e) => onDisc(parseFloat(e.target.value))}
              className="range-petrol w-full cursor-pointer" />
          </div>

          <div className="my-4 h-px bg-line" />

          {/* ползунки сырья — только админ */}
          {usedMats.length > 0 && isAdmin ? (
            <>
              <div className="mb-3.5 font-display text-[11px] font-semibold uppercase tracking-wider text-muted">Цена сырья марки, ₽/т (админ)</div>
              {usedMats.map((key) => {
                const m = CATALOG_MAP[key];
                return (
                  <div key={key} className="mb-4">
                    <div className="mb-2 flex items-center justify-between gap-2.5 text-[12.5px]">
                      <span className="text-ink">{m.name}</span>
                      <NumberInput value={settings.matPrices[key]}
                        onChange={(v) => onMatPrice(key, v)}
                        className="tap w-24 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-right font-mono text-sm text-ink outline-none focus:border-copper" />
                    </div>
                    <input type="range" min={m.min} max={m.max} step={m.step} value={settings.matPrices[key]}
                      onChange={(e) => onMatPrice(key, parseFloat(e.target.value))}
                      className="range-petrol w-full cursor-pointer" />
                  </div>
                );
              })}
            </>
          ) : usedMats.length > 0 ? (
            <p className="mb-3.5 text-[11px] leading-relaxed text-muted">Цены сырья меняет администратор. Здесь вы играете скидкой — себестоимость считается по текущим закупочным ценам.</p>
          ) : (
            <p className="mb-3.5 text-[11px] leading-relaxed text-muted">У этой марки не задана рецептура. Возьмите марку из базового ассортимента.</p>
          )}

          <p className="text-[11px] leading-relaxed text-muted">Скидка применяется к марке сразу — закройте кнопкой «Готово» внизу или сохраните расчёт в журнал. Цены сырья общие для всех марок (меняет админ).</p>
        </div>

        {/* нижняя панель */}
        <div className="grid flex-none grid-cols-2 gap-2.5 border-t border-line bg-surface-2 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
          <button onClick={onSave} className="btn-tactile min-h-[44px] rounded-lg border border-line bg-surface py-3.5 text-sm font-semibold text-ink hover:bg-surface-2">Сохранить в журнал</button>
          <button onClick={onClose} className="btn-tactile btn-cta min-h-[44px] rounded-lg bg-accent py-3.5 text-sm font-semibold text-accent-ink">Готово</button>
        </div>
      </div>
    </>
  );
}

// ----- Справочник рецептур -----
function RefDrawer({ initial, onClose }: { initial: string | null; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(initial);
  return (
    <div className="fixed inset-0 z-[55] animate-fade-in bg-petrol/55 backdrop-blur-[2px]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Справочник рецептур" className="absolute inset-0 flex flex-col bg-bg sm:left-auto sm:w-[560px] sm:border-l sm:border-line sm:shadow-sheet">
        <div className="header-mesh flex flex-none items-center justify-between bg-brand px-4 py-4 text-brand-ink">
          <h2 className="font-display text-sm font-semibold uppercase tracking-[0.06em]">Справочник рецептур</h2>
          <button onClick={onClose} aria-label="Закрыть справочник" className="btn-tactile flex h-9 w-9 items-center justify-center rounded-lg border border-white/25 bg-white/10"><X className="h-4.5 w-4.5" aria-hidden="true" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 pb-10">
          {BASE_ORDER.map((key) => {
            const d = RECIPES[key];
            const sum = d.rows.reduce((s, r) => s + r.kg, 0);
            const isOpen = open === key;
            return (
              <div key={key} className={`tap mb-2.5 overflow-hidden rounded-xl border bg-surface shadow-card ${isOpen ? 'border-accent' : 'border-line'}`}>
                <button onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} className="tap flex w-full items-center gap-2.5 px-3.5 py-3 text-left hover:bg-surface-2">
                  <span className="flex-1">
                    <span className="font-display text-sm font-semibold tracking-tight text-ink">{d.name}</span>
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      <Badge dark>{d.gost}</Badge>
                      <Badge>{d.bitum}</Badge>
                      {d.density !== '—' && <Badge>ρ {d.density}</Badge>}
                    </span>
                  </span>
                  <ChevronDown aria-hidden="true" className={`tap h-3.5 w-3.5 flex-none text-muted ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <div className={`reveal ${isOpen ? 'open' : ''}`}>
                  <div className="reveal-inner">
                    <div className="border-t border-line px-3.5 py-3.5">
                      <div className="mb-2.5 text-[11px] text-muted">Слой: {d.layer} · нормы расхода в кг на 1 т готовой смеси (с битумом).</div>
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="border-b border-line bg-surface-2 px-2 py-1.5 text-left text-[10.5px] font-medium text-ink">Материал</th>
                            <th className="border-b border-line bg-surface-2 px-2 py-1.5 text-right font-mono text-[10.5px] text-ink">кг/т</th>
                            <th className="border-b border-line bg-surface-2 px-2 py-1.5 text-left text-[10.5px] text-ink">Источник ДСМ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.rows.map((row, i) => (
                            <tr key={i}>
                              <td className="border-b border-line/60 px-2 py-1.5 text-xs text-ink">{row.label}</td>
                              <td className="border-b border-line/60 px-2 py-1.5 text-right font-mono text-xs text-ink">{fmtNum(row.kg, row.kg % 1 ? 1 : 0)}</td>
                              <td className="border-b border-line/60 px-2 py-1.5 text-[11px] text-muted">{row.source}</td>
                            </tr>
                          ))}
                          <tr>
                            <td className="border-t border-accent bg-surface-2 px-2 py-1.5 text-xs font-bold text-ink">Итого на 1 т</td>
                            <td className="border-t border-accent bg-surface-2 px-2 py-1.5 text-right font-mono text-xs font-bold text-ink">{fmtNum(sum, sum % 1 ? 1 : 0)}</td>
                            <td className="border-t border-accent bg-surface-2" />
                          </tr>
                        </tbody>
                      </table>
                      {/* Оригиналы документов: добавьте фото в /public и подставьте src. */}
                      <p className="mt-3 text-[11px] text-muted">Оригинал документа можно приложить как изображение (public/recipes/{key}.jpg).</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Badge({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] tracking-wide ${dark ? 'bg-accent text-accent-ink' : 'border border-line bg-surface-2 text-muted'}`}>{children}</span>
  );
}

// ----- Модалки -----
function Modal({ children, onClose, label }: { children: React.ReactNode; onClose: () => void; label?: string }) {
  return (
    <div className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-petrol/55 p-5 backdrop-blur-[2px]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={label} className="w-full max-w-sm animate-rise-in rounded-2xl border border-line bg-surface p-5 shadow-lift">{children}</div>
    </div>
  );
}

function PinModal({ onOk, onClose }: { onOk: (v: string) => boolean; onClose: () => void }) {
  const [v, setV] = useState('');
  const [err, setErr] = useState('');
  const submit = () => { if (!onOk(v)) setErr('Неверный PIN'); };
  return (
    <Modal onClose={onClose} label="Вход администратора">
      <h3 className="mb-1.5 font-display text-[15px] font-semibold tracking-tight">Вход администратора</h3>
      <p className="mb-3.5 text-[12.5px] text-muted">Введите PIN, чтобы менять закупочные цены и сохранять данные. Это простая защита от случайных правок — не используйте важные пароли.</p>
      <input
        type="password" inputMode="numeric" maxLength={8} autoFocus value={v}
        onChange={(e) => { setV(e.target.value); setErr(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="••••"
        className="tap mb-3.5 w-full rounded-lg border border-line bg-surface-2 px-3 py-3 text-center font-mono text-xl tracking-[0.3em] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
      />
      {err && <div className="mb-3 text-xs text-zone-red">{err}</div>}
      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={onClose} className="btn-tactile min-h-[44px] rounded-lg border border-line bg-surface py-3 text-sm font-semibold text-ink hover:bg-surface-2">Отмена</button>
        <button onClick={submit} className="btn-tactile btn-cta min-h-[44px] rounded-lg bg-accent py-3 text-sm font-semibold text-accent-ink">Войти</button>
      </div>
    </Modal>
  );
}

// ----- утилиты -----
function copyToClipboard(t: string) {
  try {
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(t); return; }
  } catch { /* noop */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  } catch { /* noop */ }
}

function loadSettings(): GlobalSettings {
  const s = defaultSettings();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return s;
    const d = JSON.parse(raw);
    if (d.matPrices) for (const k in d.matPrices) if (s.matPrices[k as MaterialKey] != null) s.matPrices[k as MaterialKey] = d.matPrices[k];
    if (Array.isArray(d.prodCosts) && d.prodCosts.length) s.prodCosts = d.prodCosts.map((p: { name: string; val: number }) => ({ id: uid(), name: p.name, val: p.val }));
    if (d.target != null) s.target = d.target;
  } catch { /* noop */ }
  return s;
}

// Восстановить ассортимент марок из браузера; при отсутствии/сбое — заводской.
function loadCards(): CardInput[] {
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    if (!raw) return defaultCards();
    const d = JSON.parse(raw);
    if (!Array.isArray(d)) return defaultCards();
    const ok = d.every((c) =>
      c && typeof c.id === 'string' && typeof c.name === 'string'
      && Array.isArray(c.recipe) && typeof c.volume === 'number'
      && typeof c.basePrice === 'number' && typeof c.disc === 'number');
    if (!ok) return defaultCards();
    // Свежий id для каждой карточки: счётчик uid() при перезагрузке начинается
    // заново, поэтому переиспользование старых id могло бы столкнуться с id
    // новых карточек (дубли ключей React). Пересоздаём — id эфемерны.
    return d.map((c: CardInput) => ({
      id: uid(), name: c.name,
      recipe: c.recipe.map((r) => [r[0], r[1]] as [MaterialKey, number]),
      refKey: c.refKey ?? null,
      volume: c.volume, basePrice: c.basePrice, disc: c.disc,
      collapsed: !!c.collapsed,
    }));
  } catch { /* noop */ }
  return defaultCards();
}

// Восстановить журнал расчётов из браузера (ограничен тем же лимитом).
function loadJournal(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return [];
    const d = JSON.parse(raw);
    if (!Array.isArray(d)) return [];
    return d
      .filter((e) => e && typeof e.id === 'string' && typeof e.name === 'string' && typeof e.margin === 'number')
      .slice(0, JOURNAL_LIMIT);
  } catch { /* noop */ }
  return [];
}

function initTheme(): boolean {
  try {
    const sp = localStorage.getItem(THEME_KEY);
    if (sp === 'dark') return true;
    if (sp === 'light') return false;
  } catch { /* noop */ }
  return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false;
}
