"""«Первая победа» за 5 минут — мини-инсайт сразу после подключения данных.

Что делает: клиент подключил таблицу — бот тут же присылает три факта о его
бизнесе. Первый всегда хороший. Третий заканчивается одним действием на сегодня.

Быстрое подключение:

    from first_win import register, offer_first_win

    register(application, load_snapshot)      # команда /first_win и кнопка
    await offer_first_win(chat_id, context)   # предложить сразу после подключения

Подробности — в README.md рядом.
"""

from typing import Any

from .fallback import build_fallback_first_win
from .formatting import render_first_win
from .insight import analyze_first_impression
from .models import BusinessSnapshot, FirstWin

# Всё, что зависит от python-telegram-bot, подгружается только при обращении.
# Так демо и тесты работают без установленной библиотеки Telegram.
_TELEGRAM_EXPORTS = {
    "register",
    "build_handlers",
    "offer_first_win",
    "first_win_keyboard",
    "BUTTON_TEXT",
    "CALLBACK_DATA",
}


def __getattr__(name: str) -> Any:
    if name in _TELEGRAM_EXPORTS:
        from . import handlers

        return getattr(handlers, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "BusinessSnapshot",
    "FirstWin",
    "analyze_first_impression",
    "build_fallback_first_win",
    "render_first_win",
    *sorted(_TELEGRAM_EXPORTS),
]
