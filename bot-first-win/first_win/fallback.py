"""Запасной расчёт «Первой победы» без обращения к Claude.

Зачем: это первое впечатление клиента от продукта. Если в этот момент отвалится
сеть или ключ API, клиент не должен увидеть ошибку — он должен увидеть три
факта о своём бизнесе. Считаем их из тех же цифр, обычной арифметикой.
"""

from __future__ import annotations

from .models import BusinessSnapshot, FirstWin


def _money(value: float, currency: str) -> str:
    """1234567.0 → '1 234 567 ₽'."""
    return f"{value:,.0f}".replace(",", " ") + f" {currency}"


def _pick_positive(s: BusinessSnapshot) -> str:
    """Первый факт обязан быть хорошим — выбираем лучшее из того, что есть."""
    growth = s.growth
    if growth is not None and growth > 0:
        return f"Выручка выросла на {growth:.0f}% к прошлому периоду — до {_money(s.revenue, s.currency)}."

    margin = s.margin
    if margin is not None and margin >= 20:
        return f"Маржа {margin:.0f}% — это здоровый уровень, бизнес зарабатывает."

    runway = s.runway_days
    if runway is not None and runway >= 60:
        return f"Запас кассы — {runway} дней при текущих расходах. Подушка есть."

    if s.profit > 0:
        return f"За {s.period_label} бизнес в плюсе: {_money(s.profit, s.currency)}."

    if s.revenue > 0:
        return f"Выручка за {s.period_label} — {_money(s.revenue, s.currency)}. Есть с чем работать."

    return "Данные подключены и считаются автоматически — дальше всё будет наглядно."


def _pick_observation(s: BusinessSnapshot) -> str:
    margin = s.margin
    if margin is not None and margin < 0:
        # «Остаётся минус 28 рублей» — так не говорят. Разворачиваем фразу.
        return (
            f"На каждые 100 {s.currency} выручки уходит {100 - margin:.0f} {s.currency} расходов — "
            f"за {s.period_label} бизнес потратил больше, чем заработал."
        )
    if margin is not None:
        return (
            f"Из каждых 100 {s.currency} выручки в бизнесе остаётся {margin:.0f} {s.currency} — "
            f"это ваша маржа за {s.period_label}."
        )

    burn = s.daily_burn
    if burn is not None:
        return f"Расходы идут со скоростью примерно {_money(burn, s.currency)} в день."

    return f"Расходы за {s.period_label} — {_money(s.expenses, s.currency)}."


def _pick_risk_and_action(s: BusinessSnapshot) -> tuple[str, str]:
    """Возвращает (риск, действие на сегодня).

    Риск ровно один — самый весомый. Порядок проверок здесь и есть приоритет:
    убыток важнее просрочки, если сбор долгов его не закрывает.
    """
    loss = -s.profit
    if loss > 0 and s.overdue_receivables < loss:
        return (
            f"Расходы превысили выручку на {_money(loss, s.currency)} за {s.period_label}. "
            "Даже если собрать все долги, дыра останется.",
            "Возьмите пять самых крупных расходов за месяц и отметьте те, без которых бизнес проживёт.",
        )

    if s.overdue_receivables > 0:
        share = ""
        if s.revenue > 0:
            share = f" Это {s.overdue_receivables / s.revenue * 100:.0f}% от выручки за период."
        return (
            f"Просроченная дебиторка — {_money(s.overdue_receivables, s.currency)}.{share} "
            "Эти деньги уже заработаны, но лежат не у вас.",
            "Выберите самого крупного должника и позвоните ему сегодня.",
        )

    runway = s.runway_days
    if runway is not None and runway < 45:
        return (
            f"Кассы хватит примерно на {runway} дней при текущих расходах.",
            "Посмотрите три самых крупных расхода за месяц и решите, какой можно сдвинуть.",
        )

    margin = s.margin
    if margin is not None and margin < 15:
        return (
            f"Маржа {margin:.0f}% — тонко. Любой скачок расходов съест прибыль.",
            "Возьмите один товар или услугу и посчитайте по нему себестоимость целиком.",
        )

    if s.receivables > 0:
        return (
            f"В дебиторке {_money(s.receivables, s.currency)} — деньги в пути.",
            "Проверьте, по всем ли отгрузкам выставлены счета.",
        )

    return (
        "Явных провалов в цифрах нет — стоит следить за динамикой.",
        "Загляните в отчёт в конце недели и сравните с этой неделей.",
    )


def build_fallback_first_win(snapshot: BusinessSnapshot) -> FirstWin:
    """Считает три факта локально. Никогда не бросает исключение."""
    risk, action = _pick_risk_and_action(snapshot)
    return FirstWin(
        positive=_pick_positive(snapshot),
        observation=_pick_observation(snapshot),
        risk=risk,
        action_today=action,
        source="fallback",
    )
