import React, { useState, useEffect, useRef } from "react";

// ─── DATA ────────────────────────────────────────────────────────────────────

const IMPROVEMENTS = [
  // ── АВТОМАТИЗАЦИЯ ──────────────────────────────────────────────────────────
  {
    id: "onboarding",
    category: "automation",
    priority: "critical",
    effort: "M",
    impact: 10,
    title: "Авто-онбординг за 3 минуты",
    problem: "Сейчас клиент должен вручную настраивать таблицы, называть листы строго «Доходы», «Расходы» — это барьер входа.",
    solution: "Бот присылает готовый Google Sheet-шаблон одной кнопкой. Клиент только вставляет свои данные. Бот сам находит нужные листы через fuzzy matching.",
    psych: "Эффект нулевого трения — чем быстрее первый результат, тем выше вероятность остаться",
    techNote: "gspread.create() + шаблон-файл в Google Drive. Fuzzy match через rapidfuzz.",
    tags: ["onboarding", "ux", "retention"],
  },
  {
    id: "healthscore",
    category: "automation",
    priority: "critical",
    effort: "M",
    impact: 10,
    title: "Финансовый Health Score (0–100)",
    problem: "Клиент видит цифры, но не понимает — это хорошо или плохо? Маржа 18% — норма для его отрасли или катастрофа?",
    solution: "Единый балл здоровья бизнеса. Считается автоматически каждый день по 6 метрикам с весами. Цвет: красный / жёлтый / зелёный. Динамика за 4 недели.",
    psych: "Геймификация + потребность в контроле. Собственник проверяет счёт как шаги в фитнес-трекере",
    techNote: "score = weighted_avg(margin_score, cashflow_score, dz_score, growth_score, expense_score, runway_score). Хранить в БД ежедневно.",
    tags: ["analytics", "gamification", "retention"],
  },
  {
    id: "smart_alerts",
    category: "automation",
    priority: "critical",
    effort: "S",
    impact: 9,
    title: "Умные алерты с контекстом",
    problem: "Текущие алерты: «Касса низкая». Клиент не знает почему и что делать прямо сейчас.",
    solution: "Каждый алерт содержит: (1) что случилось, (2) почему (анализ причины), (3) конкретное действие на сегодня, (4) срок. Claude генерирует объяснение автоматически.",
    psych: "Снятие тревоги через определённость. Человек паникует от непонимания, спокоен от плана",
    techNote: "alerts.py → передавать контекст в Claude с промптом «объясни причину и дай 1 конкретный шаг»",
    tags: ["alerts", "ai", "ux"],
  },
  {
    id: "weekly_narrative",
    category: "automation",
    priority: "high",
    effort: "S",
    impact: 9,
    title: "Отчёт как история, не таблица",
    problem: "Еженедельный отчёт сейчас — список цифр. Собственник читает его по диагонали и не запоминает.",
    solution: "Claude генерирует 3–4 предложения нарратива: «На этой неделе бизнес вырос на 12%. Главный риск — ДЗ от Петрова (60 дней). Одно действие: позвонить ему сегодня.»",
    psych: "Нарративное мышление — люди запоминают истории, не цифры. История = эмоция = действие",
    techNote: "formatter.py → добавить narrative_summary(metrics, prev_metrics) через Claude",
    tags: ["reporting", "ai", "engagement"],
  },
  {
    id: "predictive",
    category: "automation",
    priority: "high",
    effort: "L",
    impact: 8,
    title: "Прогноз на 30/60/90 дней",
    problem: "Бот живёт в настоящем. Собственнику нужно видеть будущее чтобы принимать решения сейчас.",
    solution: "На основе исторических данных строить прогноз кассы и выручки. Три сценария: оптимистичный / базовый / пессимистичный. Обновляется автоматически раз в неделю.",
    psych: "Иллюзия контроля над будущим снижает тревогу и повышает ценность продукта",
    techNote: "Линейная регрессия или скользящее среднее. pandas + scipy.stats.linregress. Хранить сценарии в БД.",
    tags: ["analytics", "forecasting", "ai"],
  },
  {
    id: "auto_dz",
    category: "automation",
    priority: "high",
    effort: "M",
    impact: 8,
    title: "Авто-напоминания по ДЗ",
    problem: "Бот видит просроченную дебиторку, но менеджер всё равно должен сам звонить клиентам.",
    solution: "Бот автоматически формирует список звонков на сегодня с приоритетом по сумме и сроку. Отправляет менеджеру в 9:00. После созвона менеджер отмечает статус прямо в боте.",
    psych: "Принцип следующего шага — конкретное действие снимает прокрастинацию",
    techNote: "scheduler.py → задача в 9:00, inline-кнопки «Позвонил / Обещал заплатить / Спорная»",
    tags: ["automation", "dz", "workflow"],
  },

  // ── ПСИХОЛОГИЯ / UX ────────────────────────────────────────────────────────
  {
    id: "first_win",
    category: "psychology",
    priority: "critical",
    effort: "S",
    impact: 10,
    title: "«Первая победа» за 5 минут",
    problem: "После подключения клиент видит... ничего особенного. Момент wow упущен.",
    solution: "Сразу после подключения данных бот присылает мини-инсайт: «Я проанализировал ваши данные. Вот кое-что важное, что я нашёл за 30 секунд» + 3 факта о бизнесе клиента. Первый — всегда позитивный.",
    psych: "Эффект первого впечатления + дофамин от быстрого результата. Именно этот момент определяет останется клиент или нет",
    techNote: "После connect → немедленно вызвать analyze_first_impression(data) → Claude с промптом найти позитив первым",
    tags: ["onboarding", "psychology", "retention"],
  },
  {
    id: "personal_name",
    category: "psychology",
    priority: "high",
    effort: "XS",
    impact: 7,
    title: "Бот знает клиента по имени и помнит детали",
    problem: "Бот общается безлично. Клиент чувствует что разговаривает с машиной.",
    solution: "При онбординге спросить имя и название компании. Бот всегда использует имя. Запоминает предпочтения: «в прошлый раз вы спрашивали о марже — хотите обновлённые данные?»",
    psych: "Эффект собственного имени — люди физиологически реагируют на своё имя. Персонализация = доверие",
    techNote: "clients таблица: добавить owner_name, preferences JSON. Промпт всегда включает имя.",
    tags: ["psychology", "personalization", "ux"],
  },
  {
    id: "progress_milestones",
    category: "psychology",
    priority: "medium",
    effort: "M",
    impact: 7,
    title: "Достижения и прогресс бизнеса",
    problem: "Позитивные события проходят незамеченными. Бот только сообщает о проблемах.",
    solution: "Бот отмечает финансовые milestone: «Поздравляю! Впервые за 3 месяца маржа превысила 25%», «Рекордная выручка за неделю», «ДЗ снизилась до исторического минимума».",
    psych: "Положительное подкрепление + прогресс-мотивация. Клиент ассоциирует успех бизнеса с продуктом",
    techNote: "alerts.py → тип MILESTONE. Проверять исторические рекорды в БД при каждом обновлении данных.",
    tags: ["psychology", "gamification", "engagement"],
  },
  {
    id: "tone_adapt",
    category: "psychology",
    priority: "medium",
    effort: "M",
    impact: 6,
    title: "Адаптивный тон под настроение клиента",
    problem: "Бот всегда одинаково спокойный. Когда у клиента кризис — это раздражает.",
    solution: "Claude определяет тональность сообщения клиента. Если тревога/паника — бот сначала признаёт ситуацию («Понимаю, это серьёзно»), потом даёт план. Если всё хорошо — краткий позитивный ответ.",
    psych: "Зеркальная эмпатия — сначала почувствовать вместе, потом решать. Иначе советы не слышат",
    techNote: "claude_client.py → sentiment detection в препроцессинге. Системный промпт: «Сначала acknowledge эмоцию, потом факты»",
    tags: ["psychology", "ai", "ux"],
  },
  {
    id: "weekly_question",
    category: "psychology",
    priority: "medium",
    effort: "XS",
    impact: 6,
    title: "Еженедельный вопрос-провокатор",
    problem: "Клиент пассивно получает отчёты. Вовлечённость падает со временем.",
    solution: "В конце каждого отчёта — один нестандартный вопрос: «Какой расход на этой неделе был лишним?», «Назовите одного клиента которому стоит позвонить сегодня?». Ответ обрабатывается агентом.",
    psych: "Эффект Зейгарник — незакрытый вопрос держит внимание. Вопрос = вовлечённость",
    techNote: "formatter.py → добавить weekly_question из банка 52 вопросов. Ответ → Claude анализирует.",
    tags: ["engagement", "psychology", "ai"],
  },

  // ── УДОБСТВО КЛИЕНТА ───────────────────────────────────────────────────────
  {
    id: "quick_commands",
    category: "convenience",
    priority: "high",
    effort: "S",
    impact: 8,
    title: "Быстрые команды одной кнопкой",
    problem: "Клиент не знает что можно спросить у бота. Большинство просто не пишет ничего.",
    solution: "Постоянное меню из 6 кнопок: 💰 Касса | 📊 Отчёт | ⚠️ Алерты | 📞 Звонки по ДЗ | 📈 Прогноз | ❓ Задать вопрос. Нажал — получил без набора текста.",
    psych: "Снижение когнитивной нагрузки — не нужно думать что написать. Доступность = использование",
    techNote: "keyboards.py → ReplyKeyboardMarkup постоянное (не inline). Каждая кнопка — хендлер.",
    tags: ["ux", "convenience", "engagement"],
  },
  {
    id: "voice",
    category: "convenience",
    priority: "medium",
    effort: "M",
    impact: 7,
    title: "Голосовые вопросы боту",
    problem: "Собственник часто едет на машине или на встрече — печатать неудобно.",
    solution: "Принимать голосовые сообщения. Конвертировать через Whisper API → текст → Claude. Отвечать текстом (или голосом через TTS).",
    psych: "Снятие барьера ввода — голос в 5 раз быстрее клавиатуры. Устраняет friction в ключевые моменты",
    techNote: "handlers.py → MessageHandler(filters.VOICE). openai.Audio.transcribe() или faster-whisper локально.",
    tags: ["convenience", "ux", "ai"],
  },
  {
    id: "snapshot",
    category: "convenience",
    priority: "medium",
    effort: "M",
    impact: 7,
    title: "Фото чека или выписки → автоввод данных",
    problem: "Клиент тратит время на ручной ввод данных в таблицу. Это главная причина отказа от продукта.",
    solution: "Клиент фотографирует чек, выписку из банка или документ. Claude Vision распознаёт и предлагает добавить в нужную категорию расходов/доходов одной кнопкой.",
    psych: "Устранение боли — ручной ввод это то что клиент ненавидит больше всего. Убери боль = лояльность",
    techNote: "handlers.py → MessageHandler(filters.PHOTO). Claude API с vision: extract_financial_data(image).",
    tags: ["convenience", "ai", "automation"],
  },
  {
    id: "digest_format",
    category: "convenience",
    priority: "high",
    effort: "S",
    impact: 8,
    title: "Выбор формата и времени отчётов",
    problem: "Все клиенты получают отчёт в одно время в одном формате. Один хочет в пятницу вечером, другой — в понедельник утром.",
    solution: "При онбординге спросить: когда получать отчёт? Насколько подробный? Только цифры или с объяснениями? Настройки хранятся в профиле клиента.",
    psych: "Иллюзия контроля + автономия. Когда человек сам выбирает — он ценит больше",
    techNote: "clients: добавить report_day, report_hour, report_style (brief/detailed). scheduler.py читает из БД.",
    tags: ["convenience", "personalization", "ux"],
  },
  {
    id: "comparison",
    category: "convenience",
    priority: "medium",
    effort: "L",
    impact: 7,
    title: "Сравнение с отраслевыми бенчмарками",
    problem: "Клиент не знает хорошая у него маржа или нет без контекста.",
    solution: "При настройке клиент указывает отрасль. Бот показывает его показатели vs медиана по отрасли: «Ваша маржа 22% при медиане по торговле 18% — вы выше рынка».",
    psych: "Социальное сравнение — людям важно знать как они относительно других. Позитивное сравнение = гордость = лояльность",
    techNote: "Статичная таблица бенчмарков по 15 отраслям в JSON. Обновлять вручную раз в квартал.",
    tags: ["analytics", "psychology", "value"],
  },

  // ── МОНЕТИЗАЦИЯ / РОСТ ─────────────────────────────────────────────────────
  {
    id: "referral",
    category: "growth",
    priority: "medium",
    effort: "M",
    impact: 8,
    title: "Реферальная программа внутри бота",
    problem: "Нет механизма вирусного роста. Клиент доволен, но не приводит других.",
    solution: "Команда /invite генерирует персональную ссылку. За каждого приведённого клиента — 1 месяц бесплатно. Бот отслеживает реферальную цепочку автоматически.",
    psych: "Взаимность + социальное доказательство. Рекомендация другу = подтверждение собственного хорошего вкуса",
    techNote: "clients: добавить referral_code, referred_by. /invite → генерировать deep link t.me/bot?start=REF_CODE.",
    tags: ["growth", "monetization", "automation"],
  },
  {
    id: "upsell",
    category: "growth",
    priority: "medium",
    effort: "S",
    impact: 7,
    title: "Умный апселл через инсайты",
    problem: "Клиент не знает о расширенных возможностях и не апгрейдится.",
    solution: "Когда агент видит сложную ситуацию (напр. падение маржи второй месяц подряд), он предлагает: «Для глубокого анализа себестоимости нужен расширенный тариф. Хотите узнать?» — нативно, без навязчивости.",
    psych: "Контекстный апселл в момент боли — предложение помощи именно когда клиент её хочет",
    techNote: "prompts.py → условие: если severity HIGH → добавить в конец промпта soft upsell блок.",
    tags: ["growth", "monetization", "ai"],
  },
  {
    id: "pdf_report",
    category: "growth",
    priority: "medium",
    effort: "M",
    impact: 7,
    title: "PDF-отчёт для инвесторов и банков",
    problem: "Собственнику иногда нужен красивый документ для банка или партнёров — сейчас это 3 часа работы.",
    solution: "Команда /pdf_report генерирует готовый PDF: логотип, графики, ключевые показатели, заключение CFO. Готово за 30 секунд. Это само по себе может быть отдельным платным тарифом.",
    psych: "Ощущение профессионализма — клиент гордится что у него «такой CFO». Делится с партнёрами → виральность",
    techNote: "reportlab или weasyprint. Шаблон в HTML → конвертация. Запускать в отдельном воркере.",
    tags: ["growth", "value", "monetization"],
  },
];

const CATEGORIES = {
  automation: { label: "Автоматизация", color: "#85C88A", icon: "⚡" },
  psychology:  { label: "Психология",   color: "#E8A87C", icon: "🧠" },
  convenience: { label: "Удобство",     color: "#7EB8D4", icon: "✨" },
  growth:      { label: "Рост",         color: "#C8A96E", icon: "📈" },
};

const EFFORTS = {
  XS: { label: "XS · 1–2ч",  color: "#85C88A" },
  S:  { label: "S · полдня", color: "#A8D8A8" },
  M:  { label: "M · 1–2 дня",color: "#E8A87C" },
  L:  { label: "L · 3–5 дней",color: "#F06B6B" },
};

const PRIORITIES = {
  critical: { label: "🔴 Критично", color: "#F06B6B" },
  high:     { label: "🟠 Высокий",  color: "#E8A87C" },
  medium:   { label: "🟡 Средний",  color: "#C8A96E" },
};

export default function App() {
  const [filter, setFilter]       = useState("all");
  const [priorityFilter, setPF]   = useState("all");
  const [selected, setSelected]   = useState(null);
  const [done, setDone]           = useState(() => {
    try {
      const saved = localStorage.getItem('cfo-roadmap-done');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [search, setSearch]       = useState("");
  const [sortBy, setSortBy]       = useState("impact");
  const [view, setView]           = useState("cards");
  const [animIn, setAnimIn]       = useState(false);
  const detailRef                 = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => setAnimIn(true), 50);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (selected && detailRef.current) {
      const t = setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      return () => clearTimeout(t);
    }
  }, [selected]);

  useEffect(() => {
    try { localStorage.setItem('cfo-roadmap-done', JSON.stringify(done)); } catch {}
  }, [done]);

  const toggleDone = (id, e) => {
    e.stopPropagation();
    setDone(p => ({ ...p, [id]: !p[id] }));
  };

  const filtered = IMPROVEMENTS
    .filter(i => filter === "all" || i.category === filter)
    .filter(i => priorityFilter === "all" || i.priority === priorityFilter)
    .filter(i => !search || i.title.toLowerCase().includes(search.toLowerCase()) ||
      i.solution.toLowerCase().includes(search.toLowerCase()) ||
      i.tags.some(t => t.includes(search.toLowerCase())))
    .sort((a, b) => {
      if (sortBy === "impact") return b.impact - a.impact;
      if (sortBy === "effort") return ["XS","S","M","L"].indexOf(a.effort) - ["XS","S","M","L"].indexOf(b.effort);
      if (sortBy === "priority") return ["critical","high","medium"].indexOf(a.priority) - ["critical","high","medium"].indexOf(b.priority);
      return 0;
    });

  const totalDone = IMPROVEMENTS.filter(i => done[i.id]).length;
  const totalAll  = IMPROVEMENTS.length;

  const effortOrder = ["XS","S","M","L"];

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070709",
      color: "#D8D0C0",
      fontFamily: "'Palatino Linotype', 'Book Antiqua', Palatino, serif",
      padding: "0 0 80px",
    }}>

      {/* ── HERO ── */}
      <div style={{
        background: "linear-gradient(180deg, #0E0E14 0%, #070709 100%)",
        borderBottom: "1px solid #1A1A22",
        padding: "48px 24px 40px",
        textAlign: "center",
        opacity: animIn ? 1 : 0,
        transform: animIn ? "none" : "translateY(-12px)",
        transition: "opacity 0.6s ease, transform 0.6s ease",
      }}>
        <div style={{ fontSize: 10, letterSpacing: 8, color: "#C8A96E", marginBottom: 14, textTransform: "uppercase" }}>
          Rid Finance · CFO-агент · Roadmap улучшений
        </div>
        <h1 style={{ fontSize: "clamp(26px, 5vw, 48px)", fontWeight: 400, margin: "0 0 12px", color: "#F0E8D8", lineHeight: 1.15 }}>
          {totalAll} улучшений для продукта
        </h1>
        <p style={{ fontSize: 15, color: "#666", maxWidth: 560, margin: "0 auto 28px", lineHeight: 1.7 }}>
          Автоматизация, психология удержания, удобство клиента и рост — всё с техническими заметками
        </p>

        <div style={{ maxWidth: 400, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#555", marginBottom: 6 }}>
            <span style={{ letterSpacing: 2, textTransform: "uppercase" }}>Выполнено</span>
            <span style={{ color: "#C8A96E" }}>{totalDone} / {totalAll}</span>
          </div>
          <div style={{ height: 3, background: "#1A1A22", borderRadius: 2 }}>
            <div style={{
              width: `${(totalDone/totalAll)*100}%`,
              height: "100%", background: "#C8A96E", borderRadius: 2,
              transition: "width 0.5s ease",
            }} />
          </div>
        </div>
      </div>

      {/* ── CONTROLS ── */}
      <div style={{ padding: "24px 16px 0", maxWidth: 1200, margin: "0 auto" }}>

        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Поиск по названию, тегу..."
            style={{
              flex: 1, minWidth: 200,
              background: "#0E0E14", border: "1px solid #1E1E2A",
              color: "#D8D0C0", padding: "8px 14px",
              borderRadius: 3, fontSize: 13, fontFamily: "inherit",
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: 0, border: "1px solid #1E1E2A", borderRadius: 3, overflow: "hidden" }}>
            {[["impact","По импакту"],["effort","По усилию"],["priority","По приоритету"]].map(([v,l]) => (
              <button key={v} onClick={() => setSortBy(v)} style={{
                padding: "8px 12px", fontSize: 11, letterSpacing: 1,
                background: sortBy === v ? "#1E1E2A" : "transparent",
                border: "none", color: sortBy === v ? "#C8A96E" : "#555",
                cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase",
              }}>{l}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 0, border: "1px solid #1E1E2A", borderRadius: 3, overflow: "hidden" }}>
            {[["cards","▦"],["matrix","⊞"]].map(([v,l]) => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: "8px 14px", fontSize: 14,
                background: view === v ? "#1E1E2A" : "transparent",
                border: "none", color: view === v ? "#C8A96E" : "#555",
                cursor: "pointer",
              }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
          <button onClick={() => setFilter("all")} style={chipStyle(filter === "all", "#C8A96E")}>
            Все · {IMPROVEMENTS.length}
          </button>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <button key={k} onClick={() => setFilter(filter === k ? "all" : k)} style={chipStyle(filter === k, v.color)}>
              {v.icon} {v.label} · {IMPROVEMENTS.filter(i => i.category === k).length}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 28, flexWrap: "wrap" }}>
          <button onClick={() => setPF("all")} style={chipStyle(priorityFilter === "all", "#555")}>Все приоритеты</button>
          {Object.entries(PRIORITIES).map(([k, v]) => (
            <button key={k} onClick={() => setPF(priorityFilter === k ? "all" : k)} style={chipStyle(priorityFilter === k, v.color)}>
              {v.label}
            </button>
          ))}
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8, marginBottom: 28,
        }}>
          {Object.entries(CATEGORIES).map(([k, v]) => {
            const items = IMPROVEMENTS.filter(i => i.category === k);
            const doneCount = items.filter(i => done[i.id]).length;
            return (
              <div key={k} onClick={() => setFilter(filter === k ? "all" : k)} style={{
                background: "#0E0E14", border: `1px solid ${filter === k ? v.color + "88" : "#1A1A22"}`,
                borderTop: `2px solid ${v.color}`,
                padding: "12px 14px", borderRadius: 3, cursor: "pointer",
              }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{v.icon}</div>
                <div style={{ fontSize: 11, color: v.color, letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 }}>{v.label}</div>
                <div style={{ fontSize: 20, color: "#F0E8D8" }}>{doneCount}/{items.length}</div>
                <div style={{ marginTop: 6, height: 2, background: "#1A1A22" }}>
                  <div style={{ width: `${(doneCount/items.length)*100}%`, height: "100%", background: v.color, transition: "width 0.4s" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MATRIX VIEW ── */}
      {view === "matrix" && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px 32px" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#555", textTransform: "uppercase", marginBottom: 16 }}>
            Матрица: Импакт × Усилие
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "80px repeat(4, 1fr)",
            gap: 8,
          }}>
            <div />
            {effortOrder.map(e => (
              <div key={e} style={{
                textAlign: "center", fontSize: 10, letterSpacing: 2,
                color: EFFORTS[e].color, textTransform: "uppercase", padding: "6px 0",
                borderBottom: `2px solid ${EFFORTS[e].color}44`,
              }}>{EFFORTS[e].label}</div>
            ))}
            {[10,9,8,7,6].map(impact => (
              <React.Fragment key={impact}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "flex-end",
                  fontSize: 11, color: "#555", paddingRight: 10,
                }}>
                  {impact === 10 ? "🔥" : impact >= 8 ? "⭐" : "·"} {impact}
                </div>
                {effortOrder.map(effort => {
                  const items = filtered.filter(i => i.impact === impact && i.effort === effort);
                  return (
                    <div key={`${impact}-${effort}`} style={{
                      minHeight: 60, background: "#0E0E14",
                      border: "1px solid #1A1A22", borderRadius: 3, padding: 6,
                    }}>
                      {items.map(item => (
                        <div key={item.id} onClick={() => setSelected(selected === item.id ? null : item.id)}
                          style={{
                            fontSize: 11, padding: "4px 6px", marginBottom: 3,
                            background: done[item.id] ? "#1A2A1A" : `${CATEGORIES[item.category].color}18`,
                            border: `1px solid ${CATEGORIES[item.category].color}44`,
                            borderRadius: 2, cursor: "pointer",
                            color: done[item.id] ? "#555" : "#BBB",
                            textDecoration: done[item.id] ? "line-through" : "none",
                          }}>
                          {CATEGORIES[item.category].icon} {item.title}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 12, textAlign: "center" }}>
            Верхний левый угол (высокий импакт + малое усилие) = делать первым
          </div>
        </div>
      )}

      {/* ── CARDS VIEW ── */}
      {view === "cards" && (
        <div style={{
          maxWidth: 1200, margin: "0 auto", padding: "0 16px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 12,
        }}>
          {filtered.map((item, idx) => {
            const cat = CATEGORIES[item.category];
            const eff = EFFORTS[item.effort];
            const isDone = done[item.id];
            const isSel = selected === item.id;

            return (
              <div key={item.id}
                onClick={() => setSelected(isSel ? null : item.id)}
                style={{
                  background: isSel ? `${cat.color}0F` : isDone ? "#0D120D" : "#0E0E14",
                  border: `1px solid ${isSel ? cat.color + "88" : isDone ? "#1A2A1A" : "#1A1A22"}`,
                  borderLeft: `3px solid ${cat.color}`,
                  borderRadius: 3, padding: "16px",
                  cursor: "pointer", transition: "all 0.2s",
                  opacity: animIn ? 1 : 0,
                  transform: animIn ? "none" : "translateY(8px)",
                  transitionDelay: `${idx * 0.03}s`,
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span style={{
                      fontSize: 9, letterSpacing: 2, padding: "3px 7px",
                      background: `${cat.color}22`, color: cat.color,
                      borderRadius: 2, textTransform: "uppercase",
                    }}>{cat.icon} {cat.label}</span>
                    <span style={{
                      fontSize: 9, letterSpacing: 1, padding: "3px 7px",
                      background: "#111", color: eff.color,
                      borderRadius: 2,
                    }}>{eff.label}</span>
                  </div>
                  <button
                    onClick={(e) => toggleDone(item.id, e)}
                    style={{
                      width: 20, height: 20, flexShrink: 0,
                      border: `1px solid ${isDone ? "#85C88A" : "#333"}`,
                      background: isDone ? "#85C88A" : "transparent",
                      borderRadius: 3, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: "#000",
                    }}
                  >{isDone ? "✓" : ""}</button>
                </div>

                <div style={{
                  fontSize: 15, color: isDone ? "#555" : "#F0E8D8",
                  textDecoration: isDone ? "line-through" : "none",
                  marginBottom: 8, lineHeight: 1.3,
                }}>
                  {item.title}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: "#444", letterSpacing: 1, textTransform: "uppercase", flexShrink: 0 }}>
                    Импакт
                  </div>
                  <div style={{ flex: 1, height: 3, background: "#1A1A22", borderRadius: 2 }}>
                    <div style={{
                      width: `${item.impact * 10}%`, height: "100%",
                      background: item.impact >= 9 ? "#F06B6B" : item.impact >= 7 ? "#E8A87C" : "#C8A96E",
                      borderRadius: 2,
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#666", flexShrink: 0 }}>{item.impact}/10</div>
                </div>

                <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6, marginBottom: 10 }}>
                  {item.problem}
                </div>

                <div style={{
                  fontSize: 11, color: "#E8A87C",
                  padding: "5px 8px", background: "#1A1508",
                  borderLeft: "2px solid #E8A87C", lineHeight: 1.5,
                }}>
                  🧠 {item.psych.split(" — ")[0]}
                </div>

                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
                  {item.tags.map(t => (
                    <span key={t} onClick={e => { e.stopPropagation(); setSearch(t); }} style={{
                      fontSize: 9, padding: "2px 6px", background: "#111",
                      color: "#555", borderRadius: 2, cursor: "pointer",
                      letterSpacing: 1,
                    }}>#{t}</span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── DETAIL PANEL ── */}
      {selected && (() => {
        const item = IMPROVEMENTS.find(i => i.id === selected);
        if (!item) return null;
        const cat = CATEGORIES[item.category];
        return (
          <div ref={detailRef} style={{
            maxWidth: 1200, margin: "24px auto 0", padding: "0 16px",
          }}>
            <div style={{
              background: "#0A0A10",
              border: `1px solid ${cat.color}55`,
              borderTop: `3px solid ${cat.color}`,
              borderRadius: 4,
              overflow: "hidden",
            }}>
              <div style={{
                padding: "20px 24px",
                borderBottom: "1px solid #12121A",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontSize: 20, color: "#F0E8D8", marginBottom: 4 }}>{item.title}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 10, letterSpacing: 2, color: cat.color, textTransform: "uppercase" }}>
                      {cat.icon} {cat.label}
                    </span>
                    <span style={{ fontSize: 10, color: "#555" }}>·</span>
                    <span style={{ fontSize: 10, color: EFFORTS[item.effort].color }}>{EFFORTS[item.effort].label}</span>
                    <span style={{ fontSize: 10, color: "#555" }}>·</span>
                    <span style={{ fontSize: 10, color: PRIORITIES[item.priority].color }}>{PRIORITIES[item.priority].label}</span>
                  </div>
                </div>
                <button onClick={() => setSelected(null)} style={{
                  background: "transparent", border: "1px solid #1E1E2A",
                  color: "#666", padding: "5px 14px", cursor: "pointer",
                  borderRadius: 2, fontFamily: "inherit", fontSize: 11,
                }}>✕</button>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 0,
              }}>
                <Block title="Проблема сейчас" icon="⚡" color="#F06B6B">
                  <p style={bodyText}>{item.problem}</p>
                </Block>
                <Block title="Решение" icon="✅" color={cat.color}>
                  <p style={bodyText}>{item.solution}</p>
                </Block>
                <Block title="Психологический механизм" icon="🧠" color="#E8A87C">
                  <p style={bodyText}>{item.psych}</p>
                </Block>
                <Block title="Техническая заметка" icon="⚙️" color="#7EB8D4">
                  <p style={{ ...bodyText, fontFamily: "monospace", fontSize: 12, color: "#7EB8D4", lineHeight: 1.7 }}>
                    {item.techNote}
                  </p>
                </Block>
              </div>

              <div style={{
                padding: "16px 24px",
                borderTop: "1px solid #12121A",
                display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12,
              }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {item.tags.map(t => (
                    <span key={t} style={{
                      fontSize: 10, padding: "3px 8px", background: "#111",
                      color: "#666", borderRadius: 2, letterSpacing: 1,
                    }}>#{t}</span>
                  ))}
                </div>
                <button onClick={(e) => toggleDone(item.id, e)} style={{
                  padding: "8px 20px",
                  background: done[item.id] ? "#1A2A1A" : `${cat.color}22`,
                  border: `1px solid ${done[item.id] ? "#85C88A" : cat.color}`,
                  color: done[item.id] ? "#85C88A" : cat.color,
                  cursor: "pointer", borderRadius: 3, fontFamily: "inherit",
                  fontSize: 13, letterSpacing: 1,
                }}>
                  {done[item.id] ? "✓ Выполнено" : "Отметить выполненным"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── QUICK WIN BANNER ── */}
      <div style={{ maxWidth: 1200, margin: "32px auto 0", padding: "0 16px" }}>
        <div style={{
          background: "linear-gradient(135deg, #0E1A0E 0%, #0A0A10 100%)",
          border: "1px solid #85C88A33",
          borderLeft: "3px solid #85C88A",
          borderRadius: 4, padding: "20px 24px",
        }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: "#85C88A", textTransform: "uppercase", marginBottom: 10 }}>
            ⚡ Quick wins — делать первыми
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 10,
          }}>
            {IMPROVEMENTS
              .filter(i => (i.effort === "XS" || i.effort === "S") && i.impact >= 8)
              .map(i => {
                const cat = CATEGORIES[i.category];
                return (
                  <div key={i.id} onClick={() => setSelected(i.id)} style={{
                    padding: "10px 12px", background: "#0D0D12",
                    border: "1px solid #1A2A1A", borderRadius: 3, cursor: "pointer",
                    display: "flex", gap: 10, alignItems: "flex-start",
                  }}>
                    <span style={{ fontSize: 16, flexShrink: 0 }}>{cat.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, color: "#D8D0C0", marginBottom: 3 }}>{i.title}</div>
                      <div style={{ fontSize: 10, color: "#555" }}>{EFFORTS[i.effort].label} · импакт {i.impact}/10</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

    </div>
  );
}

function chipStyle(active, color) {
  return {
    padding: "5px 12px",
    border: `1px solid ${active ? color : "#1E1E2A"}`,
    background: active ? `${color}18` : "transparent",
    color: active ? color : "#555",
    borderRadius: 2, cursor: "pointer",
    fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
    fontFamily: "inherit",
  };
}

function Block({ title, icon, color, children }) {
  return (
    <div style={{ padding: "20px 24px", borderRight: "1px solid #12121A", borderBottom: "1px solid #12121A" }}>
      <div style={{ fontSize: 10, letterSpacing: 3, color, textTransform: "uppercase", marginBottom: 12 }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

const bodyText = {
  fontSize: 13, color: "#AAA", lineHeight: 1.75, margin: 0,
};
