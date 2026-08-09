#!/usr/bin/env python3
"""Показывает, что именно увидит клиент. Telegram и бот для этого не нужны.

    python demo.py

Без ключа ANTHROPIC_API_KEY считает локально (тот же путь, что и при сбое сети).
С ключом — обращается к Claude и показывает живой ответ.
"""

from __future__ import annotations

from first_win.fallback import build_fallback_first_win
from first_win.formatting import render_first_win
from first_win.insight import analyze_first_impression, api_key_present
from first_win.models import BusinessSnapshot

# Три разных бизнеса: растущий, с дырой в дебиторке и убыточный.
# Проверяем главное правило: первый факт хороший в любом случае.
EXAMPLES = [
    (
        "Растущая торговля",
        BusinessSnapshot(
            revenue=2_400_000,
            expenses=1_850_000,
            cash=760_000,
            receivables=430_000,
            overdue_receivables=0,
            prev_revenue=2_100_000,
            company="ООО «Ромашка»",
            owner_name="Ирина",
        ),
    ),
    (
        "Деньги застряли у должников",
        BusinessSnapshot(
            revenue=1_800_000,
            expenses=1_620_000,
            cash=210_000,
            receivables=940_000,
            overdue_receivables=610_000,
            prev_revenue=1_750_000,
            owner_name="Сергей",
        ),
    ),
    (
        "Убыточный месяц",
        BusinessSnapshot(
            revenue=900_000,
            expenses=1_150_000,
            cash=180_000,
            receivables=120_000,
            overdue_receivables=40_000,
            prev_revenue=1_050_000,
        ),
    ),
]


def main() -> None:
    live = api_key_present()
    mode = "запрос к Claude" if live else "локальный расчёт (ключа нет)"
    print(f"Режим: {mode}\n")

    for title, snapshot in EXAMPLES:
        print("=" * 60)
        print(title)
        print("=" * 60)
        win = analyze_first_impression(snapshot) if live else build_fallback_first_win(snapshot)
        print(render_first_win(win, snapshot.owner_name))
        print()


if __name__ == "__main__":
    main()
