"""Команда и кнопка «Первая победа» для python-telegram-bot (v20+).

Подключение — три строки в вашем main.py, см. README.
Модуль не знает, как ваш бот хранит данные клиента: вы передаёте функцию,
которая по chat_id отдаёт BusinessSnapshot (или None, если данных ещё нет).
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from typing import Awaitable, Callable

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.constants import ChatAction
from telegram.ext import Application, CallbackQueryHandler, CommandHandler, ContextTypes

from .formatting import NO_DATA_TEXT, WAITING_TEXT, render_first_win
from .insight import analyze_first_impression
from .models import BusinessSnapshot

log = logging.getLogger(__name__)

CALLBACK_DATA = "first_win"
BUTTON_TEXT = "✨ Показать первую победу"
OFFER_TEXT = (
    "Данные на месте. Хотите, покажу три вещи, которые я в них увидел?"
)

# Функция, которую вы передаёте: по chat_id вернуть данные клиента.
# Может быть обычной или async — модуль поддерживает оба варианта.
SnapshotLoader = Callable[[int], BusinessSnapshot | None | Awaitable[BusinessSnapshot | None]]


def first_win_keyboard() -> InlineKeyboardMarkup:
    """Кнопка под сообщением-предложением."""
    return InlineKeyboardMarkup(
        [[InlineKeyboardButton(BUTTON_TEXT, callback_data=CALLBACK_DATA)]]
    )


async def _load(loader: SnapshotLoader, chat_id: int) -> BusinessSnapshot | None:
    result = loader(chat_id)
    if inspect.isawaitable(result):
        return await result
    return result


async def _send_first_win(
    loader: SnapshotLoader,
    chat_id: int,
    context: ContextTypes.DEFAULT_TYPE,
) -> None:
    """Общая работа команды и кнопки: взять данные, посчитать, ответить."""
    snapshot = await _load(loader, chat_id)
    if snapshot is None:
        await context.bot.send_message(chat_id, NO_DATA_TEXT)
        return

    await context.bot.send_chat_action(chat_id, ChatAction.TYPING)
    await context.bot.send_message(chat_id, WAITING_TEXT)

    # Обращение к Claude блокирующее — уводим его в поток, иначе на время
    # запроса встанет весь бот и остальные клиенты будут ждать.
    win = await asyncio.to_thread(analyze_first_impression, snapshot)
    log.info("first_win: отправлено chat_id=%s источник=%s", chat_id, win.source)

    await context.bot.send_message(chat_id, render_first_win(win, snapshot.owner_name))


def build_handlers(loader: SnapshotLoader) -> list:
    """Возвращает хендлеры команды и кнопки — добавьте их в Application."""

    async def on_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await _send_first_win(loader, update.effective_chat.id, context)

    async def on_button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        query = update.callback_query
        # Telegram гасит «часики» на кнопке только после answer().
        await query.answer()
        await _send_first_win(loader, query.message.chat_id, context)

    return [
        CommandHandler("first_win", on_command),
        CallbackQueryHandler(on_button, pattern=f"^{CALLBACK_DATA}$"),
    ]


def register(application: Application, loader: SnapshotLoader) -> None:
    """Регистрирует всё разом: application, loader — и готово."""
    for handler in build_handlers(loader):
        application.add_handler(handler)


async def offer_first_win(chat_id: int, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Предложить «первую победу» сразу после подключения данных.

    Вызовите это в конце вашего хендлера подключения таблицы — тогда клиент
    получит кнопку в тот самый момент, когда ему интересно.
    """
    await context.bot.send_message(chat_id, OFFER_TEXT, reply_markup=first_win_keyboard())
