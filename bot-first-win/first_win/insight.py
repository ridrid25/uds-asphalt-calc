"""Обращение к Claude за тремя фактами о бизнесе клиента.

Контракт модуля: функция analyze_first_impression() **никогда не падает**.
Если API недоступен, ключа нет, запрос отклонён или ответ пришёл в неожиданном
виде — возвращается локальный расчёт из fallback.py. Клиент в момент первого
впечатления не должен увидеть ошибку.
"""

from __future__ import annotations

import json
import logging
import os

import anthropic

from .fallback import build_fallback_first_win
from .models import BusinessSnapshot, FirstWin

log = logging.getLogger(__name__)

MODEL = "claude-opus-5"

# Ответ жёстко ограничен схемой: модель физически не может вернуть четыре факта
# или поменять их местами. «Первый факт всегда позитивный» — свойство структуры.
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "positive": {
            "type": "string",
            "description": "Что в этих цифрах уже хорошо. Одно предложение, с конкретным числом.",
        },
        "observation": {
            "type": "string",
            "description": "Нейтральное наблюдение, которое объясняет собственнику его же цифры.",
        },
        "risk": {
            "type": "string",
            "description": "Главная зона роста или риск. Без драматизации.",
        },
        "action_today": {
            "type": "string",
            "description": "Ровно одно действие, выполнимое сегодня за 15 минут.",
        },
    },
    "required": ["positive", "observation", "risk", "action_today"],
    "additionalProperties": False,
}

# Системный промпт стабилен между клиентами — поэтому он кэшируется.
# Всё, что меняется от клиента к клиенту (цифры), уходит в user-сообщение ниже,
# после точки кэширования. Иначе кэш обнулялся бы на каждом запросе.
SYSTEM_PROMPT = """\
Ты — финансовый директор, который впервые смотрит на цифры малого бизнеса и \
за 30 секунд говорит собственнику три вещи. Это первое впечатление клиента от \
продукта: он только что подключил свои данные и ещё не знает, будет ли ему полезно.

Твоя задача — три факта в строго заданном порядке.

1. positive — что уже хорошо. Всегда первым. Даже если картина тяжёлая, найди то, \
что правда работает: выросшая выручка, приличная маржа, запас кассы, снизившиеся \
расходы, аккуратная дебиторка. Если хорошего мало — скажи честно и мягко, но начни \
всё равно с опоры, а не с провала.
2. observation — наблюдение, которое объясняет собственнику его собственные цифры. \
Не повтор факта из пункта 1, а то, чего он сам мог не заметить: во что складывается \
маржа, с какой скоростью уходят деньги, какая доля выручки застряла в долгах.
3. risk — главная зона роста. Одна, самая весомая. Без нагнетания и без слов \
«катастрофа», «срочно», «критично».
4. action_today — ровно одно действие, которое собственник может сделать сегодня \
за пятнадцать минут. Конкретное: позвонить, посмотреть, посчитать, выставить. \
Не «оптимизировать расходы», а «взять три самых крупных расхода за месяц и решить, \
какой можно сдвинуть».

Правила, которые не нарушаются:

— Используй только те числа, которые тебе дали. Ничего не достраивай и не \
предполагай. Нет данных о марже — не говори о марже.
— Каждый факт — одно-два коротких предложения. Собственник читает с телефона.
— Пиши по-русски, живым языком, на «вы». Без канцелярита, без англицизмов, \
без терминов, которые нужно расшифровывать.
— Никакого форматирования: ни заголовков, ни списков, ни markdown. Только текст.
— Числа округляй так, как их произносят вслух: «выросла на 12%», а не «на 12,37%».
— Не хвали продукт, не обещай будущей пользы, не предлагай купить тариф. \
Ты сейчас просто показываешь человеку его бизнес.
"""


def _client(timeout: float) -> anthropic.Anthropic:
    """Ключ берётся из ANTHROPIC_API_KEY или из профиля `ant auth login`."""
    return anthropic.Anthropic(timeout=timeout, max_retries=1)


def _render_facts(s: BusinessSnapshot) -> str:
    """Собирает цифры клиента в текст. Только то, что реально известно."""
    lines: list[str] = [f"Период: {s.period_label}.", f"Валюта: {s.currency}."]
    if s.company:
        lines.append(f"Компания: {s.company}.")
    lines.append(f"Выручка: {s.revenue:.0f}.")
    lines.append(f"Расходы: {s.expenses:.0f}.")
    lines.append(f"Прибыль: {s.profit:.0f}.")
    if s.margin is not None:
        lines.append(f"Маржа: {s.margin:.1f}%.")
    if s.prev_revenue:
        lines.append(f"Выручка за прошлый период: {s.prev_revenue:.0f}.")
    if s.growth is not None:
        lines.append(f"Изменение выручки: {s.growth:+.1f}%.")
    lines.append(f"Деньги на счетах: {s.cash:.0f}.")
    if s.runway_days is not None:
        lines.append(f"Хватит кассы примерно на {s.runway_days} дней.")
    if s.receivables:
        lines.append(f"Дебиторка: {s.receivables:.0f}.")
    if s.overdue_receivables:
        lines.append(f"Из неё просрочено: {s.overdue_receivables:.0f}.")
    return "\n".join(lines)


def analyze_first_impression(
    snapshot: BusinessSnapshot,
    *,
    timeout: float = 25.0,
) -> FirstWin:
    """Три факта о бизнесе. При любой проблеме — локальный расчёт."""
    try:
        response = _client(timeout).beta.messages.create(
            model=MODEL,
            max_tokens=16000,
            # Claude Opus 5 думает по умолчанию, и max_tokens ограничивает
            # размышление вместе с ответом — отсюда запас, а не 500.
            # effort="low" держит задержку низкой: клиент ждёт ответа в чате.
            output_config={
                "effort": "low",
                "format": {"type": "json_schema", "schema": RESPONSE_SCHEMA},
            },
            # Отказ классификатора не роняет первое впечатление: запрос
            # автоматически переигрывается на резервной модели.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    # Промпт одинаков для всех клиентов — со второго запроса
                    # он читается из кэша примерно за десятую часть цены.
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": _render_facts(snapshot)}],
        )
    except (anthropic.AuthenticationError, TypeError) as exc:
        # Нет ключа или он неверный — это настройка окружения, а не сбой.
        # Пишем одну строку, а не traceback на каждый запрос клиента.
        log.warning("first_win: нет доступа к Claude (%s), считаем локально", exc.__class__.__name__)
        return build_fallback_first_win(snapshot)
    except Exception:  # сеть, таймаут, лимиты — причина нужна целиком
        log.exception("first_win: обращение к Claude не удалось, считаем локально")
        return build_fallback_first_win(snapshot)

    # stop_reason проверяется до чтения content: при отказе content пустой.
    if response.stop_reason == "refusal":
        log.warning("first_win: запрос отклонён классификатором, считаем локально")
        return build_fallback_first_win(snapshot)

    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        log.warning("first_win: пустой ответ модели, считаем локально")
        return build_fallback_first_win(snapshot)

    try:
        data = json.loads(text)
        return FirstWin(
            positive=data["positive"].strip(),
            observation=data["observation"].strip(),
            risk=data["risk"].strip(),
            action_today=data["action_today"].strip(),
            source="claude",
        )
    except (json.JSONDecodeError, KeyError, AttributeError):
        log.exception("first_win: ответ не разобрался, считаем локально")
        return build_fallback_first_win(snapshot)


def api_key_present() -> bool:
    """Есть ли ключ в окружении — для демо и диагностики."""
    return bool(os.getenv("ANTHROPIC_API_KEY"))
