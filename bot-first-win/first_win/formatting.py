"""Текст сообщения, которое видит клиент."""

from __future__ import annotations

from .models import FirstWin

TELEGRAM_LIMIT = 4096

INTRO = "Я посмотрел ваши данные. Вот что нашёл за 30 секунд:"
INTRO_NAMED = "{name}, я посмотрел ваши данные. Вот что нашёл за 30 секунд:"


def render_first_win(win: FirstWin, owner_name: str | None = None) -> str:
    """Собирает сообщение. Порядок блоков — тот же, что в FirstWin: сначала хорошее."""
    intro = INTRO_NAMED.format(name=owner_name) if owner_name else INTRO
    message = (
        f"{intro}\n\n"
        f"✅ {win.positive}\n\n"
        f"📊 {win.observation}\n\n"
        f"⚠️ {win.risk}\n\n"
        f"👉 Одно действие на сегодня: {win.action_today}"
    )
    if len(message) > TELEGRAM_LIMIT:
        message = message[: TELEGRAM_LIMIT - 1].rstrip() + "…"
    return message


WAITING_TEXT = "Смотрю ваши цифры…"
NO_DATA_TEXT = (
    "Пока не вижу ваших данных — подключите таблицу, и я сразу покажу, "
    "что в ней нашёл."
)
