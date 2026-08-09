"""Входные данные и результат «Первой победы».

Здесь намеренно нет ничего про Telegram и про Claude — только структуры данных,
чтобы модуль было легко подключить к любому боту.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class BusinessSnapshot:
    """Срез бизнеса за период — то, что бот уже умеет считать из таблицы.

    Все суммы в одной валюте. Значения, которых нет, оставляйте None —
    анализ подстроится и не станет выдумывать недостающее.
    """

    revenue: float                      # выручка за период
    expenses: float                     # расходы за период
    cash: float                         # деньги на счетах сейчас
    receivables: float = 0.0            # дебиторка всего
    overdue_receivables: float = 0.0    # из них просроченная
    prev_revenue: float | None = None   # выручка за предыдущий период
    company: str | None = None
    owner_name: str | None = None
    period_label: str = "последние 30 дней"
    currency: str = "₽"

    @property
    def profit(self) -> float:
        return self.revenue - self.expenses

    @property
    def margin(self) -> float | None:
        """Маржа в процентах. None, если выручки нет — делить не на что."""
        if self.revenue <= 0:
            return None
        return self.profit / self.revenue * 100

    @property
    def growth(self) -> float | None:
        """Прирост выручки к прошлому периоду, %."""
        if not self.prev_revenue or self.prev_revenue <= 0:
            return None
        return (self.revenue - self.prev_revenue) / self.prev_revenue * 100

    @property
    def daily_burn(self) -> float | None:
        """Сколько денег уходит в день. None, если расходов нет."""
        if self.expenses <= 0:
            return None
        return self.expenses / 30

    @property
    def runway_days(self) -> int | None:
        """На сколько дней хватит кассы при текущих расходах."""
        burn = self.daily_burn
        if not burn:
            return None
        return int(self.cash / burn)


@dataclass(frozen=True)
class FirstWin:
    """Три факта о бизнесе. Порядок фиксирован: сначала хорошее.

    Схема ответа модели повторяет эти четыре поля — «первый факт всегда
    позитивный» гарантируется структурой, а не надеждой на промпт.
    """

    positive: str       # что уже хорошо
    observation: str    # нейтральное наблюдение
    risk: str           # зона роста
    action_today: str   # одно конкретное действие на сегодня
    source: str         # "claude" или "fallback" — для логов и метрик
